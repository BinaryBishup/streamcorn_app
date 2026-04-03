'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface WatchItem {
  tmdb_id: number
  type: 'movie' | 'tv'
  progress_seconds: number
  duration_seconds: number
  completed?: boolean
  season_number?: number | null
  episode_number?: number | null
}

interface EnrichedItem extends WatchItem {
  title: string
  backdrop_path: string | null
  poster_path: string | null
}

const TMDB_KEY = '5c242b6eeca95f02957505a67a488635'

export function ContinueWatching({ profileId }: { profileId?: string }) {
  const [items, setItems] = useState<EnrichedItem[]>([])

  useEffect(() => {
    if (!profileId) return

    async function load() {
      try {
        const res = await fetch(`/api/watch-progress?profile_id=${profileId}`)
        if (!res.ok) return
        const { items: progress } = await res.json()
        if (!progress || progress.length === 0) return

        // Filter incomplete, enrich with TMDB
        const incomplete = progress.filter((p: WatchItem) => !p.completed && p.progress_seconds > 10).slice(0, 10)

        const enriched = await Promise.all(
          incomplete.map(async (p: WatchItem) => {
            try {
              const ep = p.type === 'movie' ? `/movie/${p.tmdb_id}` : `/tv/${p.tmdb_id}`
              const d = await fetch(`https://api.themoviedb.org/3${ep}?api_key=${TMDB_KEY}`).then(r => r.json())
              return {
                ...p,
                title: d.title || d.name || '',
                backdrop_path: d.backdrop_path,
                poster_path: d.poster_path,
              }
            } catch { return null }
          })
        )

        setItems(enriched.filter(Boolean) as EnrichedItem[])
      } catch {}
    }
    load()
  }, [profileId])

  if (items.length === 0) return null

  return (
    <div className="mb-6">
      <h2 className="text-base font-bold text-white px-4 mb-2.5">Continue Watching</h2>
      <div className="flex gap-2.5 overflow-x-auto scrollbar-hide px-4">
        {items.map(item => {
          const progress = item.duration_seconds > 0 ? (item.progress_seconds / item.duration_seconds) * 100 : 0
          const img = item.backdrop_path
            ? `https://image.tmdb.org/t/p/w400${item.backdrop_path}`
            : item.poster_path
              ? `https://image.tmdb.org/t/p/w342${item.poster_path}`
              : null

          const href = item.type === 'movie'
            ? `/watch/movie/${item.tmdb_id}`
            : `/watch/tv/${item.tmdb_id}?s=${item.season_number || 1}&e=${item.episode_number || 1}`

          return (
            <Link key={`${item.type}-${item.tmdb_id}`} href={href} className="flex-shrink-0 w-[150px]">
              <div className="relative aspect-video rounded-lg overflow-hidden bg-[#1a1a1a]">
                {img && <img src={img} alt={item.title} className="w-full h-full object-cover" />}
                {/* Play icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-10 h-10 bg-black/60 rounded-full flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/20">
                  <div className="h-full bg-[#e50914] rounded-r" style={{ width: `${Math.min(progress, 100)}%` }} />
                </div>
              </div>
              <p className="text-white/70 text-xs mt-1.5 truncate">{item.title}</p>
              {item.type === 'tv' && item.season_number && item.episode_number && (
                <p className="text-white/30 text-[10px]">S{item.season_number}:E{item.episode_number}</p>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
