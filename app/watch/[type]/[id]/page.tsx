'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Hls from 'hls.js'

const HLS_KEY_HEX = process.env.NEXT_PUBLIC_HLS_KEY || ''
const TMDB_KEY = '5c242b6eeca95f02957505a67a488635'

function hexToBytes(hex: string): Uint8Array {
  const b = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) b[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  return b
}
function fmtTime(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}` : `${m}:${sec.toString().padStart(2, '0')}`
}

interface Episode { id: number; episode_number: number; name: string; still_path: string | null; runtime?: number | null }
interface SeasonInfo { season_number: number; name: string }
interface AudioTrack { id: number; label: string; lang: string }

export default function WatchPage() {
  const params = useParams(); const searchParams = useSearchParams(); const router = useRouter()
  const type = params.type as string, id = params.id as string
  const season = parseInt(searchParams.get('s') || '1'), episode = parseInt(searchParams.get('e') || '1')

  const videoRef = useRef<HTMLVideoElement>(null), hlsRef = useRef<Hls | null>(null)
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const doubleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tapCount = useRef(0)

  const [src, setSrc] = useState<string | null>(null)
  const [title, setTitle] = useState(''); const [epTitle, setEpTitle] = useState('')
  const [showControls, setShowControls] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [ct, setCt] = useState(0); const [dur, setDur] = useState(0)
  const [loading, setLoading] = useState(true); const [seeking, setSeeking] = useState(false)
  const [episodes, setEpisodes] = useState<Episode[]>([]); const [seasons, setSeasons] = useState<SeasonInfo[]>([])
  const [sheetSeason, setSheetSeason] = useState(season)
  const [showEps, setShowEps] = useState(false); const [hasNext, setHasNext] = useState(false)
  const [showNextPrompt, setShowNextPrompt] = useState(false)
  const [showSkip, setShowSkip] = useState(false); const [locked, setLocked] = useState(false)
  const [fit, setFit] = useState<'contain' | 'cover'>('cover')
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([])
  const [showAudio, setShowAudio] = useState(false)
  const [seekIndicator, setSeekIndicator] = useState<{ side: 'left' | 'right'; seconds: number } | null>(null)
  const [showSubs, setShowSubs] = useState(false)
  const [subsEnabled, setSubsEnabled] = useState(false)

  // Force landscape
  useEffect(() => {
    const go = async () => {
      try { const el = document.documentElement; if (el.requestFullscreen) await el.requestFullscreen(); else if ((el as any).webkitRequestFullscreen) await (el as any).webkitRequestFullscreen() } catch {}
      try { await (screen.orientation as any)?.lock?.('landscape') } catch {}
    }
    go(); document.documentElement.classList.add('force-landscape')
    return () => { document.documentElement.classList.remove('force-landscape'); try { (screen.orientation as any)?.unlock?.() } catch {}; try { if (document.fullscreenElement) document.exitFullscreen() } catch {} }
  }, [])

  // Fetch source
  useEffect(() => {
    async function load() {
      setLoading(true)
      const p = new URLSearchParams({ tmdb_id: id, type })
      if (type === 'tv') { p.set('season_number', String(season)); p.set('episode_number', String(episode)) }
      const [srcRes, detailRes] = await Promise.all([
        fetch(`/api/video-source?${p}`).then(r => r.json()),
        fetch(`https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_KEY}`).then(r => r.json()),
      ])
      setSrc(srcRes.url || null); setTitle(detailRes.title || detailRes.name || '')
      if (type === 'tv') {
        setSeasons((detailRes.seasons || []).filter((s: any) => s.season_number > 0).map((s: any) => ({ season_number: s.season_number, name: s.name })))
        setSheetSeason(season)
        const sRes = await fetch(`https://api.themoviedb.org/3/tv/${id}/season/${season}?api_key=${TMDB_KEY}`).then(r => r.json())
        const eps = (sRes.episodes || []).map((e: any) => ({ id: e.id, episode_number: e.episode_number, name: e.name, still_path: e.still_path, runtime: e.runtime }))
        setEpisodes(eps)
        const cur = eps.find((e: Episode) => e.episode_number === episode)
        setEpTitle(cur ? `S${season}:E${episode} ${cur.name}` : '')
        setHasNext(eps.findIndex((e: Episode) => e.episode_number === episode) < eps.length - 1)
      }
    }
    load()
  }, [id, type, season, episode])

  // Sheet season change
  useEffect(() => {
    if (type !== 'tv' || sheetSeason === season) return
    fetch(`https://api.themoviedb.org/3/tv/${id}/season/${sheetSeason}?api_key=${TMDB_KEY}`).then(r => r.json())
      .then(d => setEpisodes((d.episodes || []).map((e: any) => ({ id: e.id, episode_number: e.episode_number, name: e.name, still_path: e.still_path, runtime: e.runtime })))).catch(() => {})
  }, [sheetSeason, type, id, season])

  // Init HLS
  useEffect(() => {
    const v = videoRef.current; if (!v || !src) return
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    if (src.endsWith('.m3u8') && Hls.isSupported()) {
      const kb = hexToBytes(HLS_KEY_HEX)
      const CL = class extends Hls.DefaultConfig.loader {
        load(ctx: any, cfg: any, cb: any) {
          if (ctx.url.includes('data:text/plain') || ctx.type === 'key') { setTimeout(() => cb.onSuccess({ url: ctx.url, data: kb.buffer }, { trequest: performance.now(), tfirst: performance.now(), tload: performance.now(), loaded: 16, total: 16 }, ctx, null), 0); return }
          super.load(ctx, cfg, cb)
        }
      }
      const hls = new Hls({ enableWorker: true, loader: CL as any })
      hls.loadSource(src); hls.attachMedia(v)
      hls.on(Hls.Events.MANIFEST_PARSED, () => { v.play().catch(() => {}); setLoading(false) })
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => setAudioTracks(hls.audioTracks.map((t, i) => ({ id: i, label: t.name || t.lang?.toUpperCase() || `Track ${i + 1}`, lang: t.lang || '' }))))
      hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) { if (d.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad(); else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError() } })
      hlsRef.current = hls
    } else { v.src = src; v.play().catch(() => {}); setLoading(false) }
    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null } }
  }, [src])

  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current; if (!v || seeking) return
    setCt(v.currentTime); setDur(v.duration || 0); setPlaying(!v.paused)
    setShowSkip(v.currentTime >= 15 && v.currentTime < 75)
    if (type === 'tv' && hasNext && v.duration && v.currentTime > v.duration - 30) setShowNextPrompt(true); else setShowNextPrompt(false)
  }, [seeking, type, hasNext])

  const resetTimer = () => { if (controlsTimer.current) clearTimeout(controlsTimer.current); setShowControls(true); controlsTimer.current = setTimeout(() => setShowControls(false), 4000) }

  // Double tap to seek
  const handleTap = (e: React.MouseEvent | React.TouchEvent) => {
    if (locked) return
    if (showEps || showAudio) { setShowEps(false); setShowAudio(false); return }
    const clientX = 'touches' in e ? e.changedTouches[0].clientX : e.clientX
    const halfW = window.innerWidth / 2
    tapCount.current++
    if (tapCount.current === 1) {
      doubleTapTimer.current = setTimeout(() => {
        tapCount.current = 0
        setShowControls(prev => !prev)
        if (!showControls) resetTimer()
      }, 250)
    } else if (tapCount.current === 2) {
      if (doubleTapTimer.current) clearTimeout(doubleTapTimer.current)
      tapCount.current = 0
      const v = videoRef.current; if (!v) return
      const delta = clientX < halfW ? -10 : 10
      v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + delta))
      setSeekIndicator({ side: delta < 0 ? 'left' : 'right', seconds: Math.abs(delta) })
      setTimeout(() => setSeekIndicator(null), 600)
      resetTimer()
    }
  }

  const togglePlay = (e: React.MouseEvent) => { e.stopPropagation(); const v = videoRef.current; if (!v) return; if (v.paused) { v.play(); resetTimer() } else v.pause() }
  const seek = (d: number, e: React.MouseEvent) => { e.stopPropagation(); const v = videoRef.current; if (!v) return; v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + d)); resetTimer() }

  const handleNextEp = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    const idx = episodes.findIndex(ep => ep.episode_number === episode)
    if (idx < episodes.length - 1) router.push(`/watch/tv/${id}?s=${season}&e=${episodes[idx + 1].episode_number}`)
  }

  const togglePiP = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const v = videoRef.current; if (!v) return
    try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await v.requestPictureInPicture() } catch {}
  }

  const setAudioTrack = (id: number) => { if (hlsRef.current) hlsRef.current.audioTrack = id; setShowAudio(false) }

  const progress = dur > 0 ? (ct / dur) * 100 : 0

  return (
    <div className="fixed inset-0 bg-black z-50" onClick={handleTap}>
      <video ref={videoRef} className={`w-full h-full ${fit === 'cover' ? 'object-cover' : 'object-contain'}`} playsInline onTimeUpdate={onTimeUpdate} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onWaiting={() => setLoading(true)} onCanPlay={() => setLoading(false)} />

      {loading && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="w-12 h-12 border-3 border-white/20 border-t-[#e50914] rounded-full animate-spin" /></div>}

      {/* Double tap indicators */}
      {seekIndicator && (
        <div className={`absolute top-1/2 -translate-y-1/2 ${seekIndicator.side === 'left' ? 'left-12' : 'right-12'} bg-black/50 backdrop-blur rounded-full px-4 py-2 pointer-events-none animate-in fade-in duration-200`}>
          <span className="text-white font-bold text-sm">{seekIndicator.side === 'left' ? '-' : '+'}{seekIndicator.seconds}s</span>
        </div>
      )}

      {showSkip && !locked && <button onClick={e => { e.stopPropagation(); if (videoRef.current) videoRef.current.currentTime = 75 }} className="absolute bottom-20 right-6 px-5 py-2.5 bg-white/90 text-black text-sm font-bold rounded-lg active:bg-white/70 z-20">Skip Intro</button>}
      {showNextPrompt && !locked && (
        <div className="absolute bottom-20 right-6 bg-[#1a1a1a]/90 backdrop-blur rounded-xl p-3 z-20" onClick={e => e.stopPropagation()}>
          <p className="text-white/60 text-xs mb-2">Up Next</p>
          <button onClick={handleNextEp} className="flex items-center gap-2 text-white text-sm font-medium"><svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M6 4l12 8-12 8z"/></svg>Next Episode</button>
        </div>
      )}

      {/* Controls */}
      {showControls && !loading && !locked && (
        <div className="absolute inset-0 flex flex-col justify-between z-10" onClick={e => e.stopPropagation()}>
          {/* Top */}
          <div className="flex items-center gap-3 px-6 pt-4 bg-gradient-to-b from-black/70 to-transparent">
            <button onClick={() => router.back()} className="w-9 h-9 flex items-center justify-center active:opacity-50"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}><path d="M15 19l-7-7 7-7"/></svg></button>
            <div className="flex-1 min-w-0"><p className="text-white text-sm font-semibold truncate">{title}</p>{epTitle && <p className="text-white/50 text-xs truncate">{epTitle}</p>}</div>
            {/* PiP */}
            <button onClick={togglePiP} className="w-9 h-9 flex items-center justify-center active:opacity-50"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.5}><rect x="2" y="3" width="20" height="14" rx="2"/><rect x="12" y="9" width="8" height="6" rx="1" fill="white" fillOpacity={0.3}/></svg></button>
            {/* Fit/Zoom */}
            <button onClick={e => { e.stopPropagation(); setFit(f => f === 'contain' ? 'cover' : 'contain') }} className="w-9 h-9 flex items-center justify-center active:opacity-50">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.5}>{fit === 'contain' ? <><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></> : <><path d="M4 14h6v6M14 4h6v6M10 14l-7 7M20 4l-6 6"/></>}</svg>
            </button>
            <button onClick={() => { setLocked(true); setShowControls(false) }} className="w-9 h-9 flex items-center justify-center active:opacity-50"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.5}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></button>
          </div>

          {/* Center */}
          <div className="flex items-center justify-center gap-14">
            <button onClick={e => seek(-10, e)} className="text-white active:scale-90 flex flex-col items-center"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M12.5 8.5l-4 3.5 4 3.5M4 12a8 8 0 1116 0 8 8 0 01-16 0z"/></svg><span className="text-[10px] -mt-1">10</span></button>
            <button onClick={togglePlay} className="w-18 h-18 bg-white/20 backdrop-blur rounded-full flex items-center justify-center active:scale-90 p-4">{playing ? <svg width="32" height="32" viewBox="0 0 24 24" fill="white"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg> : <svg width="32" height="32" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>}</button>
            <button onClick={e => seek(10, e)} className="text-white active:scale-90 flex flex-col items-center"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M11.5 8.5l4 3.5-4 3.5M20 12a8 8 0 11-16 0 8 8 0 0116 0z"/></svg><span className="text-[10px] -mt-1">10</span></button>
          </div>

          {/* Bottom */}
          <div className="px-6 pb-4 bg-gradient-to-t from-black/70 to-transparent">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-white/60 text-xs tabular-nums w-12">{fmtTime(ct)}</span>
              <input type="range" min={0} max={dur || 0} value={ct} onChange={e => { const v = videoRef.current; if (v) { v.currentTime = parseFloat(e.target.value); setCt(v.currentTime) } }} onTouchStart={() => setSeeking(true)} onTouchEnd={() => setSeeking(false)}
                className="flex-1 h-1 appearance-none bg-white/20 rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-[#e50914] [&::-webkit-slider-thumb]:rounded-full"
                style={{ background: `linear-gradient(to right, #e50914 ${progress}%, rgba(255,255,255,0.2) ${progress}%)` }} />
              <span className="text-white/60 text-xs tabular-nums w-14 text-right">-{fmtTime(dur - ct)}</span>
            </div>
            {/* Bottom row: audio/subs left, episode controls right */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-5">
                {audioTracks.length > 1 && (
                  <button onClick={e => { e.stopPropagation(); setShowAudio(!showAudio) }} className="text-white/60 flex flex-col items-center gap-0.5 active:text-white">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M9 18V5l12-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zm12-2a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    <span className="text-[9px]">Audio</span>
                  </button>
                )}
                <button onClick={e => { e.stopPropagation(); setSubsEnabled(!subsEnabled) }} className={`flex flex-col items-center gap-0.5 active:opacity-70 ${subsEnabled ? 'text-[#e50914]' : 'text-white/60'}`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 12h4M14 12h4M6 16h12"/></svg>
                  <span className="text-[9px]">Subtitles</span>
                </button>
              </div>
              <div className="flex items-center gap-5">
                {type === 'tv' && hasNext && (
                  <button onClick={handleNextEp} className="text-white/60 flex flex-col items-center gap-0.5 active:text-white">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l12 8-12 8zM18 4h2v16h-2z"/></svg>
                    <span className="text-[9px]">Next</span>
                  </button>
                )}
                {type === 'tv' && episodes.length > 0 && (
                  <button onClick={e => { e.stopPropagation(); setShowEps(true) }} className="text-white/60 flex flex-col items-center gap-0.5 active:text-white">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 6h16M4 12h16M4 18h16"/></svg>
                    <span className="text-[9px]">Episodes</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lock */}
      {locked && <div className="absolute top-4 left-6 z-20"><button onClick={() => { setLocked(false); resetTimer() }} className="px-4 py-2 bg-white/10 backdrop-blur rounded-full text-white text-xs font-medium active:bg-white/20 flex items-center gap-2"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>Unlock</button></div>}

      {/* Audio selector */}
      {showAudio && (
        <div className="absolute bottom-20 left-6 bg-[#111]/95 backdrop-blur rounded-xl p-3 z-30 min-w-[160px]" onClick={e => e.stopPropagation()}>
          <p className="text-white/40 text-xs mb-2">Audio Track</p>
          {audioTracks.map(t => (
            <button key={t.id} onClick={() => setAudioTrack(t.id)} className={`w-full text-left px-3 py-2 rounded-lg text-sm ${hlsRef.current?.audioTrack === t.id ? 'text-[#e50914] bg-white/[0.06]' : 'text-white/70 active:bg-white/[0.06]'}`}>{t.label}</button>
          ))}
        </div>
      )}

      {/* Episode sheet */}
      {showEps && (
        <div className="absolute inset-0 z-30 bg-black/80" onClick={() => setShowEps(false)}>
          <div className="absolute right-0 top-0 bottom-0 w-[340px] bg-[#111] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-[#111] z-10 px-4 pt-4 pb-2 border-b border-white/[0.06]">
              <div className="flex items-center justify-between mb-3"><h3 className="text-white font-bold text-base">Episodes</h3><button onClick={() => setShowEps(false)} className="text-white/40 p-1"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>
              {seasons.length > 1 && <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">{seasons.map(s => (<button key={s.season_number} onClick={() => setSheetSeason(s.season_number)} className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${sheetSeason === s.season_number ? 'bg-white text-black' : 'bg-white/[0.08] text-white/50'}`}>S{s.season_number}</button>))}</div>}
            </div>
            <div className="p-3 space-y-2">
              {episodes.map(ep => {
                const isCur = ep.episode_number === episode && sheetSeason === season
                return (
                  <button key={ep.id} onClick={() => { setShowEps(false); router.push(`/watch/tv/${id}?s=${sheetSeason}&e=${ep.episode_number}`) }} className={`w-full flex gap-3 p-2 rounded-xl text-left ${isCur ? 'bg-[#e50914]/15 ring-1 ring-[#e50914]/30' : 'active:bg-white/[0.06]'}`}>
                    <div className="w-24 aspect-video rounded-lg overflow-hidden bg-[#252525] flex-shrink-0 relative">
                      {ep.still_path ? <img src={`https://image.tmdb.org/t/p/w300${ep.still_path}`} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white/15 text-lg font-bold">{ep.episode_number}</div>}
                    </div>
                    <div className="flex-1 min-w-0 py-0.5"><p className={`text-xs font-semibold truncate ${isCur ? 'text-[#e50914]' : 'text-white/80'}`}>E{ep.episode_number} &middot; {ep.name}</p>{ep.runtime && <p className="text-white/30 text-[10px] mt-0.5">{ep.runtime}m</p>}</div>
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
