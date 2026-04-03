'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Hls from 'hls.js'

const HLS_KEY_HEX = process.env.NEXT_PUBLIC_HLS_KEY || ''
const TMDB_KEY = '5c242b6eeca95f02957505a67a488635'

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  return bytes
}

function formatTime(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}` : `${m}:${sec.toString().padStart(2, '0')}`
}

interface Episode { id: number; episode_number: number; name: string; still_path: string | null; runtime?: number | null }
interface SeasonInfo { season_number: number; name: string; episode_count: number }

export default function WatchPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const type = params.type as string
  const id = params.id as string
  const season = parseInt(searchParams.get('s') || '1')
  const episode = parseInt(searchParams.get('e') || '1')

  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [src, setSrc] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [episodeTitle, setEpisodeTitle] = useState('')
  const [showControls, setShowControls] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [loading, setLoading] = useState(true)
  const [seeking, setSeeking] = useState(false)
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [seasons, setSeasons] = useState<SeasonInfo[]>([])
  const [sheetSeason, setSheetSeason] = useState(season)
  const [showEpisodes, setShowEpisodes] = useState(false)
  const [hasNext, setHasNext] = useState(false)
  const [showNextPrompt, setShowNextPrompt] = useState(false)
  const [skipIntro, setSkipIntro] = useState<{ start: number; end: number } | null>(null)
  const [showSkipIntro, setShowSkipIntro] = useState(false)
  const [locked, setLocked] = useState(false)

  // Force landscape: fullscreen + orientation lock + CSS fallback
  useEffect(() => {
    const enterLandscape = async () => {
      try {
        const el = document.documentElement
        if (el.requestFullscreen) await el.requestFullscreen()
        else if ((el as any).webkitRequestFullscreen) await (el as any).webkitRequestFullscreen()
      } catch {}
      try { await (screen.orientation as any)?.lock?.('landscape') } catch {}
    }
    enterLandscape()

    // Add landscape-force class to html
    document.documentElement.classList.add('force-landscape')

    return () => {
      document.documentElement.classList.remove('force-landscape')
      try { (screen.orientation as any)?.unlock?.() } catch {}
      try { if (document.fullscreenElement) document.exitFullscreen() } catch {}
    }
  }, [])

  // Fetch video source + metadata
  useEffect(() => {
    async function load() {
      setLoading(true)
      const p = new URLSearchParams({ tmdb_id: id, type })
      if (type === 'tv') { p.set('season_number', String(season)); p.set('episode_number', String(episode)) }

      const [srcRes, detailRes] = await Promise.all([
        fetch(`/api/video-source?${p}`).then(r => r.json()),
        fetch(`https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_KEY}`).then(r => r.json()),
      ])

      setSrc(srcRes.url || null)
      setTitle(detailRes.title || detailRes.name || '')

      // Fetch seasons list + episodes for TV
      if (type === 'tv') {
        const allSeasons = (detailRes.seasons || []).filter((s: any) => s.season_number > 0).map((s: any) => ({
          season_number: s.season_number, name: s.name, episode_count: s.episode_count,
        }))
        setSeasons(allSeasons)
        setSheetSeason(season)

        const seasonRes = await fetch(`https://api.themoviedb.org/3/tv/${id}/season/${season}?api_key=${TMDB_KEY}`).then(r => r.json())
        const eps = (seasonRes.episodes || []).map((e: any) => ({
          id: e.id, episode_number: e.episode_number, name: e.name, still_path: e.still_path, runtime: e.runtime,
        }))
        setEpisodes(eps)
        const currentEp = eps.find((e: Episode) => e.episode_number === episode)
        setEpisodeTitle(currentEp ? `S${season}:E${episode} ${currentEp.name}` : '')
        const idx = eps.findIndex((e: Episode) => e.episode_number === episode)
        setHasNext(idx < eps.length - 1)
      }

      setSkipIntro({ start: 15, end: 75 })
    }
    load()
  }, [id, type, season, episode])

  // Fetch episodes when sheet season changes
  useEffect(() => {
    if (type !== 'tv' || sheetSeason === season) return
    fetch(`https://api.themoviedb.org/3/tv/${id}/season/${sheetSeason}?api_key=${TMDB_KEY}`)
      .then(r => r.json())
      .then(d => setEpisodes((d.episodes || []).map((e: any) => ({
        id: e.id, episode_number: e.episode_number, name: e.name, still_path: e.still_path, runtime: e.runtime,
      }))))
      .catch(() => {})
  }, [sheetSeason, type, id, season])

  // Init HLS
  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }

    if (src.endsWith('.m3u8') && Hls.isSupported()) {
      const keyBytes = hexToBytes(HLS_KEY_HEX)
      const CustomLoader = class extends Hls.DefaultConfig.loader {
        load(context: any, config: any, callbacks: any) {
          if (context.url.includes('data:text/plain') || context.type === 'key') {
            setTimeout(() => callbacks.onSuccess(
              { url: context.url, data: keyBytes.buffer },
              { trequest: performance.now(), tfirst: performance.now(), tload: performance.now(), loaded: 16, total: 16 },
              context, null
            ), 0)
            return
          }
          super.load(context, config, callbacks)
        }
      }
      const hls = new Hls({ enableWorker: true, loader: CustomLoader as any })
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); setLoading(false) })
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad()
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError()
        }
      })
      hlsRef.current = hls
    } else {
      video.src = src
      video.play().catch(() => {})
      setLoading(false)
    }
    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null } }
  }, [src])

  // Time tracking
  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current
    if (!v || seeking) return
    setCurrentTime(v.currentTime)
    setDuration(v.duration || 0)
    setPlaying(!v.paused)

    // Skip intro visibility
    if (skipIntro && v.currentTime >= skipIntro.start && v.currentTime < skipIntro.end) {
      setShowSkipIntro(true)
    } else {
      setShowSkipIntro(false)
    }

    // Next episode prompt (last 30s)
    if (type === 'tv' && hasNext && v.duration && v.currentTime > v.duration - 30) {
      setShowNextPrompt(true)
    } else {
      setShowNextPrompt(false)
    }
  }, [seeking, skipIntro, type, hasNext])

  // Controls auto-hide
  const resetControlsTimer = () => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current)
    setShowControls(true)
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 4000)
  }

  const handleTap = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (locked) return
    if (showEpisodes) { setShowEpisodes(false); return }
    setShowControls(prev => !prev)
    if (!showControls) resetControlsTimer()
  }

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation()
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play(); resetControlsTimer() } else v.pause()
  }

  const seek = (delta: number, e: React.MouseEvent) => {
    e.stopPropagation()
    const v = videoRef.current
    if (!v) return
    v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + delta))
    resetControlsTimer()
  }

  const handleSeekBar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current
    if (!v) return
    const t = parseFloat(e.target.value)
    v.currentTime = t
    setCurrentTime(t)
  }

  const handleSkipIntro = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (videoRef.current && skipIntro) videoRef.current.currentTime = skipIntro.end
  }

  const handleNextEpisode = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    const idx = episodes.findIndex(ep => ep.episode_number === episode)
    if (idx < episodes.length - 1) {
      const next = episodes[idx + 1]
      router.push(`/watch/tv/${id}?s=${season}&e=${next.episode_number}`)
    }
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="fixed inset-0 bg-black z-50" onClick={handleTap}>
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        onTimeUpdate={onTimeUpdate}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onWaiting={() => setLoading(true)}
        onCanPlay={() => setLoading(false)}
      />

      {/* Loading spinner */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-12 h-12 border-3 border-white/20 border-t-[#e50914] rounded-full animate-spin" />
        </div>
      )}

      {/* Skip Intro */}
      {showSkipIntro && !locked && (
        <button
          onClick={handleSkipIntro}
          className="absolute bottom-24 right-4 px-5 py-2.5 bg-white/90 text-black text-sm font-bold rounded-lg active:bg-white/70 z-20"
        >
          Skip Intro
        </button>
      )}

      {/* Next Episode Prompt */}
      {showNextPrompt && !locked && (
        <div className="absolute bottom-24 right-4 bg-[#1a1a1a]/90 backdrop-blur rounded-xl p-3 z-20" onClick={e => e.stopPropagation()}>
          <p className="text-white/60 text-xs mb-2">Up Next</p>
          <button onClick={handleNextEpisode} className="flex items-center gap-2 text-white text-sm font-medium active:text-white/70">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M6 4l12 8-12 8z"/></svg>
            Next Episode
          </button>
        </div>
      )}

      {/* Controls overlay */}
      {showControls && !loading && !locked && (
        <div className="absolute inset-0 flex flex-col justify-between z-10" onClick={e => e.stopPropagation()}>
          {/* Top */}
          <div className="flex items-center gap-3 p-4 bg-gradient-to-b from-black/70 to-transparent">
            <button onClick={() => router.back()} className="w-9 h-9 flex items-center justify-center active:opacity-50">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold truncate">{title}</p>
              {episodeTitle && <p className="text-white/50 text-xs truncate">{episodeTitle}</p>}
            </div>
            {/* Episode list button (TV only) */}
            {type === 'tv' && episodes.length > 0 && (
              <button onClick={() => setShowEpisodes(true)} className="w-9 h-9 flex items-center justify-center active:opacity-50">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}><path d="M4 6h16M4 12h16M4 18h16"/></svg>
              </button>
            )}
            {/* Lock button */}
            <button onClick={() => { setLocked(true); setShowControls(false) }} className="w-9 h-9 flex items-center justify-center active:opacity-50">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            </button>
          </div>

          {/* Center */}
          <div className="flex items-center justify-center gap-14">
            <button onClick={(e) => seek(-10, e)} className="text-white active:scale-90 flex flex-col items-center">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M12.5 8.5l-4 3.5 4 3.5M4 12a8 8 0 1116 0 8 8 0 01-16 0z"/></svg>
              <span className="text-[10px] -mt-1">10</span>
            </button>
            <button onClick={togglePlay} className="w-18 h-18 bg-white/20 backdrop-blur rounded-full flex items-center justify-center active:scale-90 p-4">
              {playing ? (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="white"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
              ) : (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
              )}
            </button>
            <button onClick={(e) => seek(10, e)} className="text-white active:scale-90 flex flex-col items-center">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M11.5 8.5l4 3.5-4 3.5M20 12a8 8 0 11-16 0 8 8 0 0116 0z"/></svg>
              <span className="text-[10px] -mt-1">10</span>
            </button>
          </div>

          {/* Bottom */}
          <div className="p-4 bg-gradient-to-t from-black/70 to-transparent">
            {/* Seek bar */}
            <input
              type="range"
              min={0}
              max={duration || 0}
              value={currentTime}
              onChange={handleSeekBar}
              onTouchStart={() => setSeeking(true)}
              onTouchEnd={() => setSeeking(false)}
              className="w-full h-1 appearance-none bg-white/20 rounded-full mb-2 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[#e50914] [&::-webkit-slider-thumb]:rounded-full"
              style={{ background: `linear-gradient(to right, #e50914 ${progress}%, rgba(255,255,255,0.2) ${progress}%)` }}
            />
            <div className="flex items-center justify-between text-xs text-white/50">
              <span>{formatTime(currentTime)}</span>
              <div className="flex items-center gap-4">
                {/* Next episode button */}
                {type === 'tv' && hasNext && (
                  <button onClick={handleNextEpisode} className="active:opacity-50">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M6 4l12 8-12 8zM18 4h2v16h-2z"/></svg>
                  </button>
                )}
              </div>
              <span>{formatTime(duration - currentTime)} left</span>
            </div>
          </div>
        </div>
      )}

      {/* Lock overlay */}
      {locked && (
        <div className="absolute top-4 left-4 z-20">
          <button onClick={() => { setLocked(false); resetControlsTimer() }} className="px-4 py-2 bg-white/10 backdrop-blur rounded-full text-white text-xs font-medium active:bg-white/20 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            Unlock
          </button>
        </div>
      )}

      {/* Episode selector sheet */}
      {showEpisodes && (
        <div className="absolute inset-0 z-30 bg-black/80" onClick={() => setShowEpisodes(false)}>
          <div className="absolute right-0 top-0 bottom-0 w-[340px] bg-[#111] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-[#111] z-10 px-4 pt-4 pb-2 border-b border-white/[0.06]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-bold text-base">Episodes</h3>
                <button onClick={() => setShowEpisodes(false)} className="text-white/40 p-1 active:text-white">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
              {/* Season tabs */}
              {seasons.length > 1 && (
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
                  {seasons.map(s => (
                    <button
                      key={s.season_number}
                      onClick={() => setSheetSeason(s.season_number)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${sheetSeason === s.season_number ? 'bg-white text-black' : 'bg-white/[0.08] text-white/50 active:bg-white/[0.15]'}`}
                    >
                      S{s.season_number}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Episode list */}
            <div className="p-3 space-y-2">
              {episodes.map(ep => {
                const isCurrent = ep.episode_number === episode && sheetSeason === season
                return (
                  <button
                    key={ep.id}
                    onClick={() => {
                      setShowEpisodes(false)
                      router.push(`/watch/tv/${id}?s=${sheetSeason}&e=${ep.episode_number}`)
                    }}
                    className={`w-full flex gap-3 p-2 rounded-xl text-left ${isCurrent ? 'bg-[#e50914]/15 ring-1 ring-[#e50914]/30' : 'active:bg-white/[0.06]'}`}
                  >
                    {/* Thumbnail */}
                    <div className="w-24 aspect-video rounded-lg overflow-hidden bg-[#252525] flex-shrink-0 relative">
                      {ep.still_path ? (
                        <img src={`https://image.tmdb.org/t/p/w300${ep.still_path}`} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/15 text-lg font-bold">{ep.episode_number}</div>
                      )}
                      {isCurrent && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                          <div className="w-5 h-5 border-2 border-white rounded-full flex items-center justify-center">
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="white"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 py-0.5">
                      <p className={`text-xs font-semibold truncate ${isCurrent ? 'text-[#e50914]' : 'text-white/80'}`}>
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
