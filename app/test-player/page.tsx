'use client'

import { useState, useEffect, useRef } from 'react'
import Hls from 'hls.js'

const HLS_KEY_HEX = process.env.NEXT_PUBLIC_HLS_KEY || ''

function hexToBytes(hex: string): Uint8Array {
  const b = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) b[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  return b
}

// Inner component that uses Video.js 10 hooks (must be inside Player.Provider)
function PlayerInner({ src, vjsMods }: { src: string; vjsMods: any }) {
  const { VideoSkin, Video, useMedia } = vjsMods
  const media = useMedia()
  const hlsRef = useRef<Hls | null>(null)
  const attached = useRef(false)

  // Once video element is available, attach hls.js with custom key loader
  useEffect(() => {
    if (!media || attached.current) return
    // Get the actual <video> element from Video.js 10
    const v = (media as any)?.target || (media as any)?.nativeEl || document.querySelector('video')
    if (!v) return
    attached.current = true

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }

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
      v.play().catch(() => {})
    })
    hls.on(Hls.Events.ERROR, (_, d: any) => {
      if (d.fatal) {
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad()
        else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError()
      }
    })
    hlsRef.current = hls

    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
      attached.current = false
    }
  }, [media, src])

  return (
    <VideoSkin>
      <Video playsInline />
    </VideoSkin>
  )
}

export default function TestPlayer() {
  const [mods, setMods] = useState<any>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Load Video.js 10 modules
  useEffect(() => {
    Promise.all([
      import('@videojs/react'),
      import('@videojs/react/video'),
      import('@videojs/react/video/skin.css'),
    ]).then(([react, video]) => {
      const Player = react.createPlayer({ features: react.videoFeatures })
      setMods({
        Player,
        VideoSkin: video.VideoSkin,
        Video: video.Video,
        useMedia: react.useMedia,
      })
    })
  }, [])

  // Fetch actual HLS source
  useEffect(() => {
    fetch('/api/video-source?tmdb_id=484133&type=movie')
      .then(r => r.json())
      .then(d => { setSrc(d.url || null); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Force landscape fullscreen
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

  if (!mods || loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-[9999]">
        <div className="w-12 h-12 border-3 border-white/20 border-t-[#e50914] rounded-full animate-spin" />
      </div>
    )
  }

  if (!src) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-[9999]">
        <p className="text-white/50 text-sm">No video source found</p>
      </div>
    )
  }

  const { Player } = mods

  return (
    <div className="fixed inset-0 bg-black z-[9999]">
      <Player.Provider>
        <PlayerInner src={src} vjsMods={mods} />
      </Player.Provider>
    </div>
  )
}
