'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { prefetchVideo } from '@/lib/prefetch-video'
import { saveProgress, buildPayload } from '@/lib/watch-progress'

interface Item {
  tmdb_id: string
  content_id: string
  type: 'movie' | 'tv'
  title: string
  backdrop_path: string | null // absolute URL from our CDN
  poster_path: string | null
  progress_seconds: number
  duration_seconds: number
  completed?: boolean
  season_number?: number | null
  episode_number?: number | null
}

export function ContinueWatching() {
  const [items, setItems] = useState<Item[]>([])

  useEffect(() => {
    const profileId = localStorage.getItem('streamcorn_profile_id')
    if (!profileId) return
    fetch(`/api/watch-progress?profile_id=${profileId}`)
      .then(r => r.ok ? r.json() : { items: [] })
      .then(({ items }: { items: Item[] }) => {
        // keep unfinished, de-dup TV shows to the most recent episode
        const filtered = (items ?? []).filter(p => !p.completed && p.progress_seconds > 10)
        const seen = new Set<string>()
        const out: Item[] = []
        for (const p of filtered) {
          if (p.type === 'tv') {
            if (seen.has(p.content_id)) continue
            seen.add(p.content_id)
          }
          out.push(p)
        }
        setItems(out.slice(0, 10))
      })
      .catch(() => {})
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
          const img = item.backdrop_path || item.poster_path
          const href = item.type === 'movie'
            ? `/watch/movie/${item.tmdb_id}`
            : `/watch/tv/${item.tmdb_id}?s=${item.season_number || 1}&e=${item.episode_number || 1}`

          const removeItem = (e: React.MouseEvent) => {
            e.preventDefault(); e.stopPropagation()
            const pid = localStorage.getItem('streamcorn_profile_id')
            if (!pid) return
            // Mark as completed to remove from the rail.
            saveProgress(
              buildPayload(
                pid,
                item.content_id,
                item.type,
                item.duration_seconds,
                item.duration_seconds,
                item.season_number || undefined,
                item.episode_number || undefined,
              ),
            )
            setItems(prev => prev.filter(i => !(
              i.content_id === item.content_id &&
              i.season_number === item.season_number &&
              i.episode_number === item.episode_number
            )))
          }

          return (
            <div key={`${item.content_id}-${item.season_number}-${item.episode_number}`} className="flex-shrink-0 w-[155px] relative">
              <button
                onClick={removeItem}
                className="absolute -top-1 -right-1 z-10 w-5 h-5 bg-black/80 rounded-full flex items-center justify-center border border-white/10"
                aria-label="Remove from Continue Watching"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
              <Link
                href={href}
                onTouchStart={() => prefetchVideo(item.tmdb_id, item.type, item.season_number || undefined, item.episode_number || undefined)}
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
            </div>
          )
        })}
      </div>
    </div>
  )
}
