'use client'

import { useState, useEffect } from 'react'

export default function TestPlayer() {
  const [mods, setMods] = useState<any>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Load Video.js 10 modules
  useEffect(() => {
    Promise.all([
      import('@videojs/react'),
      import('@videojs/react/video'),
      import('@videojs/react/media/hls-video'),
      import('@videojs/react/video/skin.css'),
    ]).then(([react, video, hlsVideo]) => {
      const Player = react.createPlayer({ features: react.videoFeatures })
      setMods({ Player, VideoSkin: video.VideoSkin, HlsVideo: hlsVideo.HlsVideo })
    })
  }, [])

  // Fetch actual HLS source
  useEffect(() => {
    fetch('/api/video-source?tmdb_id=484133&type=movie')
      .then(r => r.json())
      .then(d => { setSrc(d.url || null); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Lock landscape on mobile
  useEffect(() => {
    try { (screen.orientation as any)?.lock?.('landscape').catch(() => {}) } catch {}
    return () => { try { (screen.orientation as any)?.unlock?.() } catch {} }
  }, [])

  if (!mods || loading) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
        <div style={{ width: 48, height: 48, border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#e50914', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (!src) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>No video source found</p>
      </div>
    )
  }

  const { Player, VideoSkin, HlsVideo } = mods

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#000', zIndex: 9999 }}>
      <Player.Provider>
        <VideoSkin>
          <HlsVideo src={src} playsInline autoPlay />
        </VideoSkin>
      </Player.Provider>
    </div>
  )
}
