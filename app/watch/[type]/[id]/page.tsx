'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { getResumePosition } from '@/lib/watch-progress'

const TMDB_KEY = '5c242b6eeca95f02957505a67a488635'

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

export default function WatchPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()

  const type = params.type as string
  const id = params.id as string
  const season = parseInt(searchParams.get('s') || '1')
  const episode = parseInt(searchParams.get('e') || '1')
  const tmdbId = parseInt(id)
  const mediaType = type as 'movie' | 'tv'

  const [mods, setMods] = useState<any>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [ready, setReady] = useState(false)

  // Load Video.js 10
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

  // Lock landscape
  useEffect(() => {
    try { (screen.orientation as any)?.lock?.('landscape').catch(() => {}) } catch {}
    return () => { try { (screen.orientation as any)?.unlock?.() } catch {} }
  }, [])

  if (!mods || !ready) {
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
          <HlsVideo src={src} playsInline autoPlay config={{ autoStartLoad: true }} preload="auto" />
        </VideoSkin>
      </Player.Provider>
    </div>
  )
}
