'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { prefetchVideo } from '@/lib/prefetch-video'

interface ProgressItem {
  tmdb_id: number; type: 'movie' | 'tv'; progress_seconds: number; duration_seconds: number
  completed?: boolean; season_number?: number | null; episode_number?: number | null
}

interface DisplayItem extends ProgressItem {
  title: string; backdrop_path: string | null
}

const TMDB_KEY = '5c242b6eeca95f02957505a67a488635'

export function ContinueWatching() {
  const [items, setItems] = useState<DisplayItem[]>([])

  useEffect(() => {
    const profileId = localStorage.getItem('streamcorn_profile_id')
    if (!profileId) return

    async function load() {
      try {
        const res = await fetch(`/api/watch-progress?profile_id=${profileId}`)
        if (!res.ok) return
        const { items: progress } = await res.json()
        if (!progress?.length) return

        const filtered = progress.filter((p: ProgressItem) => !p.completed && p.progress_seconds > 10)

        // Deduplicate: for TV shows, keep only the most recent episode per show
        const deduped: ProgressItem[] = []
        const seenTVShows = new Set<number>()
        for (const p of filtered) {
          if (p.type === 'tv') {
            if (seenTVShows.has(p.tmdb_id)) continue
            seenTVShows.add(p.tmdb_id)
          }
          deduped.push(p)
        }

        const incomplete = deduped.slice(0, 10)
        if (!incomplete.length) return

        const enriched = await Promise.all(incomplete.map(async (p: ProgressItem) => {
          try {
            const ep = p.type === 'movie' ? `/movie/${p.tmdb_id}` : `/tv/${p.tmdb_id}`
            const d = await fetch(`https://api.themoviedb.org/3${ep}?api_key=${TMDB_KEY}`).then(r => r.json())
            return { ...p, title: d.title || d.name || '', backdrop_path: d.backdrop_path }
          } catch { return null }
        }))

        setItems(enriched.filter(Boolean) as DisplayItem[])
      } catch {}
    }
    load()
  }, [])

  if (items.length === 0) return null

  return (
    <div className="mb-6">
      <h2 className="text-base font-bold text-white px-4 mb-2.5">Continue Watching</h2>
      <div className="flex gap-2.5 overflow-x-auto scrollbar-hide px-4">
        {items.map(item => {
          const pct = item.duration_seconds > 0 ? (item.progress_seconds / item.duration_seconds) * 100 : 0
          const remaining = Math.max(0, item.duration_seconds - item.progress_seconds)
          const mins = Math.ceil(remaining / 60)
          const img = item.backdrop_path ? `https://image.tmdb.org/t/p/w400${item.backdrop_path}` : null
          const href = item.type === 'movie' ? `/watch/movie/${item.tmdb_id}` : `/watch/tv/${item.tmdb_id}?s=${item.season_number || 1}&e=${item.episode_number || 1}`

          return (
            <Link key={`${item.type}-${item.tmdb_id}-${item.season_number}-${item.episode_number}`} href={href} className="flex-shrink-0 w-[155px]"
              onTouchStart={() => prefetchVideo(item.tmdb_id, item.type as 'movie' | 'tv', item.season_number || undefined, item.episode_number || undefined)}
            >
              <div className="relative aspect-video rounded-lg overflow-hidden bg-[#1a1a1a]">
                {img && <img src={img} alt={item.title} className="w-full h-full object-cover" />}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-10 h-10 bg-black/60 rounded-full flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/20">
                  <div className="h-full bg-[#e50914] rounded-r" style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
                {item.type === 'tv' && item.season_number && item.episode_number && (
                  <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-black/70 rounded text-[9px] text-white/80 font-medium">
                    S{item.season_number}:E{item.episode_number}
                  </div>
                )}
              </div>
              <p className="text-white/70 text-xs mt-1.5 truncate">{item.title}</p>
              <p className="text-white/30 text-[10px]">{mins}m remaining</p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
