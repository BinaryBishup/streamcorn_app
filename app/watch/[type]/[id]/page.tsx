'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Hls from 'hls.js'

const HLS_KEY_HEX = process.env.NEXT_PUBLIC_HLS_KEY || ''

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  return bytes
}

export default function WatchPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const type = params.type as string
  const id = params.id as string
  const season = searchParams.get('s') || '1'
  const episode = searchParams.get('e') || '1'

  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [showControls, setShowControls] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [loading, setLoading] = useState(true)
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch video source
  useEffect(() => {
    async function load() {
      const p = new URLSearchParams({ tmdb_id: id, type })
      if (type === 'tv') { p.set('season_number', season); p.set('episode_number', episode) }

      const [srcRes, detailRes] = await Promise.all([
        fetch(`/api/video-source?${p}`).then(r => r.json()),
        fetch(`https://api.themoviedb.org/3/${type}/${id}?api_key=5c242b6eeca95f02957505a67a488635`).then(r => r.json()),
      ])

      setSrc(srcRes.url || null)
      setTitle(detailRes.title || detailRes.name || '')
    }
    load()
  }, [id, type, season, episode])

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
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {})
        setLoading(false)
      })
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

  // Time update
  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    setCurrentTime(v.currentTime)
    setDuration(v.duration || 0)
    setPlaying(!v.paused)
  }, [])

  // Tap to toggle controls
  const handleTap = () => {
    setShowControls(prev => !prev)
    if (controlsTimer.current) clearTimeout(controlsTimer.current)
    controlsTimer.current = setTimeout(() => setShowControls(false), 4000)
  }

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play()
    else v.pause()
    setPlaying(!v.paused)
  }

  const seek = (delta: number) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + delta))
  }

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = Math.floor(s % 60)
    return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}` : `${m}:${sec.toString().padStart(2, '0')}`
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
      />

      {/* Loading */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-[#e50914] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Controls overlay */}
      {showControls && !loading && (
        <div className="absolute inset-0 bg-black/40 flex flex-col justify-between" onClick={e => e.stopPropagation()}>
          {/* Top bar */}
          <div className="flex items-center gap-3 p-4 pt-safe">
            <button onClick={() => router.back()} className="w-9 h-9 bg-black/50 rounded-full flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
            <span className="text-white text-sm font-medium truncate flex-1">{title}</span>
          </div>

          {/* Center controls */}
          <div className="flex items-center justify-center gap-12">
            <button onClick={() => seek(-10)} className="text-white/80 active:scale-90">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M12.5 8.5l-4 3.5 4 3.5M4 12a8 8 0 1116 0 8 8 0 01-16 0z"/>
              </svg>
              <span className="text-[10px] block text-center -mt-1">10</span>
            </button>
            <button onClick={togglePlay} className="w-16 h-16 bg-white/20 backdrop-blur rounded-full flex items-center justify-center active:scale-90">
              {playing ? (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
              )}
            </button>
            <button onClick={() => seek(10)} className="text-white/80 active:scale-90">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M11.5 8.5l4 3.5-4 3.5M20 12a8 8 0 11-16 0 8 8 0 0116 0z"/>
              </svg>
              <span className="text-[10px] block text-center -mt-1">10</span>
            </button>
          </div>

          {/* Bottom bar */}
          <div className="p-4 pb-safe">
            <div className="flex items-center gap-3 text-xs text-white/60 mb-2">
              <span>{formatTime(currentTime)}</span>
              <div className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-[#e50914] rounded-full" style={{ width: `${progress}%` }} />
              </div>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
