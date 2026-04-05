'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Hls from 'hls.js'
import { getResumePosition, saveProgress, beaconProgress, buildPayload } from '@/lib/watch-progress'

const TMDB_KEY = '5c242b6eeca95f02957505a67a488635'

function fmtTime(s: number) {
  if (!isFinite(s) || s < 0) s = 0
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
    : `${m}:${sec.toString().padStart(2, '0')}`
}

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
  const scrubberRef = useRef<HTMLDivElement>(null)
  const lastSaveTs = useRef(0)
  const profileIdRef = useRef<string | null>(null)
  const resumeRef = useRef<number | null>(null)
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const doubleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tapCount = useRef(0)

  const [src, setSrc] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [epTitle, setEpTitle] = useState('')
  const [ready, setReady] = useState(false)
  const [fit, setFit] = useState<'cover' | 'contain'>('cover')
  const [isLandscape, setIsLandscape] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Player state
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(true)
  const [ct, setCt] = useState(0)
  const [dur, setDur] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [showControls, setShowControls] = useState(true)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [locked, setLocked] = useState(false)
  const [seekIndicator, setSeekIndicator] = useState<{ side: 'left' | 'right' } | null>(null)

  // ── Service worker cleanup ─────────────────────────────────────────────
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

  // ── Profile ID ─────────────────────────────────────────────────────────
  useEffect(() => {
    profileIdRef.current = localStorage.getItem('streamcorn_profile_id')
  }, [])

  // ── Fetch source + resume ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function load() {
      const pid = localStorage.getItem('streamcorn_profile_id')
      profileIdRef.current = pid
      const qp = new URLSearchParams({ tmdb_id: id, type })
      if (type === 'tv') { qp.set('season_number', String(season)); qp.set('episode_number', String(episode)) }
      const [srcRes, detailRes, resume] = await Promise.all([
        fetch(`/api/video-source?${qp}`).then(r => r.json()),
        fetch(`https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_KEY}`).then(r => r.json()),
        pid ? getResumePosition(pid, tmdbId, mediaType, seasonNum, episodeNum) : null,
      ])
      if (cancelled) return
      setSrc(srcRes.url || null)
      setTitle(detailRes.title || detailRes.name || '')
      if (type === 'tv') setEpTitle(`S${season}:E${episode}`)
      resumeRef.current = resume
      setReady(true)
    }
    load()
    return () => { cancelled = true }
  }, [id, type, season, episode, tmdbId, mediaType, seasonNum, episodeNum])

  // ── Beacon save ────────────────────────────────────────────────────────
  const doBeacon = useCallback(() => {
    const v = videoRef.current; const pid = profileIdRef.current
    if (!v || !pid) return
    if (!isFinite(v.duration) || v.duration < 10 || v.currentTime < 5) return
    beaconProgress(buildPayload(pid, tmdbId, mediaType, v.currentTime, v.duration, seasonNum, episodeNum))
  }, [tmdbId, mediaType, seasonNum, episodeNum])

  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'hidden') doBeacon() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', doBeacon)
    window.addEventListener('beforeunload', doBeacon)
    return () => { doBeacon(); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', doBeacon); window.removeEventListener('beforeunload', doBeacon) }
  }, [doBeacon])

  // ── HLS + event listeners ──────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current
    if (!v || !src) return

    const startPlayback = () => {
      if (resumeRef.current != null && resumeRef.current > 0) v.currentTime = resumeRef.current
      v.play().catch(() => {})
    }

    const onPlay = () => setPlaying(true)
    const onPause = () => {
      setPlaying(false)
      const pid = profileIdRef.current
      if (pid && isFinite(v.duration) && v.duration > 10 && v.currentTime > 5)
        saveProgress(buildPayload(pid, tmdbId, mediaType, v.currentTime, v.duration, seasonNum, episodeNum))
    }
    const onSeeked = () => {
      const pid = profileIdRef.current
      if (pid && isFinite(v.duration) && v.duration > 10 && v.currentTime > 5)
        saveProgress(buildPayload(pid, tmdbId, mediaType, v.currentTime, v.duration, seasonNum, episodeNum))
    }
    const onWaiting = () => setLoading(true)
    const onCanPlay = () => setLoading(false)
    const onPlaying = () => setLoading(false)
    const onTimeUpdate = () => {
      if (!isScrubbing) { setCt(v.currentTime); setDur(v.duration || 0) }
      if (v.buffered.length > 0) setBuffered((v.buffered.end(v.buffered.length - 1) / (v.duration || 1)) * 100)
      const now = Date.now()
      if (now - lastSaveTs.current >= 10_000 && v.currentTime > 5 && v.duration > 10) {
        lastSaveTs.current = now
        const pid = profileIdRef.current
        if (pid) saveProgress(buildPayload(pid, tmdbId, mediaType, v.currentTime, v.duration, seasonNum, episodeNum))
      }
    }

    v.addEventListener('play', onPlay); v.addEventListener('pause', onPause)
    v.addEventListener('seeked', onSeeked); v.addEventListener('waiting', onWaiting)
    v.addEventListener('canplay', onCanPlay); v.addEventListener('playing', onPlaying)
    v.addEventListener('timeupdate', onTimeUpdate)

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true })
      hls.loadSource(src); hls.attachMedia(v)
      hls.on(Hls.Events.MANIFEST_PARSED, startPlayback)
      hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) { if (d.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad(); else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError() } })
      hlsRef.current = hls
    } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = src; v.addEventListener('loadedmetadata', startPlayback)
    }

    return () => {
      v.removeEventListener('play', onPlay); v.removeEventListener('pause', onPause)
      v.removeEventListener('seeked', onSeeked); v.removeEventListener('waiting', onWaiting)
      v.removeEventListener('canplay', onCanPlay); v.removeEventListener('playing', onPlaying)
      v.removeEventListener('timeupdate', onTimeUpdate)
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    }
  }, [src, tmdbId, mediaType, seasonNum, episodeNum])

  // ── Orientation + fullscreen ───────────────────────────────────────────
  useEffect(() => {
    const check = () => setIsLandscape(window.innerWidth > window.innerHeight)
    check(); window.addEventListener('resize', check)
    const onFs = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    document.addEventListener('webkitfullscreenchange', onFs)
    return () => { window.removeEventListener('resize', check); document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('webkitfullscreenchange', onFs); try { (screen.orientation as any)?.unlock?.() } catch {}; try { if (document.fullscreenElement) document.exitFullscreen() } catch {} }
  }, [])

  useEffect(() => {
    const timer = setTimeout(async () => {
      const el = document.getElementById('player-root')
      if (!el) return
      try { if (el.requestFullscreen) await el.requestFullscreen(); else if ((el as any).webkitRequestFullscreen) await (el as any).webkitRequestFullscreen() } catch {}
      try { await (screen.orientation as any)?.lock?.('landscape') } catch {}
    }, 300)
    return () => clearTimeout(timer)
  }, [ready])

  // ── Controls auto-hide ─────────────────────────────────────────────────
  const resetTimer = useCallback(() => {
    if (controlsTimer.current) clearTimeout(controlsTimer.current)
    setShowControls(true)
    controlsTimer.current = setTimeout(() => setShowControls(false), 4000)
  }, [])

  // ── Tap handling: single = toggle controls, double = seek ──────────────
  const handleTap = (e: React.TouchEvent) => {
    if (locked) return
    const clientX = e.changedTouches[0].clientX
    const halfW = window.innerWidth / 2
    tapCount.current++
    if (tapCount.current === 1) {
      doubleTapTimer.current = setTimeout(() => {
        tapCount.current = 0
        if (showControls) { setShowControls(false); if (controlsTimer.current) clearTimeout(controlsTimer.current) }
        else resetTimer()
      }, 250)
    } else if (tapCount.current === 2) {
      if (doubleTapTimer.current) clearTimeout(doubleTapTimer.current)
      tapCount.current = 0
      const v = videoRef.current; if (!v) return
      const delta = clientX < halfW ? -10 : 10
      v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta))
      setSeekIndicator({ side: delta < 0 ? 'left' : 'right' })
      setTimeout(() => setSeekIndicator(null), 600)
      resetTimer()
    }
  }

  // ── Player actions ─────────────────────────────────────────────────────
  const togglePlay = () => { const v = videoRef.current; if (!v) return; if (v.paused) { v.play(); resetTimer() } else v.pause() }
  const seekBy = (d: number) => { const v = videoRef.current; if (!v) return; v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + d)); resetTimer() }
  const goLandscape = async () => {
    const el = document.getElementById('player-root'); if (!el) return
    try { if (el.requestFullscreen) await el.requestFullscreen(); else if ((el as any).webkitRequestFullscreen) await (el as any).webkitRequestFullscreen() } catch {}
    try { await (screen.orientation as any)?.lock?.('landscape') } catch {}
    videoRef.current?.play().catch(() => {})
  }

  // ── Scrubber ───────────────────────────────────────────────────────────
  const scrubTo = useCallback((clientX: number) => {
    const bar = scrubberRef.current; const v = videoRef.current
    if (!bar || !v) return
    const rect = bar.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    v.currentTime = ratio * (v.duration || 0)
    setCt(v.currentTime)
  }, [])
  const onScrubStart = (e: React.TouchEvent) => { e.stopPropagation(); e.preventDefault(); setIsScrubbing(true); if (controlsTimer.current) clearTimeout(controlsTimer.current); scrubTo(e.touches[0].clientX) }
  const onScrubMove = (e: React.TouchEvent) => { e.stopPropagation(); e.preventDefault(); scrubTo(e.touches[0].clientX) }
  const onScrubEnd = (e: React.TouchEvent) => { e.stopPropagation(); e.preventDefault(); setIsScrubbing(false); resetTimer() }
  const onScrubMouse = (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault(); setIsScrubbing(true)
    if (controlsTimer.current) clearTimeout(controlsTimer.current); scrubTo(e.clientX)
    const onMove = (ev: MouseEvent) => { ev.preventDefault(); scrubTo(ev.clientX) }
    const onUp = () => { setIsScrubbing(false); resetTimer(); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }

  const stopProp = (e: React.TouchEvent | React.MouseEvent) => e.stopPropagation()
  const progress = dur > 0 ? (ct / dur) * 100 : 0

  // ── Loading ────────────────────────────────────────────────────────────
  if (!ready || !src) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
        <div style={{ width: 48, height: 48, border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#e50914', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  const showRotatePrompt = !isLandscape && !isFullscreen

  return (
    <div id="player-root" style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 9999 }} onTouchEnd={handleTap}>
      {/* Video */}
      <video ref={videoRef} playsInline autoPlay style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: fit, background: '#000' }} />

      {/* Loading spinner */}
      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 5 }}>
          <div style={{ width: 48, height: 48, border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#e50914', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      )}

      {/* Double tap indicators */}
      {seekIndicator && (
        <div style={{
          position: 'absolute', top: '50%', transform: 'translateY(-50%)',
          [seekIndicator.side === 'left' ? 'left' : 'right']: 48,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', borderRadius: 9999,
          padding: '8px 16px', pointerEvents: 'none', zIndex: 15,
        }}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{seekIndicator.side === 'left' ? '-' : '+'}10s</span>
        </div>
      )}

      {/* Controls overlay */}
      {!locked && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          opacity: showControls && !loading ? 1 : 0, pointerEvents: showControls && !loading ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
        }}>
          {/* Top bar */}
          <div onTouchEnd={stopProp} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)' }}>
            <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#fff', padding: 0, cursor: 'pointer' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}><path d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: '#fff', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{title}</p>
              {epTitle && <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: 0 }}>{epTitle}</p>}
            </div>
            <button onClick={() => setFit(f => f === 'cover' ? 'contain' : 'cover')} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, padding: '5px 10px', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              {fit === 'cover' ? '16:9' : 'Fill'}
            </button>
            <button onClick={() => { setLocked(true); setShowControls(false) }} style={{ background: 'none', border: 'none', color: '#fff', padding: 0, cursor: 'pointer' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.5}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
            </button>
          </div>

          {/* Center controls */}
          <div onTouchEnd={stopProp} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 56, alignSelf: 'center' }}>
            <button onClick={() => seekBy(-10)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M12.5 8.5l-4 3.5 4 3.5M4 12a8 8 0 1116 0 8 8 0 01-16 0z" /></svg>
              <span style={{ fontSize: 10, marginTop: -4 }}>10</span>
            </button>
            <button onClick={togglePlay} style={{ width: 64, height: 64, background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', border: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
              {playing
                ? <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
                : <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>}
            </button>
            <button onClick={() => seekBy(10)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M11.5 8.5l4 3.5-4 3.5M20 12a8 8 0 11-16 0 8 8 0 0116 0z" /></svg>
              <span style={{ fontSize: 10, marginTop: -4 }}>10</span>
            </button>
          </div>

          {/* Bottom bar */}
          <div onTouchEnd={stopProp} style={{ padding: '0 20px 16px', background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)' }}>
            {/* Scrubber */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontVariantNumeric: 'tabular-nums', width: 48 }}>{fmtTime(ct)}</span>
              <div ref={scrubberRef} style={{ flex: 1, padding: '12px 0', touchAction: 'none', cursor: 'pointer' }}
                onTouchStart={onScrubStart} onTouchMove={onScrubMove} onTouchEnd={onScrubEnd} onMouseDown={onScrubMouse}>
                <div style={{ width: '100%', height: isScrubbing ? 6 : 3, background: 'rgba(255,255,255,0.2)', borderRadius: 9999, position: 'relative', transition: 'height 0.15s' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${buffered}%`, background: 'rgba(255,255,255,0.15)', borderRadius: 9999 }} />
                  <div style={{ height: '100%', width: `${progress}%`, background: '#e50914', borderRadius: 9999 }} />
                  <div style={{
                    position: 'absolute', top: '50%', left: `${progress}%`, transform: 'translate(-50%, -50%)',
                    width: isScrubbing ? 18 : 12, height: isScrubbing ? 18 : 12,
                    background: '#e50914', borderRadius: '50%', boxShadow: '0 2px 8px rgba(0,0,0,0.5)', transition: 'width 0.15s, height 0.15s',
                  }} />
                </div>
              </div>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontVariantNumeric: 'tabular-nums', width: 52, textAlign: 'right' }}>-{fmtTime(Math.max(0, dur - ct))}</span>
            </div>
          </div>
        </div>
      )}

      {/* Lock button */}
      {locked && (
        <button onClick={() => { setLocked(false); resetTimer() }} style={{
          position: 'absolute', top: 16, left: 20, zIndex: 20, padding: '8px 16px',
          background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', border: 'none', borderRadius: 9999,
          color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
          Unlock
        </button>
      )}

      {/* Rotate prompt */}
      {showRotatePrompt && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.5} style={{ opacity: 0.7 }}>
            <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 014-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 01-4 4H3" />
          </svg>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>Rotate your device to landscape</p>
          <button onClick={goLandscape} style={{ background: '#e50914', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 32px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            Enter Fullscreen
          </button>
        </div>
      )}
    </div>
  )
}
