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
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}` : `${m}:${sec.toString().padStart(2, '0')}`
}

interface Episode { id: number; episode_number: number; name: string; still_path: string | null; runtime?: number | null }
interface SeasonInfo { season_number: number; name: string }
interface AudioTrack { id: number; label: string; lang: string }

export default function WatchPage() {
  const params = useParams(); const searchParams = useSearchParams(); const router = useRouter()
  const type = params.type as string, id = params.id as string
  const season = parseInt(searchParams.get('s') || '1'), episode = parseInt(searchParams.get('e') || '1')
  const tmdbId = parseInt(id), mediaType = type as 'movie' | 'tv'
  const seasonNum = type === 'tv' ? season : undefined, episodeNum = type === 'tv' ? episode : undefined

  const videoRef = useRef<HTMLVideoElement>(null), hlsRef = useRef<Hls | null>(null)
  const lastSaveTs = useRef(0), profileIdRef = useRef<string | null>(null), resumeRef = useRef<number | null>(null)
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const doubleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null), tapCount = useRef(0)

  const [src, setSrc] = useState<string | null>(null)
  const [title, setTitle] = useState(''), [epTitle, setEpTitle] = useState('')
  const [ready, setReady] = useState(false), [fit, setFit] = useState<'cover' | 'contain'>('cover')
  const [isLandscape, setIsLandscape] = useState(false), [isFullscreen, setIsFullscreen] = useState(false)
  const [playing, setPlaying] = useState(false), [loading, setLoading] = useState(true)
  const [ct, setCt] = useState(0), [dur, setDur] = useState(0), [buffered, setBuffered] = useState(0)
  const [showControls, setShowControls] = useState(true), [isScrubbing, setIsScrubbing] = useState(false)
  const [locked, setLocked] = useState(false)
  const [seekIndicator, setSeekIndicator] = useState<{ side: 'left' | 'right' } | null>(null)

  // New features
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([])
  const [showAudioSheet, setShowAudioSheet] = useState(false)
  const [subsEnabled, setSubsEnabled] = useState(false)
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [seasons, setSeasons] = useState<SeasonInfo[]>([])
  const [hasNext, setHasNext] = useState(false)
  const [showEpisodeSheet, setShowEpisodeSheet] = useState(false)
  const [sheetSeason, setSheetSeason] = useState(season)
  const [sheetEpisodes, setSheetEpisodes] = useState<Episode[]>([])

  // ── SW cleanup + profile ───────────────────────────────────────────────
  useEffect(() => {
    (async () => { if ('serviceWorker' in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); for (const reg of regs) await reg.unregister() }; const keys = await caches.keys(); for (const key of keys) await caches.delete(key) })()
    profileIdRef.current = localStorage.getItem('streamcorn_profile_id')
  }, [])

  // ── Fetch source + metadata + resume ───────────────────────────────────
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
      resumeRef.current = resume
      setReady(true) // Set ready immediately so video element renders

      if (type === 'tv') {
        setEpTitle(`S${season}:E${episode}`)
        const filteredSeasons = (detailRes.seasons || []).filter((s: any) => s.season_number > 0).map((s: any) => ({ season_number: s.season_number, name: s.name }))
        setSeasons(filteredSeasons)
        setSheetSeason(season)
        // Fetch episodes without blocking playback
        fetch(`https://api.themoviedb.org/3/tv/${id}/season/${season}?api_key=${TMDB_KEY}`)
          .then(r => r.json())
          .then(d => {
            if (cancelled) return
            const eps = (d.episodes || []).map((e: any) => ({ id: e.id, episode_number: e.episode_number, name: e.name, still_path: e.still_path, runtime: e.runtime }))
            setEpisodes(eps); setSheetEpisodes(eps)
            setHasNext(eps.findIndex((e: Episode) => e.episode_number === episode) < eps.length - 1)
          }).catch(() => {})
      }
    }
    load()
    return () => { cancelled = true }
  }, [id, type, season, episode, tmdbId, mediaType, seasonNum, episodeNum])

  // Sheet season change
  useEffect(() => {
    if (type !== 'tv' || sheetSeason === season) { setSheetEpisodes(episodes); return }
    fetch(`https://api.themoviedb.org/3/tv/${id}/season/${sheetSeason}?api_key=${TMDB_KEY}`)
      .then(r => r.json()).then(d => setSheetEpisodes((d.episodes || []).map((e: any) => ({ id: e.id, episode_number: e.episode_number, name: e.name, still_path: e.still_path, runtime: e.runtime })))).catch(() => {})
  }, [sheetSeason, type, id, season, episodes])

  // ── Beacon save ────────────────────────────────────────────────────────
  const doBeacon = useCallback(() => {
    const v = videoRef.current; const pid = profileIdRef.current
    if (!v || !pid || !isFinite(v.duration) || v.duration < 10 || v.currentTime < 5) return
    beaconProgress(buildPayload(pid, tmdbId, mediaType, v.currentTime, v.duration, seasonNum, episodeNum))
  }, [tmdbId, mediaType, seasonNum, episodeNum])

  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'hidden') doBeacon() }
    document.addEventListener('visibilitychange', onVis); window.addEventListener('pagehide', doBeacon); window.addEventListener('beforeunload', doBeacon)
    return () => { doBeacon(); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', doBeacon); window.removeEventListener('beforeunload', doBeacon) }
  }, [doBeacon])

  // ── HLS + events ───────────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current; if (!v || !src) return
    const startPlayback = () => { if (resumeRef.current != null && resumeRef.current > 0) v.currentTime = resumeRef.current; v.play().catch(() => {}) }
    const onPlay = () => setPlaying(true)
    const onPause = () => { setPlaying(false); const pid = profileIdRef.current; if (pid && isFinite(v.duration) && v.duration > 10 && v.currentTime > 5) saveProgress(buildPayload(pid, tmdbId, mediaType, v.currentTime, v.duration, seasonNum, episodeNum)) }
    const onWaiting = () => setLoading(true); const onCanPlay = () => setLoading(false); const onPlaying = () => setLoading(false)
    const onTimeUpdate = () => {
      if (!isScrubbing) { setCt(v.currentTime); setDur(v.duration || 0) }
      if (v.buffered.length > 0) setBuffered((v.buffered.end(v.buffered.length - 1) / (v.duration || 1)) * 100)
      const now = Date.now()
      if (now - lastSaveTs.current >= 10_000 && v.currentTime > 5 && v.duration > 10) { lastSaveTs.current = now; const pid = profileIdRef.current; if (pid) saveProgress(buildPayload(pid, tmdbId, mediaType, v.currentTime, v.duration, seasonNum, episodeNum)) }
    }
    v.addEventListener('play', onPlay); v.addEventListener('pause', onPause); v.addEventListener('seeked', onPause)
    v.addEventListener('waiting', onWaiting); v.addEventListener('canplay', onCanPlay); v.addEventListener('playing', onPlaying); v.addEventListener('timeupdate', onTimeUpdate)

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true })
      hls.loadSource(src); hls.attachMedia(v)
      hls.on(Hls.Events.MANIFEST_PARSED, startPlayback)
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
        setAudioTracks(hls.audioTracks.map((t, i) => ({ id: i, label: t.name || t.lang?.toUpperCase() || `Track ${i + 1}`, lang: t.lang || '' })))
      })
      hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) { if (d.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad(); else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError() } })
      hlsRef.current = hls
    } else if (v.canPlayType('application/vnd.apple.mpegurl')) { v.src = src; v.addEventListener('loadedmetadata', startPlayback) }
    return () => { v.removeEventListener('play', onPlay); v.removeEventListener('pause', onPause); v.removeEventListener('seeked', onPause); v.removeEventListener('waiting', onWaiting); v.removeEventListener('canplay', onCanPlay); v.removeEventListener('playing', onPlaying); v.removeEventListener('timeupdate', onTimeUpdate); if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null } }
  }, [src, tmdbId, mediaType, seasonNum, episodeNum])

  // ── Orientation + fullscreen ───────────────────────────────────────────
  useEffect(() => {
    const check = () => setIsLandscape(window.innerWidth > window.innerHeight); check(); window.addEventListener('resize', check)
    const onFs = () => setIsFullscreen(!!document.fullscreenElement); document.addEventListener('fullscreenchange', onFs); document.addEventListener('webkitfullscreenchange', onFs)
    return () => { window.removeEventListener('resize', check); document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('webkitfullscreenchange', onFs); try { (screen.orientation as any)?.unlock?.() } catch {}; try { if (document.fullscreenElement) document.exitFullscreen() } catch {} }
  }, [])
  useEffect(() => { const t = setTimeout(async () => { const el = document.getElementById('player-root'); if (!el) return; try { if (el.requestFullscreen) await el.requestFullscreen(); else if ((el as any).webkitRequestFullscreen) await (el as any).webkitRequestFullscreen() } catch {}; try { await (screen.orientation as any)?.lock?.('landscape') } catch {} }, 300); return () => clearTimeout(t) }, [ready])

  // ── Controls ───────────────────────────────────────────────────────────
  const resetTimer = useCallback(() => { if (controlsTimer.current) clearTimeout(controlsTimer.current); setShowControls(true); controlsTimer.current = setTimeout(() => { if (!isScrubbing) setShowControls(false) }, 3000) }, [isScrubbing])
  useEffect(() => { if (isScrubbing) { if (controlsTimer.current) clearTimeout(controlsTimer.current); setShowControls(true) } }, [isScrubbing])

  const handleVideoAreaTap = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('[data-controls]')) return
    if (locked) return
    const clientX = e.changedTouches[0].clientX, halfW = window.innerWidth / 2
    tapCount.current++
    if (tapCount.current === 1) { doubleTapTimer.current = setTimeout(() => { tapCount.current = 0; if (showControls) { setShowControls(false); if (controlsTimer.current) clearTimeout(controlsTimer.current) } else resetTimer() }, 250) }
    else if (tapCount.current === 2) { if (doubleTapTimer.current) clearTimeout(doubleTapTimer.current); tapCount.current = 0; const v = videoRef.current; if (!v) return; const delta = clientX < halfW ? -10 : 10; v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta)); setSeekIndicator({ side: delta < 0 ? 'left' : 'right' }); setTimeout(() => setSeekIndicator(null), 600); resetTimer() }
  }

  const togglePlay = () => { const v = videoRef.current; if (!v) return; if (v.paused) { v.play(); resetTimer() } else v.pause() }
  const seekBy = (d: number) => { const v = videoRef.current; if (!v) return; v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + d)); resetTimer() }
  const goLandscape = async () => { const el = document.getElementById('player-root'); if (!el) return; try { if (el.requestFullscreen) await el.requestFullscreen(); else if ((el as any).webkitRequestFullscreen) await (el as any).webkitRequestFullscreen() } catch {}; try { await (screen.orientation as any)?.lock?.('landscape') } catch {}; videoRef.current?.play().catch(() => {}) }
  const handleNextEp = () => { const idx = episodes.findIndex(ep => ep.episode_number === episode); if (idx < episodes.length - 1) router.push(`/watch/tv/${id}?s=${season}&e=${episodes[idx + 1].episode_number}`) }
  const setAudioTrack = (trackId: number) => { if (hlsRef.current) hlsRef.current.audioTrack = trackId; setShowAudioSheet(false) }


  const progress = dur > 0 ? (ct / dur) * 100 : 0
  const stopProp = (e: React.TouchEvent | React.MouseEvent) => e.stopPropagation()
  const btnStyle: React.CSSProperties = { background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 0' }
  const iconBtnStyle: React.CSSProperties = { background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 6 }

  if (!ready || !src) return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ width: 48, height: 48, border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#e50914', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  const showRotatePrompt = !isLandscape && !isFullscreen

  return (
    <div id="player-root" style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 9999 }} onTouchEnd={handleVideoAreaTap}>
      <video ref={videoRef} playsInline autoPlay controls style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: fit, background: '#000' }} />

      {loading && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 5 }}><div style={{ width: 48, height: 48, border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#e50914', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /></div>}

      {seekIndicator && <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', [seekIndicator.side === 'left' ? 'left' : 'right']: 48, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', borderRadius: 9999, padding: '8px 16px', pointerEvents: 'none', zIndex: 15 }}><span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{seekIndicator.side === 'left' ? '-' : '+'}10s</span></div>}

      {/* Controls */}
      {!locked && (
        <div data-controls style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', opacity: showControls && !loading ? 1 : 0, pointerEvents: showControls && !loading ? 'auto' : 'none', transition: 'opacity 0.25s ease' }}>
          {/* Top bar */}
          <div onTouchEnd={stopProp} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)' }}>
            <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#fff', padding: 0 }}>
              <svg width="24" height="24" viewBox="0 -960 960 960" fill="white"><path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z"/></svg>
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: '#fff', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{title}</p>
              {epTitle && <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: 0 }}>{epTitle}</p>}
            </div>
            {/* Top right: Fit + Lock */}
            <button onClick={() => setFit(f => f === 'cover' ? 'contain' : 'cover')} style={iconBtnStyle}>
              {fit === 'cover'
                ? <svg width="22" height="22" viewBox="0 -960 960 960" fill="white"><path d="M200-280q-33 0-56.5-23.5T120-360v-240q0-33 23.5-56.5T200-680h560q33 0 56.5 23.5T840-600v240q0 33-23.5 56.5T760-280H200Zm0-80h560v-240H200v240Z"/></svg>
                : <svg width="22" height="22" viewBox="0 -960 960 960" fill="white"><path d="M120-120v-200h80v120h120v80H120Zm520 0v-80h120v-120h80v200H640ZM120-640v-200h200v80H200v120h-80Zm640 0v-120H640v-80h200v200h-80Z"/></svg>
              }
            </button>
            <button onClick={() => { setLocked(true); setShowControls(false) }} style={iconBtnStyle}>
              <svg width="22" height="22" viewBox="0 -960 960 960" fill="white"><path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm240-200q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80Z"/></svg>
            </button>
          </div>

          {/* Center play controls */}
          <div onTouchEnd={stopProp} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 56, alignSelf: 'center' }}>
            <button onClick={() => seekBy(-10)} style={{ background: 'none', border: 'none', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <svg width="40" height="40" viewBox="0 -960 960 960" fill="white"><path d="M480-80q-75 0-140.5-28.5t-114-77q-48.5-48.5-77-114T120-440h80q0 117 81.5 198.5T480-160q117 0 198.5-81.5T760-440q0-117-81.5-198.5T480-720h-6l62 62-56 58-160-160 160-160 56 58-62 62h6q75 0 140.5 28.5t114 77q48.5 48.5 77 114T840-440q0 75-28.5 140.5t-77 114q-48.5 48.5-114 77T480-80Z"/></svg>
              <span style={{ fontSize: 10, marginTop: -2 }}>10</span>
            </button>
            <button onClick={togglePlay} style={{ width: 64, height: 64, background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', border: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              {playing
                ? <svg width="32" height="32" viewBox="0 -960 960 960" fill="white"><path d="M560-200v-560h160v560H560Zm-320 0v-560h160v560H240Z"/></svg>
                : <svg width="32" height="32" viewBox="0 -960 960 960" fill="white"><path d="M320-200v-560l440 280-440 280Z"/></svg>
              }
            </button>
            <button onClick={() => seekBy(10)} style={{ background: 'none', border: 'none', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <svg width="40" height="40" viewBox="0 -960 960 960" fill="white"><path d="M480-80q-75 0-140.5-28.5t-114-77q-48.5-48.5-77-114T120-440q0-75 28.5-140.5t77-114q48.5-48.5 114-77T480-800h6l-62-62 56-58 160 160-160 160-56-58 62-62h-6q-117 0-198.5 81.5T200-440q0 117 81.5 198.5T480-160q117 0 198.5-81.5T760-440h80q0 75-28.5 140.5t-77 114q-48.5 48.5-114 77T480-80Z"/></svg>
              <span style={{ fontSize: 10, marginTop: -2 }}>10</span>
            </button>
          </div>

          {/* Bottom: time + action row — positioned above native seekbar (48px from bottom) */}
          <div onTouchEnd={stopProp} style={{ padding: '0 16px', paddingBottom: 48, background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)' }}>
            {/* Time display */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{fmtTime(ct)}</span>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>-{fmtTime(Math.max(0, dur - ct))}</span>
            </div>

            {/* Action row — inline icon + label, evenly spaced */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', paddingTop: 4 }}>
              {/* Subtitles */}
              <button onClick={() => setSubsEnabled(!subsEnabled)} style={{ ...btnStyle, color: subsEnabled ? '#e50914' : '#fff' }}>
                <svg width="18" height="18" viewBox="0 -960 960 960" fill="currentColor"><path d="M200-160q-33 0-56.5-23.5T120-240v-480q0-33 23.5-56.5T200-800h560q33 0 56.5 23.5T840-720v480q0 33-23.5 56.5T760-160H200Zm80-200h120q17 0 28.5-11.5T440-400v-40h-60v20h-80v-120h80v20h60v-40q0-17-11.5-28.5T400-600H280q-17 0-28.5 11.5T240-560v160q0 17 11.5 28.5T280-360Zm280 0h120q17 0 28.5-11.5T720-400v-40h-60v20h-80v-120h80v20h60v-40q0-17-11.5-28.5T680-600H560q-17 0-28.5 11.5T520-560v160q0 17 11.5 28.5T560-360Z"/></svg>
                <span>Subtitles</span>
              </button>

              {/* Audio */}
              {audioTracks.length > 1 && (
                <button onClick={() => { setShowAudioSheet(!showAudioSheet); setShowEpisodeSheet(false) }} style={btnStyle}>
                  <svg width="18" height="18" viewBox="0 -960 960 960" fill="white"><path d="M560-131v-82q90-26 145-100t55-168q0-94-55-168T560-749v-82q124 28 202 125.5T840-481q0 127-78 224.5T560-131ZM120-360v-240h160l200-200v640L280-360H120Zm440 40v-322q47 22 73.5 66t26.5 96q0 51-26.5 94.5T560-320Z"/></svg>
                  <span>Audio</span>
                </button>
              )}

              {/* Next Episode (TV only) */}
              {type === 'tv' && hasNext && (
                <button onClick={handleNextEp} style={btnStyle}>
                  <svg width="18" height="18" viewBox="0 -960 960 960" fill="white"><path d="M660-240v-480h80v480h-80Zm-440 0v-480l360 240-360 240Z"/></svg>
                  <span>Next</span>
                </button>
              )}

              {/* Episodes (TV only) */}
              {type === 'tv' && episodes.length > 0 && (
                <button onClick={() => { setShowEpisodeSheet(!showEpisodeSheet); setShowAudioSheet(false) }} style={btnStyle}>
                  <svg width="18" height="18" viewBox="0 -960 960 960" fill="white"><path d="M320-400h480L650-580l-130 170-96-122-104 132ZM240-240q-33 0-56.5-23.5T160-320v-480q0-33 23.5-56.5T240-880h480q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H240ZM80-80v-560h80v480h560v80H80Z"/></svg>
                  <span>Episodes</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lock */}
      {locked && <button onClick={() => { setLocked(false); resetTimer() }} style={{ position: 'absolute', top: 16, left: 16, zIndex: 20, padding: '8px 16px', background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', border: 'none', borderRadius: 9999, color: '#fff', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>Unlock</button>}

      {/* Audio sheet */}
      {showAudioSheet && (
        <div data-controls style={{ position: 'absolute', bottom: 80, left: 16, zIndex: 30, background: 'rgba(17,17,17,0.95)', backdropFilter: 'blur(8px)', borderRadius: 12, padding: 12, minWidth: 160 }} onTouchEnd={stopProp} onClick={stopProp}>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginBottom: 8, marginTop: 0 }}>Audio Track</p>
          {audioTracks.map(t => (
            <button key={t.id} onClick={() => setAudioTrack(t.id)} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 8, border: 'none', background: hlsRef.current?.audioTrack === t.id ? 'rgba(255,255,255,0.06)' : 'transparent', color: hlsRef.current?.audioTrack === t.id ? '#e50914' : 'rgba(255,255,255,0.7)', fontSize: 14, cursor: 'pointer', display: 'block' }}>{t.label}</button>
          ))}
        </div>
      )}

      {/* Episode sheet */}
      {showEpisodeSheet && (
        <div data-controls style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(0,0,0,0.8)' }} onClick={() => setShowEpisodeSheet(false)}>
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 340, background: '#111', overflowY: 'auto' }} onTouchEnd={stopProp} onClick={stopProp}>
            <div style={{ position: 'sticky', top: 0, background: '#111', zIndex: 10, padding: '16px 16px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>Episodes</h3>
                <button onClick={() => setShowEpisodeSheet(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', padding: 4 }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg></button>
              </div>
              {seasons.length > 1 && (
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }} className="scrollbar-hide">
                  {seasons.map(s => (
                    <button key={s.season_number} onClick={() => setSheetSeason(s.season_number)} style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 9999, border: 'none', fontSize: 12, fontWeight: 600, background: sheetSeason === s.season_number ? '#fff' : 'rgba(255,255,255,0.08)', color: sheetSeason === s.season_number ? '#000' : 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>S{s.season_number}</button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sheetEpisodes.map(ep => {
                const isCur = ep.episode_number === episode && sheetSeason === season
                return (
                  <button key={ep.id} onClick={() => { setShowEpisodeSheet(false); router.push(`/watch/tv/${id}?s=${sheetSeason}&e=${ep.episode_number}`) }}
                    style={{ width: '100%', display: 'flex', gap: 12, padding: 8, borderRadius: 12, border: isCur ? '1px solid rgba(229,9,20,0.3)' : '1px solid transparent', background: isCur ? 'rgba(229,9,20,0.1)' : 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                    <div style={{ width: 96, aspectRatio: '16/9', borderRadius: 8, overflow: 'hidden', background: '#252525', flexShrink: 0 }}>
                      {ep.still_path ? <img src={`https://image.tmdb.org/t/p/w300${ep.still_path}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.15)', fontSize: 18, fontWeight: 700 }}>{ep.episode_number}</div>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: isCur ? '#e50914' : 'rgba(255,255,255,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>E{ep.episode_number} &middot; {ep.name}</p>
                      {ep.runtime && <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 2, margin: 0 }}>{ep.runtime}m</p>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Rotate prompt */}
      {showRotatePrompt && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.5} style={{ opacity: 0.7 }}><path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 014-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 01-4 4H3" /></svg>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>Rotate your device to landscape</p>
          <button onClick={goLandscape} style={{ background: '#e50914', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 32px', fontSize: 14, fontWeight: 700 }}>Enter Fullscreen</button>
        </div>
      )}
    </div>
  )
}
