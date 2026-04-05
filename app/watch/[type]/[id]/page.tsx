'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Hls from 'hls.js'
import { getResumePosition, saveProgress, beaconProgress, buildPayload } from '@/lib/watch-progress'

const TMDB_KEY = '5c242b6eeca95f02957505a67a488635'

export default function WatchPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()

  const type = params.type as string
  const id = params.id as string
  const season = parseInt(searchParams.get('s') || '1')
  const episode = parseInt(searchParams.get('e') || '1')
  const tmdbId = parseInt(id)
  const mediaType = type as 'movie' | 'tv'
  const seasonNum = type === 'tv' ? season : undefined
  const episodeNum = type === 'tv' ? episode : undefined

  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const lastSaveTs = useRef(0)
  const profileIdRef = useRef<string | null>(null)
  const resumeRef = useRef<number | null>(null)
  const hasEnteredFullscreen = useRef(false)

  const [src, setSrc] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [ready, setReady] = useState(false)
  const [fit, setFit] = useState<'cover' | 'contain'>('cover')

  // ── Cleanup old service workers ────────────────────────────────────────
  useEffect(() => {
    (async () => {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        for (const reg of regs) await reg.unregister()
      }
      const keys = await caches.keys()
      for (const key of keys) await caches.delete(key)
    })()
  }, [])

  // ── Read profile ID ────────────────────────────────────────────────────
  useEffect(() => {
    profileIdRef.current = localStorage.getItem('streamcorn_profile_id')
  }, [])

  // ── Fetch source + resume position ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function load() {
      const pid = localStorage.getItem('streamcorn_profile_id')
      profileIdRef.current = pid

      const queryParams = new URLSearchParams({ tmdb_id: id, type })
      if (type === 'tv') {
        queryParams.set('season_number', String(season))
        queryParams.set('episode_number', String(episode))
      }

      const [srcRes, detailRes, resume] = await Promise.all([
        fetch(`/api/video-source?${queryParams}`).then(r => r.json()),
        fetch(`https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_KEY}`).then(r => r.json()),
        pid ? getResumePosition(pid, tmdbId, mediaType, seasonNum, episodeNum) : null,
      ])

      if (cancelled) return
      setSrc(srcRes.url || null)
      setTitle(detailRes.title || detailRes.name || '')
      resumeRef.current = resume
      setReady(true)
    }

    load()
    return () => { cancelled = true }
  }, [id, type, season, episode, tmdbId, mediaType, seasonNum, episodeNum])

  // ── Beacon save for page leave ───────────────────────────────────────
  const doBeacon = useCallback(() => {
    const v = videoRef.current
    const pid = profileIdRef.current
    if (!v || !pid) return
    const d = v.duration || 0
    const c = v.currentTime || 0
    if (!isFinite(d) || d < 10 || c < 5) return
    beaconProgress(buildPayload(pid, tmdbId, mediaType, c, d, seasonNum, episodeNum))
  }, [tmdbId, mediaType, seasonNum, episodeNum])

  // ── Save on visibility change / page leave ─────────────────────────────
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'hidden') doBeacon() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', doBeacon)
    window.addEventListener('beforeunload', doBeacon)
    return () => {
      doBeacon()
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', doBeacon)
      window.removeEventListener('beforeunload', doBeacon)
    }
  }, [doBeacon])

  // ── Attach hls.js ──────────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current
    if (!v || !src) return

    const startPlayback = () => {
      if (resumeRef.current != null && resumeRef.current > 0) {
        v.currentTime = resumeRef.current
      }
      v.play().catch(() => {})
    }

    const onPause = () => {
      const pid = profileIdRef.current
      if (!pid || !isFinite(v.duration) || v.duration < 10 || v.currentTime < 5) return
      saveProgress(buildPayload(pid, tmdbId, mediaType, v.currentTime, v.duration, seasonNum, episodeNum))
    }
    const onSeeked = () => onPause()
    const onTimeUpdate = () => {
      const now = Date.now()
      if (now - lastSaveTs.current >= 10_000 && v.currentTime > 5 && v.duration > 10) {
        lastSaveTs.current = now
        const pid = profileIdRef.current
        if (pid) saveProgress(buildPayload(pid, tmdbId, mediaType, v.currentTime, v.duration, seasonNum, episodeNum))
      }
    }

    v.addEventListener('pause', onPause)
    v.addEventListener('seeked', onSeeked)
    v.addEventListener('timeupdate', onTimeUpdate)

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true })
      hls.loadSource(src)
      hls.attachMedia(v)
      hls.on(Hls.Events.MANIFEST_PARSED, startPlayback)
      hls.on(Hls.Events.ERROR, (_, d) => {
        if (d.fatal) {
          if (d.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad()
          else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError()
        }
      })
      hlsRef.current = hls
    } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = src
      v.addEventListener('loadedmetadata', startPlayback)
    }

    return () => {
      v.removeEventListener('pause', onPause)
      v.removeEventListener('seeked', onSeeked)
      v.removeEventListener('timeupdate', onTimeUpdate)
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    }
  }, [src, tmdbId, mediaType, seasonNum, episodeNum])

  // ── Force landscape + fullscreen ───────────────────────────────────────
  useEffect(() => {
    // CSS transform for immediate landscape (no user gesture needed)
    document.documentElement.classList.add('force-landscape')

    // Try native orientation lock
    const tryLock = async () => {
      try { await (screen.orientation as any)?.lock?.('landscape') } catch {}
    }
    tryLock()

    // Re-lock if user rotates to portrait
    const onOrientationChange = () => {
      if (screen.orientation?.type?.includes('portrait')) {
        tryLock()
      }
    }
    screen.orientation?.addEventListener('change', onOrientationChange)

    return () => {
      document.documentElement.classList.remove('force-landscape')
      screen.orientation?.removeEventListener('change', onOrientationChange)
      try { (screen.orientation as any)?.unlock?.() } catch {}
      try { if (document.fullscreenElement) document.exitFullscreen() } catch {}
    }
  }, [])

  // Enter fullscreen on first tap (upgrades CSS hack to real fullscreen)
  const enterFullscreen = useCallback(() => {
    if (hasEnteredFullscreen.current) return
    hasEnteredFullscreen.current = true

    const el = document.querySelector('.player-root') as HTMLElement
    if (!el) return

    ;(async () => {
      try {
        if (el.requestFullscreen) await el.requestFullscreen()
        else if ((el as any).webkitRequestFullscreen) await (el as any).webkitRequestFullscreen()
      } catch {}
      try { await (screen.orientation as any)?.lock?.('landscape') } catch {}
      document.documentElement.classList.remove('force-landscape')
    })()

    videoRef.current?.play().catch(() => {})
  }, [])

  // ── Loading state ──────────────────────────────────────────────────────
  if (!ready || !src) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-[9999]">
        <div className="w-12 h-12 border-3 border-white/20 border-t-[#e50914] rounded-full animate-spin" />
      </div>
    )
  }

  // ── Player ─────────────────────────────────────────────────────────────
  return (
    <div
      className="player-root fixed inset-0 bg-black z-[9999]"
      onClick={enterFullscreen}
      onTouchStart={enterFullscreen}
    >
      <video
        ref={videoRef}
        playsInline
        autoPlay
        controls
        style={{ width: '100%', height: '100%', objectFit: fit, background: '#000' }}
      />

      {/* Fit toggle button */}
      <button
        onClick={(e) => { e.stopPropagation(); setFit(f => f === 'cover' ? 'contain' : 'cover') }}
        onTouchStart={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 10000,
          background: 'rgba(0,0,0,0.6)',
          border: 'none',
          borderRadius: 8,
          padding: '6px 12px',
          color: '#fff',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        {fit === 'cover' ? '16:9' : 'Fill'}
      </button>
    </div>
  )
}
