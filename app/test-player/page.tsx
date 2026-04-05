'use client'

import { useState, useEffect, useRef } from 'react'
import Hls from 'hls.js'

export default function TestPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [vjsMods, setVjsMods] = useState<any>(null)
  const [hlsReady, setHlsReady] = useState(false)

  // Unregister old service workers on mount
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

  // Load Video.js 10 skin
  useEffect(() => {
    Promise.all([
      import('@videojs/react'),
      import('@videojs/react/video'),
      import('@videojs/react/video/skin.css'),
    ]).then(([react, video]) => {
      const Player = react.createPlayer({ features: react.videoFeatures })
      setVjsMods({ Player, VideoSkin: video.VideoSkin, Video: video.Video })
    })
  }, [])

  // Fetch video source
  useEffect(() => {
    fetch('/api/video-source?tmdb_id=484133&type=movie')
      .then(r => r.json())
      .then(d => setSrc(d.url || null))
      .catch(() => {})
  }, [])

  // Attach hls.js directly to video element
  useEffect(() => {
    const v = videoRef.current
    if (!v || !src) return

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true })
      hls.loadSource(src)
      hls.attachMedia(v)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setHlsReady(true)
        v.play().catch(() => {})
      })
      hls.on(Hls.Events.ERROR, (_, d) => {
        if (d.fatal) {
          if (d.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad()
          else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError()
        }
      })
      hlsRef.current = hls
    } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS
      v.src = src
      v.addEventListener('loadedmetadata', () => { setHlsReady(true); v.play().catch(() => {}) })
    }

    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    }
  }, [src])

  // Fullscreen landscape on tap
  const goFullscreen = async () => {
    const el = document.querySelector('.player-wrap') as HTMLElement
    if (!el) return
    try {
      if (el.requestFullscreen) await el.requestFullscreen()
      else if ((el as any).webkitRequestFullscreen) await (el as any).webkitRequestFullscreen()
    } catch {}
    try { await (screen.orientation as any)?.lock?.('landscape') } catch {}
    videoRef.current?.play().catch(() => {})
  }

  // Loading state
  if (!src || !vjsMods) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
        <div style={{ width: 48, height: 48, border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#e50914', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div
      className="player-wrap"
      onClick={goFullscreen}
      style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 9999 }}
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
