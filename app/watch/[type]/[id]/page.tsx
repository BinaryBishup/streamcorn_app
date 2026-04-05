'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Hls from 'hls.js'
import { getResumePosition, saveProgress, beaconProgress, buildPayload } from '@/lib/watch-progress'

const TMDB_KEY = '5c242b6eeca95f02957505a67a488635'

interface Episode { id: number; episode_number: number; name: string; still_path: string | null; runtime?: number | null }
interface SeasonInfo { season_number: number; name: string }

export default function WatchPage() {
  const params = useParams(); const searchParams = useSearchParams(); const router = useRouter()
  const type = params.type as string, id = params.id as string
  const season = parseInt(searchParams.get('s') || '1'), episode = parseInt(searchParams.get('e') || '1')
  const tmdbId = parseInt(id), mediaType = type as 'movie' | 'tv'
  const seasonNum = type === 'tv' ? season : undefined, episodeNum = type === 'tv' ? episode : undefined

  const videoRef = useRef<HTMLVideoElement>(null), hlsRef = useRef<Hls | null>(null)
  const lastSaveTs = useRef(0), profileIdRef = useRef<string | null>(null), resumeRef = useRef<number | null>(null)

  const [src, setSrc] = useState<string | null>(null)
  const [title, setTitle] = useState(''), [epTitle, setEpTitle] = useState('')
  const [ready, setReady] = useState(false), [fit, setFit] = useState<'cover' | 'contain'>('cover')
  const [locked, setLocked] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [audioTracks, setAudioTracks] = useState<{ id: number; label: string }[]>([])
  const [subsEnabled, setSubsEnabled] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [seasons, setSeasons] = useState<SeasonInfo[]>([])
  const [hasNext, setHasNext] = useState(false)
  const [showEpisodeSheet, setShowEpisodeSheet] = useState(false)
  const [sheetSeason, setSheetSeason] = useState(season)
  const [sheetEpisodes, setSheetEpisodes] = useState<Episode[]>([])
  const [showTopBar, setShowTopBar] = useState(true)

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
      setReady(true)
      if (type === 'tv') {
        setEpTitle(`S${season}:E${episode}`)
        setSeasons((detailRes.seasons || []).filter((s: any) => s.season_number > 0).map((s: any) => ({ season_number: s.season_number, name: s.name })))
        setSheetSeason(season)
        fetch(`https://api.themoviedb.org/3/tv/${id}/season/${season}?api_key=${TMDB_KEY}`)
          .then(r => r.json()).then(d => {
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

  // ── HLS + progress save ────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current; if (!v || !src) return
    const startPlayback = () => { if (resumeRef.current != null && resumeRef.current > 0) v.currentTime = resumeRef.current; v.play().catch(() => {}) }
    const onPause = () => { const pid = profileIdRef.current; if (pid && isFinite(v.duration) && v.duration > 10 && v.currentTime > 5) saveProgress(buildPayload(pid, tmdbId, mediaType, v.currentTime, v.duration, seasonNum, episodeNum)) }
    const onTimeUpdate = () => {
      const now = Date.now()
      if (now - lastSaveTs.current >= 10_000 && v.currentTime > 5 && v.duration > 10) { lastSaveTs.current = now; const pid = profileIdRef.current; if (pid) saveProgress(buildPayload(pid, tmdbId, mediaType, v.currentTime, v.duration, seasonNum, episodeNum)) }
    }
    v.addEventListener('pause', onPause); v.addEventListener('seeked', onPause); v.addEventListener('timeupdate', onTimeUpdate)
    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true })
      hls.loadSource(src); hls.attachMedia(v)
      hls.on(Hls.Events.MANIFEST_PARSED, startPlayback)
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => setAudioTracks(hls.audioTracks.map((t, i) => ({ id: i, label: t.name || t.lang?.toUpperCase() || `Track ${i + 1}` }))))
      hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) { if (d.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad(); else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError() } })
      hlsRef.current = hls
    } else if (v.canPlayType('application/vnd.apple.mpegurl')) { v.src = src; v.addEventListener('loadedmetadata', startPlayback) }
    return () => { v.removeEventListener('pause', onPause); v.removeEventListener('seeked', onPause); v.removeEventListener('timeupdate', onTimeUpdate); if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null } }
  }, [src, tmdbId, mediaType, seasonNum, episodeNum])

  // ── Orientation + fullscreen ───────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(async () => {
      const el = document.getElementById('player-root'); if (!el) return
      try { if (el.requestFullscreen) await el.requestFullscreen(); else if ((el as any).webkitRequestFullscreen) await (el as any).webkitRequestFullscreen() } catch {}
      try { await (screen.orientation as any)?.lock?.('landscape') } catch {}
    }, 300)
    return () => { clearTimeout(t); try { (screen.orientation as any)?.unlock?.() } catch {}; try { if (document.fullscreenElement) document.exitFullscreen() } catch {} }
  }, [ready])

  // ── Auto-hide top bar after 3s ─────────────────────────────────────────
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resetHideTimer = useCallback(() => {
    setShowTopBar(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setShowTopBar(false), 3000)
  }, [])

  // Show on first load, start hiding
  useEffect(() => { resetHideTimer() }, [resetHideTimer])

  const handleNextEp = () => { const idx = episodes.findIndex(ep => ep.episode_number === episode); if (idx < episodes.length - 1) router.push(`/watch/tv/${id}?s=${season}&e=${episodes[idx + 1].episode_number}`) }
  const setAudioTrack = (id: number) => { if (hlsRef.current) hlsRef.current.audioTrack = id; setShowSettings(false) }
  const changeSpeed = (rate: number) => { const v = videoRef.current; if (v) v.playbackRate = rate; setPlaybackRate(rate); setShowSettings(false) }

  // ── Loading ────────────────────────────────────────────────────────────
  if (!ready || !src) return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ width: 48, height: 48, border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#e50914', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  const iconBtn = (onClick: () => void, children: React.ReactNode, label?: string) => (
    <button onClick={onClick} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, padding: '6px 8px', fontSize: 12, fontWeight: 500 }}>
      {children}
      {label && <span>{label}</span>}
    </button>
  )

  return (
    <div id="player-root" style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 9999 }} onTouchStart={resetHideTimer}>
      {/* Native video with native controls — handles seekbar, play/pause, fullscreen */}
      <video ref={videoRef} playsInline autoPlay controls style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: fit, background: '#000' }} />

      {/* ═══ Our additions ON TOP of native player ═══ */}

      {/* Top bar — back + title + settings + next + episodes */}
      {showTopBar && !locked && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
          display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 70%, transparent)',
          pointerEvents: 'auto',
        }}>
          {/* Back */}
          {iconBtn(() => router.back(),
            <svg width="22" height="22" viewBox="0 -960 960 960" fill="white"><path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z"/></svg>
          )}

          {/* Title */}
          <div style={{ flex: 1, minWidth: 0, padding: '0 4px' }}>
            <p style={{ color: '#fff', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{title}</p>
            {epTitle && <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, margin: 0 }}>{epTitle}</p>}
          </div>

          {/* Settings (captions, audio, speed) */}
          {iconBtn(() => setShowSettings(!showSettings),
            <svg width="20" height="20" viewBox="0 -960 960 960" fill="white"><path d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L84-369l103-78q-1-7-1-13v-20q0-6 1-13L84-571l104-186 119 50q11-8 23-15t24-12l16-128h208l16 128q13 5 24.5 12t22.5 15l119-50 104 186-103 78q1 7 1 13v20q0 6-2 13l103 78-104 186-119-50q-11 8-23 15t-24 12L578-80H370Zm104-300q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T334-520q0 58 40.5 99t99.5 41Z"/></svg>
          )}

          {/* Fit toggle */}
          {iconBtn(() => setFit(f => f === 'cover' ? 'contain' : 'cover'),
            fit === 'cover'
              ? <svg width="20" height="20" viewBox="0 -960 960 960" fill="white"><path d="M200-280q-33 0-56.5-23.5T120-360v-240q0-33 23.5-56.5T200-680h560q33 0 56.5 23.5T840-600v240q0 33-23.5 56.5T760-280H200Zm0-80h560v-240H200v240Z"/></svg>
              : <svg width="20" height="20" viewBox="0 -960 960 960" fill="white"><path d="M120-120v-200h80v120h120v80H120Zm520 0v-80h120v-120h80v200H640ZM120-640v-200h200v80H200v120h-80Zm640 0v-120H640v-80h200v200h-80Z"/></svg>
          )}

          {/* Next Episode (TV) */}
          {type === 'tv' && hasNext && iconBtn(handleNextEp,
            <svg width="20" height="20" viewBox="0 -960 960 960" fill="white"><path d="M660-240v-480h80v480h-80Zm-440 0v-480l360 240-360 240Z"/></svg>,
            'Next'
          )}

          {/* Episodes (TV) */}
          {type === 'tv' && episodes.length > 0 && iconBtn(() => setShowEpisodeSheet(!showEpisodeSheet),
            <svg width="20" height="20" viewBox="0 -960 960 960" fill="white"><path d="M320-400h480L650-580l-130 170-96-122-104 132ZM240-240q-33 0-56.5-23.5T160-320v-480q0-33 23.5-56.5T240-880h480q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H240ZM80-80v-560h80v480h560v80H80Z"/></svg>,
            'Episodes'
          )}
        </div>
      )}

      {/* Lock button — right edge, vertically centered */}
      {!locked && showTopBar && (
        <button
          onClick={() => { setLocked(true); setShowTopBar(false) }}
          style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', zIndex: 20,
            background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: 9999,
            width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', cursor: 'pointer', backdropFilter: 'blur(4px)',
          }}
        >
          <svg width="20" height="20" viewBox="0 -960 960 960" fill="white"><path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm240-200q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80Z"/></svg>
        </button>
      )}

      {/* Unlock button — center, only when locked */}
      {locked && (
        <button
          onClick={() => { setLocked(false); resetHideTimer() }}
          style={{
            position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 20,
            background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: 9999,
            padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 8,
            color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', backdropFilter: 'blur(4px)',
          }}
        >
          <svg width="18" height="18" viewBox="0 -960 960 960" fill="white"><path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h280v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85h-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Z"/></svg>
          Unlock
        </button>
      )}

      {/* Settings sheet */}
      {showSettings && (
        <div style={{ position: 'absolute', top: 52, right: 12, zIndex: 30, background: 'rgba(17,17,17,0.95)', backdropFilter: 'blur(12px)', borderRadius: 12, padding: 16, minWidth: 200, boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
          {/* Speed */}
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Speed</p>
          <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map(r => (
              <button key={r} onClick={() => changeSpeed(r)} style={{
                flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: playbackRate === r ? '#e50914' : 'rgba(255,255,255,0.08)',
                color: playbackRate === r ? '#fff' : 'rgba(255,255,255,0.6)',
              }}>{r}x</button>
            ))}
          </div>

          {/* Subtitles */}
          <button onClick={() => { setSubsEnabled(!subsEnabled); setShowSettings(false) }} style={{
            width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: subsEnabled ? 'rgba(229,9,20,0.15)' : 'rgba(255,255,255,0.06)',
            color: subsEnabled ? '#e50914' : '#fff', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4,
          }}>
            <svg width="18" height="18" viewBox="0 -960 960 960" fill="currentColor"><path d="M200-160q-33 0-56.5-23.5T120-240v-480q0-33 23.5-56.5T200-800h560q33 0 56.5 23.5T840-720v480q0 33-23.5 56.5T760-160H200Zm80-200h120q17 0 28.5-11.5T440-400v-40h-60v20h-80v-120h80v20h60v-40q0-17-11.5-28.5T400-600H280q-17 0-28.5 11.5T240-560v160q0 17 11.5 28.5T280-360Zm280 0h120q17 0 28.5-11.5T720-400v-40h-60v20h-80v-120h80v20h60v-40q0-17-11.5-28.5T680-600H560q-17 0-28.5 11.5T520-560v160q0 17 11.5 28.5T560-360Z"/></svg>
            Subtitles {subsEnabled ? 'On' : 'Off'}
          </button>

          {/* Audio tracks */}
          {audioTracks.length > 1 && (
            <>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, margin: '12px 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Audio</p>
              {audioTracks.map(t => (
                <button key={t.id} onClick={() => setAudioTrack(t.id)} style={{
                  width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: hlsRef.current?.audioTrack === t.id ? 'rgba(229,9,20,0.15)' : 'transparent',
                  color: hlsRef.current?.audioTrack === t.id ? '#e50914' : 'rgba(255,255,255,0.7)', fontSize: 13,
                }}>{t.label}</button>
              ))}
            </>
          )}
        </div>
      )}

      {/* Episode sheet */}
      {showEpisodeSheet && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(0,0,0,0.8)' }} onClick={() => setShowEpisodeSheet(false)}>
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 340, background: '#111', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ position: 'sticky', top: 0, background: '#111', zIndex: 10, padding: '16px 16px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>Episodes</h3>
                <button onClick={() => setShowEpisodeSheet(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', padding: 4, cursor: 'pointer' }}>
                  <svg width="20" height="20" viewBox="0 -960 960 960" fill="currentColor"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
                </button>
              </div>
              {seasons.length > 1 && (
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }} className="scrollbar-hide">
                  {seasons.map(s => (
                    <button key={s.season_number} onClick={() => setSheetSeason(s.season_number)} style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 9999, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: sheetSeason === s.season_number ? '#fff' : 'rgba(255,255,255,0.08)', color: sheetSeason === s.season_number ? '#000' : 'rgba(255,255,255,0.5)' }}>S{s.season_number}</button>
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
                      {ep.runtime && <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, margin: '2px 0 0' }}>{ep.runtime}m</p>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Rotate prompt */}
      {typeof window !== 'undefined' && window.innerWidth < window.innerHeight && !document.fullscreenElement && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <svg width="48" height="48" viewBox="0 -960 960 960" fill="white" style={{ opacity: 0.6 }}><path d="M480-80q-75 0-140.5-28.5t-114-77q-48.5-48.5-77-114T120-440h80q0 117 81.5 198.5T480-160q117 0 198.5-81.5T760-440q0-117-81.5-198.5T480-720h-6l62 62-56 58-160-160 160-160 56 58-62 62h6q75 0 140.5 28.5t114 77q48.5 48.5 77 114T840-440q0 75-28.5 140.5t-77 114q-48.5 48.5-114 77T480-80Z"/></svg>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>Rotate to landscape</p>
          <button onClick={async () => {
            const el = document.getElementById('player-root'); if (!el) return
            try { if (el.requestFullscreen) await el.requestFullscreen(); else if ((el as any).webkitRequestFullscreen) await (el as any).webkitRequestFullscreen() } catch {}
            try { await (screen.orientation as any)?.lock?.('landscape') } catch {}
          }} style={{ background: '#e50914', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 32px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            Enter Fullscreen
          </button>
        </div>
      )}
    </div>
  )
}
