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

  // ── Save helpers ───────────────────────────────────────────────────────
  const doSave = useCallback(() => {
    const v = videoRef.current
    const pid = profileIdRef.current
    if (!v || !pid) return
    const d = v.duration || 0
    const c = v.currentTime || 0
    if (!isFinite(d) || d < 10 || c < 5) return
    lastSaveTs.current = Date.now()
    saveProgress(buildPayload(pid, tmdbId, mediaType, c, d, seasonNum, episodeNum))
  }, [tmdbId, mediaType, seasonNum, episodeNum])

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
      // Resume from saved position
      if (resumeRef.current != null && resumeRef.current > 0) {
        v.currentTime = resumeRef.current
      }
      v.play().catch(() => {})
    }

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
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    }
  }, [src])

  // ── Video event listeners (progress save, etc) ─────────────────────────
  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const onPause = () => doSave()
    const onSeeked = () => doSave()
    const onTimeUpdate = () => {
      const now = Date.now()
      if (now - lastSaveTs.current >= 10_000 && v.currentTime > 5 && v.duration > 10) {
        lastSaveTs.current = now
        doSave()
      }
    }

    v.addEventListener('pause', onPause)
    v.addEventListener('seeked', onSeeked)
    v.addEventListener('timeupdate', onTimeUpdate)

    return () => {
      v.removeEventListener('pause', onPause)
      v.removeEventListener('seeked', onSeeked)
      v.removeEventListener('timeupdate', onTimeUpdate)
    }
  }, [doSave])

  // ── Auto fullscreen landscape on load ──────────────────────────────────
  useEffect(() => {
    // Lock orientation immediately (works without user gesture on some browsers)
    try { (screen.orientation as any)?.lock?.('landscape').catch(() => {}) } catch {}

    return () => {
      try { (screen.orientation as any)?.unlock?.() } catch {}
      try { if (document.fullscreenElement) document.exitFullscreen() } catch {}
    }
  }, [])

  // Enter fullscreen on first user interaction (required by mobile browsers)
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
    })()

    // Also play on gesture
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
        style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
      />
    </div>
  )
}
