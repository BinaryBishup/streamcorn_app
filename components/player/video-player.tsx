'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Hls from 'hls.js'
import './player.css'
import { saveProgress, beaconProgress, buildPayload } from '@/lib/watch-progress'

const HLS_KEY_HEX = process.env.NEXT_PUBLIC_HLS_KEY || ''

function hexToBytes(hex: string): Uint8Array {
  const b = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) b[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  return b
}

// ── Types ────────────────────────────────────────────────────────────────
export interface Episode {
  id: number
  episode_number: number
  name: string
  still_path: string | null
  runtime?: number | null
}

export interface SeasonInfo {
  season_number: number
  name: string
}

export interface VideoPlayerProps {
  src: string
  title: string
  epTitle?: string
  mediaType: 'movie' | 'tv'
  tmdbId: number
  seasonNumber?: number
  episodeNumber?: number
  resumePosition?: number | null
  episodes?: Episode[]
  seasons?: SeasonInfo[]
  currentSeason?: number
  hasNext?: boolean
  onBack: () => void
  onNextEpisode?: () => void
  onSelectEpisode?: (season: number, ep: number) => void
}

// ── Helpers ──────────────────────────────────────────────────────────────
function fmtTime(s: number) {
  if (!isFinite(s) || s < 0) s = 0
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
    : `${m}:${sec.toString().padStart(2, '0')}`
}

// ── Component ────────────────────────────────────────────────────────────
export default function VideoPlayer({
  src, title, epTitle, mediaType, tmdbId,
  seasonNumber, episodeNumber, resumePosition,
  episodes = [], seasons = [], currentSeason = 1,
  hasNext = false,
  onBack, onNextEpisode, onSelectEpisode,
}: VideoPlayerProps) {
  const videoContainerRef = useRef<HTMLDivElement>(null)
  const videoEl = useRef<HTMLVideoElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const scrubberRef = useRef<HTMLDivElement>(null)
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const doubleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tapCount = useRef(0)
  const lastSaveTs = useRef(0)
  const profileIdRef = useRef<string | null>(null)

  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(true)
  const [ct, setCt] = useState(0)
  const [dur, setDur] = useState(0)
  const [buffered, setBuffered] = useState(0)

  const [showControls, setShowControls] = useState(true)
  const [locked, setLocked] = useState(false)
  const [fit, setFit] = useState<'contain' | 'cover'>('cover')
  const [isScrubbing, setIsScrubbing] = useState(false)

  const [showSkip, setShowSkip] = useState(false)
  const [showNextPrompt, setShowNextPrompt] = useState(false)
  const [seekIndicator, setSeekIndicator] = useState<{ side: 'left' | 'right'; seconds: number } | null>(null)

  const [showEps, setShowEps] = useState(false)
  const [sheetSeason, setSheetSeason] = useState(currentSeason)
  const [sheetEpisodes, setSheetEpisodes] = useState<Episode[]>(episodes)
  const [showAudio, setShowAudio] = useState(false)
  const [audioTracks, setAudioTracks] = useState<{ id: number; label: string; enabled: boolean }[]>([])
  const [subsEnabled, setSubsEnabled] = useState(false)

  const progress = dur > 0 ? (ct / dur) * 100 : 0

  // ── Profile ID ─────────────────────────────────────────────────────────
  useEffect(() => {
    profileIdRef.current = localStorage.getItem('streamcorn_profile_id')
  }, [])

  // ── Save helpers ───────────────────────────────────────────────────────
  const doSave = useCallback(() => {
    const v = videoEl.current
    const pid = profileIdRef.current
    if (!v || !pid) return
    const d = v.duration || 0
    const c = v.currentTime || 0
    if (!isFinite(d) || d < 10 || c < 5) return
    lastSaveTs.current = Date.now()
    saveProgress(buildPayload(pid, tmdbId, mediaType, c, d, seasonNumber, episodeNumber))
  }, [tmdbId, mediaType, seasonNumber, episodeNumber])

  const doBeacon = useCallback(() => {
    const v = videoEl.current
    const pid = profileIdRef.current
    if (!v || !pid) return
    const d = v.duration || 0
    const c = v.currentTime || 0
    if (!isFinite(d) || d < 10 || c < 5) return
    beaconProgress(buildPayload(pid, tmdbId, mediaType, c, d, seasonNumber, episodeNumber))
  }, [tmdbId, mediaType, seasonNumber, episodeNumber])

  // ── Create video element + init hls.js ──────────────────────────────────
  useEffect(() => {
    const container = videoContainerRef.current
    if (!container) return

    // Create video element imperatively to avoid React lifecycle conflicts
    const v = document.createElement('video')
    v.playsInline = true
    v.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:' + fit
    container.appendChild(v)
    videoEl.current = v

    if (src.endsWith('.m3u8') && Hls.isSupported()) {
      const kb = hexToBytes(HLS_KEY_HEX)
      const CL = class extends Hls.DefaultConfig.loader {
        load(ctx: any, cfg: any, cb: any) {
          if (ctx.url.includes('data:text/plain') || ctx.type === 'key') {
            setTimeout(() => cb.onSuccess(
              { url: ctx.url, data: kb.buffer },
              { trequest: performance.now(), tfirst: performance.now(), tload: performance.now(), loaded: 16, total: 16 },
              ctx, null
            ), 0)
            return
          }
          super.load(ctx, cfg, cb)
        }
      }
      const hls = new Hls({ enableWorker: true, loader: CL as any })
      hls.loadSource(src)
      hls.attachMedia(v)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (resumePosition != null && resumePosition > 0) v.currentTime = resumePosition
        v.play().catch(() => {})
        setLoading(false)
      })
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
        setAudioTracks(hls.audioTracks.map((t, i) => ({
          id: i,
          label: t.name || t.lang?.toUpperCase() || `Track ${i + 1}`,
          enabled: i === hls.audioTrack,
        })))
      })
      hls.on(Hls.Events.ERROR, (_, d) => {
        if (d.fatal) {
          if (d.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad()
          else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError()
        }
      })
      hlsRef.current = hls
    } else {
      v.src = src
      if (resumePosition != null && resumePosition > 0) v.currentTime = resumePosition
      v.play().catch(() => {})
      setLoading(false)
    }

    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
      v.pause()
      v.removeAttribute('src')
      v.load()
      if (v.parentNode) v.parentNode.removeChild(v)
      videoEl.current = null
    }
  }, [src]) // Only re-init when src changes

  // ── Video event listeners ──────────────────────────────────────────────
  useEffect(() => {
    const v = videoEl.current
    if (!v) return

    const onPlay = () => setPlaying(true)
    const onPause = () => {
      setPlaying(false)
      const pid = profileIdRef.current
      if (pid) {
        const d = v.duration || 0
        const c = v.currentTime || 0
        if (isFinite(d) && d > 10 && c > 5) {
          saveProgress(buildPayload(pid, tmdbId, mediaType, c, d, seasonNumber, episodeNumber))
        }
      }
    }
    const onWaiting = () => setLoading(true)
    const onCanPlay = () => setLoading(false)
    const onPlaying = () => setLoading(false)
    const onTimeUpdate = () => {
      const c = v.currentTime || 0
      const d = v.duration || 0
      setCt(c)
      setDur(d)
      setPlaying(!v.paused)

      if (v.buffered.length > 0) {
        setBuffered((v.buffered.end(v.buffered.length - 1) / (d || 1)) * 100)
      }

      setShowSkip(c >= 15 && c < 75)
      if (mediaType === 'tv' && hasNext && d && c > d - 30) setShowNextPrompt(true)
      else setShowNextPrompt(false)

      const now = Date.now()
      if (now - lastSaveTs.current >= 10_000 && c > 5 && d > 10) {
        lastSaveTs.current = now
        const pid = profileIdRef.current
        if (pid) saveProgress(buildPayload(pid, tmdbId, mediaType, c, d, seasonNumber, episodeNumber))
      }
    }

    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('waiting', onWaiting)
    v.addEventListener('canplay', onCanPlay)
    v.addEventListener('playing', onPlaying)
    v.addEventListener('timeupdate', onTimeUpdate)

    return () => {
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('waiting', onWaiting)
      v.removeEventListener('canplay', onCanPlay)
      v.removeEventListener('playing', onPlaying)
      v.removeEventListener('timeupdate', onTimeUpdate)
    }
  }, [tmdbId, mediaType, seasonNumber, episodeNumber, hasNext])

  // ── Beacon on leave ────────────────────────────────────────────────────
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

  // ── Force landscape ────────────────────────────────────────────────────
  useEffect(() => {
    const go = async () => {
      try {
        const el = document.documentElement
        if (el.requestFullscreen) await el.requestFullscreen()
        else if ((el as any).webkitRequestFullscreen) await (el as any).webkitRequestFullscreen()
      } catch {}
      try { await (screen.orientation as any)?.lock?.('landscape') } catch {}
    }
    go()
    document.documentElement.classList.add('force-landscape')
    return () => {
      document.documentElement.classList.remove('force-landscape')
      try { (screen.orientation as any)?.unlock?.() } catch {}
      try { if (document.fullscreenElement) document.exitFullscreen() } catch {}
    }
  }, [])

  // ── Sheet episodes (when switching seasons) ────────────────────────────
  useEffect(() => {
    setSheetEpisodes(episodes)
  }, [episodes])

  useEffect(() => {
    if (sheetSeason === currentSeason) {
      setSheetEpisodes(episodes)
      return
    }
    const TMDB_KEY = '5c242b6eeca95f02957505a67a488635'
    fetch(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${sheetSeason}?api_key=${TMDB_KEY}`)
      .then(r => r.json())
      .then(d => setSheetEpisodes((d.episodes || []).map((e: any) => ({
        id: e.id, episode_number: e.episode_number, name: e.name,
        still_path: e.still_path, runtime: e.runtime,
      }))))
      .catch(() => {})
  }, [sheetSeason, currentSeason, tmdbId, episodes])

  // ── Controls auto-hide ─────────────────────────────────────────────────
  const resetTimer = useCallback(() => {
    if (controlsTimer.current) clearTimeout(controlsTimer.current)
    setShowControls(true)
    controlsTimer.current = setTimeout(() => setShowControls(false), 4000)
  }, [])

  // ── Double-tap to seek ─────────────────────────────────────────────────
  const handleVideoTap = (e: React.TouchEvent) => {
    if (locked) return
    if (showEps || showAudio) { setShowEps(false); setShowAudio(false); return }

    const clientX = e.changedTouches[0].clientX
    const halfW = window.innerWidth / 2
    tapCount.current++

    if (tapCount.current === 1) {
      doubleTapTimer.current = setTimeout(() => {
        tapCount.current = 0
        if (showControls) {
          setShowControls(false)
          if (controlsTimer.current) clearTimeout(controlsTimer.current)
        } else {
          resetTimer()
        }
      }, 250)
    } else if (tapCount.current === 2) {
      if (doubleTapTimer.current) clearTimeout(doubleTapTimer.current)
      tapCount.current = 0
      const v = videoEl.current
      if (!v) return
      const delta = clientX < halfW ? -10 : 10
      v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta))
      setSeekIndicator({ side: delta < 0 ? 'left' : 'right', seconds: 10 })
      setTimeout(() => setSeekIndicator(null), 600)
      resetTimer()
    }
  }

  // ── Control actions ────────────────────────────────────────────────────
  const togglePlay = () => {
    const v = videoEl.current; if (!v) return
    if (v.paused) { v.play(); resetTimer() } else v.pause()
  }

  const seekBy = (d: number) => {
    const v = videoEl.current; if (!v) return
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + d))
    resetTimer()
  }

  const togglePiP = async () => {
    const v = videoEl.current; if (!v) return
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else await v.requestPictureInPicture()
    } catch {}
  }

  const setAudioTrack = (id: number) => {
    if (hlsRef.current) {
      hlsRef.current.audioTrack = id
    }
    setShowAudio(false)
  }

  // ── Scrubber ───────────────────────────────────────────────────────────
  const scrubTo = useCallback((clientX: number) => {
    const bar = scrubberRef.current; const v = videoEl.current
    if (!bar || !v) return
    const rect = bar.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const d = v.duration || 0
    v.currentTime = ratio * d
    setCt(ratio * d)
  }, [])

  const onScrubTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation(); e.preventDefault()
    setIsScrubbing(true)
    if (controlsTimer.current) clearTimeout(controlsTimer.current)
    scrubTo(e.touches[0].clientX)
  }
  const onScrubTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation(); e.preventDefault()
    scrubTo(e.touches[0].clientX)
  }
  const onScrubTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation(); e.preventDefault()
    setIsScrubbing(false); resetTimer(); doSave()
  }
  const onScrubMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault()
    setIsScrubbing(true)
    if (controlsTimer.current) clearTimeout(controlsTimer.current)
    scrubTo(e.clientX)
    const onMove = (ev: MouseEvent) => { ev.preventDefault(); scrubTo(ev.clientX) }
    const onUp = () => { setIsScrubbing(false); resetTimer(); doSave(); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const stopProp = (e: React.TouchEvent | React.MouseEvent) => e.stopPropagation()

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="player-root" onTouchEnd={handleVideoTap}>
      {/* Video container — element created imperatively to avoid React lifecycle issues */}
      <div ref={videoContainerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Loading spinner */}
      {loading && (
        <div className="player-spinner"><div /></div>
      )}

      {/* Seek indicator */}
      {seekIndicator && (
        <div className={`seek-indicator ${seekIndicator.side}`}>
          <span className="text-white font-bold text-sm">
            {seekIndicator.side === 'left' ? '-' : '+'}{seekIndicator.seconds}s
          </span>
        </div>
      )}

      {/* Skip intro */}
      {showSkip && !locked && (
        <button
          className="skip-intro-btn"
          onClick={e => { e.stopPropagation(); if (videoEl.current) videoEl.current.currentTime = 75 }}
        >
          Skip Intro
        </button>
      )}

      {/* Next episode prompt */}
      {showNextPrompt && !locked && (
        <div className="next-ep-card" onTouchEnd={stopProp} onClick={stopProp}>
          <p className="text-white/60 text-xs mb-2">Up Next</p>
          <button
            onClick={onNextEpisode}
            className="flex items-center gap-2 text-white text-sm font-medium"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M6 4l12 8-12 8z" /></svg>
            Next Episode
          </button>
        </div>
      )}

      {/* ── Controls overlay ──────────────────────────────────────────── */}
      {!locked && (
        <div className={`controls-overlay ${showControls && !loading ? '' : 'hidden'}`}>
          {/* Top bar */}
          <div className="controls-top" onTouchEnd={stopProp}>
            <button onClick={onBack} className="player-btn" style={{ width: 36, height: 36 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}><path d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold truncate">{title}</p>
              {epTitle && <p className="text-white/50 text-xs truncate">{epTitle}</p>}
            </div>
            <button onClick={togglePiP} className="player-btn" style={{ width: 36, height: 36 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.5}><rect x="2" y="3" width="20" height="14" rx="2" /><rect x="12" y="9" width="8" height="6" rx="1" fill="white" fillOpacity={0.3} /></svg>
            </button>
            <button onClick={() => setFit(f => f === 'contain' ? 'cover' : 'contain')} className="player-btn" style={{ width: 36, height: 36 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.5}>
                {fit === 'contain'
                  ? <><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></>
                  : <><path d="M4 14h6v6M14 4h6v6M10 14l-7 7M20 4l-6 6" /></>}
              </svg>
            </button>
            <button onClick={() => { setLocked(true); setShowControls(false) }} className="player-btn" style={{ width: 36, height: 36 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.5}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
            </button>
          </div>

          {/* Center play controls */}
          <div className="controls-center" onTouchEnd={stopProp}>
            <button onClick={() => seekBy(-10)} className="player-btn flex flex-col items-center active:scale-90">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M12.5 8.5l-4 3.5 4 3.5M4 12a8 8 0 1116 0 8 8 0 01-16 0z" /></svg>
              <span className="text-[10px] text-white -mt-1">10</span>
            </button>
            <button onClick={togglePlay} className="w-[72px] h-[72px] bg-white/20 backdrop-blur rounded-full flex items-center justify-center active:scale-90">
              {playing
                ? <svg width="32" height="32" viewBox="0 0 24 24" fill="white"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
                : <svg width="32" height="32" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>}
            </button>
            <button onClick={() => seekBy(10)} className="player-btn flex flex-col items-center active:scale-90">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M11.5 8.5l4 3.5-4 3.5M20 12a8 8 0 11-16 0 8 8 0 0116 0z" /></svg>
              <span className="text-[10px] text-white -mt-1">10</span>
            </button>
          </div>

          {/* Bottom bar */}
          <div className="controls-bottom" onTouchEnd={stopProp}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-white/60 text-xs tabular-nums w-12">{fmtTime(ct)}</span>
              <div
                ref={scrubberRef}
                className={`scrubber-wrap flex-1 ${isScrubbing ? 'active' : ''}`}
                onTouchStart={onScrubTouchStart}
                onTouchMove={onScrubTouchMove}
                onTouchEnd={onScrubTouchEnd}
                onMouseDown={onScrubMouseDown}
              >
                <div className="scrubber-track">
                  <div className="scrubber-buffered" style={{ width: `${buffered}%` }} />
                  <div className="scrubber-fill" style={{ width: `${progress}%` }} />
                  <div className="scrubber-thumb" style={{ left: `${progress}%` }} />
                </div>
              </div>
              <span className="text-white/60 text-xs tabular-nums w-14 text-right">-{fmtTime(Math.max(0, dur - ct))}</span>
            </div>

            {/* Bottom action row — inline icon + label */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {audioTracks.length > 1 && (
                  <button onClick={e => { e.stopPropagation(); setShowAudio(!showAudio) }} className="control-action text-white/60">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M9 18V5l12-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zm12-2a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    <span>Audio</span>
                  </button>
                )}
                <button onClick={e => { e.stopPropagation(); setSubsEnabled(!subsEnabled) }} className={`control-action ${subsEnabled ? 'text-[#e50914]' : 'text-white/60'}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M6 12h4M14 12h4M6 16h12" /></svg>
                  <span>Subtitles</span>
                </button>
              </div>
              <div className="flex items-center gap-4">
                {mediaType === 'tv' && hasNext && (
                  <button onClick={e => { e.stopPropagation(); onNextEpisode?.() }} className="control-action text-white/60">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l12 8-12 8zM18 4h2v16h-2z" /></svg>
                    <span>Next</span>
                  </button>
                )}
                {mediaType === 'tv' && episodes.length > 0 && (
                  <button onClick={e => { e.stopPropagation(); setShowEps(true) }} className="control-action text-white/60">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 6h16M4 12h16M4 18h16" /></svg>
                    <span>Episodes</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lock button */}
      {locked && (
        <button className="lock-btn" onClick={() => { setLocked(false); resetTimer() }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
          Unlock
        </button>
      )}

      {/* Audio selector */}
      {showAudio && (
        <div className="audio-sheet" onTouchEnd={stopProp} onClick={stopProp}>
          <p className="text-white/40 text-xs mb-2">Audio Track</p>
          {audioTracks.map(t => (
            <button
              key={t.id}
              onClick={() => setAudioTrack(t.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm ${hlsRef.current?.audioTrack === t.id ? 'text-[#e50914] bg-white/[0.06]' : 'text-white/70'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Episode sheet */}
      {showEps && (
        <div className="episode-sheet-backdrop" onClick={() => setShowEps(false)}>
          <div className="episode-sheet" onTouchEnd={stopProp} onClick={stopProp}>
            <div className="sticky top-0 bg-[#111] z-10 px-4 pt-4 pb-2 border-b border-white/[0.06]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-bold text-base">Episodes</h3>
                <button onClick={() => setShowEps(false)} className="text-white/40 p-1">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
              {seasons.length > 1 && (
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
                  {seasons.map(s => (
                    <button
                      key={s.season_number}
                      onClick={() => setSheetSeason(s.season_number)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${sheetSeason === s.season_number ? 'bg-white text-black' : 'bg-white/[0.08] text-white/50'}`}
                    >
                      S{s.season_number}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="p-3 space-y-2">
              {sheetEpisodes.map(ep => {
                const isCur = ep.episode_number === episodeNumber && sheetSeason === currentSeason
                return (
                  <button
                    key={ep.id}
                    onClick={() => { setShowEps(false); onSelectEpisode?.(sheetSeason, ep.episode_number) }}
                    className={`w-full flex gap-3 p-2 rounded-xl text-left ${isCur ? 'bg-[#e50914]/15 ring-1 ring-[#e50914]/30' : 'active:bg-white/[0.06]'}`}
                  >
                    <div className="w-24 aspect-video rounded-lg overflow-hidden bg-[#252525] flex-shrink-0">
                      {ep.still_path
                        ? <img src={`https://image.tmdb.org/t/p/w300${ep.still_path}`} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-white/15 text-lg font-bold">{ep.episode_number}</div>}
                    </div>
                    <div className="flex-1 min-w-0 py-0.5">
                      <p className={`text-xs font-semibold truncate ${isCur ? 'text-[#e50914]' : 'text-white/80'}`}>
                        E{ep.episode_number} &middot; {ep.name}
                      </p>
                      {ep.runtime && <p className="text-white/30 text-[10px] mt-0.5">{ep.runtime}m</p>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
