'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Hls from 'hls.js'

const TMDB_KEY = '5c242b6eeca95f02957505a67a488635'

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

  const [src, setSrc] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [ready, setReady] = useState(false)

  // Unregister old service workers
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

  // Fetch source + metadata
  useEffect(() => {
    let cancelled = false
    async function load() {
      const queryParams = new URLSearchParams({ tmdb_id: id, type })
      if (type === 'tv') {
        queryParams.set('season_number', String(season))
        queryParams.set('episode_number', String(episode))
      }
      const [srcRes, detailRes] = await Promise.all([
        fetch(`/api/video-source?${queryParams}`).then(r => r.json()),
        fetch(`https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_KEY}`).then(r => r.json()),
      ])
      if (cancelled) return
      setSrc(srcRes.url || null)
      setTitle(detailRes.title || detailRes.name || '')
      setReady(true)
    }
    load()
    return () => { cancelled = true }
  }, [id, type, season, episode])

  // Attach hls.js to video
  useEffect(() => {
    const v = videoRef.current
    if (!v || !src) return

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true })
      hls.loadSource(src)
      hls.attachMedia(v)
      hls.on(Hls.Events.MANIFEST_PARSED, () => { v.play().catch(() => {}) })
      hls.on(Hls.Events.ERROR, (_, d) => {
        if (d.fatal) {
          if (d.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad()
          else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError()
        }
      })
      hlsRef.current = hls
    } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = src
      v.addEventListener('loadedmetadata', () => v.play().catch(() => {}))
    }

    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null } }
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

  if (!ready || !src) {
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
