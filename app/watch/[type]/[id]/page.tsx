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

  const [src, setSrc] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [ready, setReady] = useState(false)
  const [fit, setFit] = useState<'cover' | 'contain'>('cover')
  const [isLandscape, setIsLandscape] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

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

  // ── Beacon save for page leave ─────────────────────────────────────────
  const doBeacon = useCallback(() => {
    const v = videoRef.current
    const pid = profileIdRef.current
    if (!v || !pid) return
    const d = v.duration || 0
    const c = v.currentTime || 0
    if (!isFinite(d) || d < 10 || c < 5) return
    beaconProgress(buildPayload(pid, tmdbId, mediaType, c, d, seasonNum, episodeNum))
  }, [tmdbId, mediaType, seasonNum, episodeNum])

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

  // ── Attach hls.js + progress listeners ─────────────────────────────────
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

  // ── Orientation + fullscreen tracking ──────────────────────────────────
  useEffect(() => {
    const checkOrientation = () => {
      const landscape = window.innerWidth > window.innerHeight
      setIsLandscape(landscape)
    }
    checkOrientation()
    window.addEventListener('resize', checkOrientation)

    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('webkitfullscreenchange', onFullscreenChange)

    return () => {
      window.removeEventListener('resize', checkOrientation)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange)
      try { (screen.orientation as any)?.unlock?.() } catch {}
      try { if (document.fullscreenElement) document.exitFullscreen() } catch {}
    }
  }, [])

  // Auto-enter fullscreen + lock landscape on mount
  useEffect(() => {
    const tryFullscreenLandscape = async () => {
      const el = document.getElementById('player-root')
      if (!el) return
      try {
        if (el.requestFullscreen) await el.requestFullscreen()
        else if ((el as any).webkitRequestFullscreen) await (el as any).webkitRequestFullscreen()
      } catch {}
      try { await (screen.orientation as any)?.lock?.('landscape') } catch {}
    }
    // Small delay to let the DOM settle
    const timer = setTimeout(tryFullscreenLandscape, 300)
    return () => clearTimeout(timer)
  }, [ready])

  // ── Go landscape (user tap) ────────────────────────────────────────────
  const goLandscape = async () => {
    const el = document.getElementById('player-root')
    if (!el) return
    try {
      if (el.requestFullscreen) await el.requestFullscreen()
      else if ((el as any).webkitRequestFullscreen) await (el as any).webkitRequestFullscreen()
    } catch {}
    try { await (screen.orientation as any)?.lock?.('landscape') } catch {}
    videoRef.current?.play().catch(() => {})
  }

  // ── Loading ────────────────────────────────────────────────────────────
  if (!ready || !src) {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
        background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      }}>
        <div style={{
          width: 48, height: 48, border: '3px solid rgba(255,255,255,0.2)',
          borderTopColor: '#e50914', borderRadius: '50%', animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // ── Player ─────────────────────────────────────────────────────────────
  const showRotatePrompt = !isLandscape && !isFullscreen

  return (
    <div
      id="player-root"
      style={{
        position: 'fixed', top: 0, left: 0,
        width: '100vw', height: '100vh',
        background: '#000', zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {/* Video — always rendered, centered */}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        controls
        style={{
          width: '100%', height: '100%',
          objectFit: fit,
          background: '#000',
          display: 'block',
        }}
      />

      {/* Fit toggle */}
      <button
        onClick={() => setFit(f => f === 'cover' ? 'contain' : 'cover')}
        style={{
          position: 'absolute', top: 12, right: 12, zIndex: 10,
          background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: 8,
          padding: '6px 12px', color: '#fff', fontSize: 11, fontWeight: 600,
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        {fit === 'cover' ? '16:9' : 'Fill'}
      </button>

      {/* Rotate prompt — shown only in portrait + not fullscreen */}
      {showRotatePrompt && (
        <div
          style={{
            position: 'absolute', inset: 0, zIndex: 20,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 16,
          }}
        >
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.5} style={{ opacity: 0.7 }}>
            <path d="M17 1l4 4-4 4" />
            <path d="M3 11V9a4 4 0 014-4h14" />
            <path d="M7 23l-4-4 4-4" />
            <path d="M21 13v2a4 4 0 01-4 4H3" />
          </svg>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center' }}>
            Rotate your device to landscape
          </p>
          <button
            onClick={goLandscape}
            style={{
              background: '#e50914', color: '#fff', border: 'none',
              borderRadius: 12, padding: '12px 32px', fontSize: 14, fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Enter Fullscreen
          </button>
        </div>
      )}
    </div>
  )
}
