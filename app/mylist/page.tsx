'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const TMDB_KEY = '5c242b6eeca95f02957505a67a488635'

interface WatchlistItem {
  tmdb_id: number
  type: 'movie' | 'tv'
  title?: string
  poster_path?: string | null
}

export default function MyListPage() {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const pid = localStorage.getItem('streamcorn_profile_id')
    if (!pid) { setLoading(false); return }

    fetch(`/api/watchlist?profile_id=${pid}`)
      .then(r => r.json())
      .then(async (d) => {
        const raw: WatchlistItem[] = d.items || []
        // Fetch titles + posters from TMDB
        const enriched = await Promise.all(
          raw.map(async (item) => {
            try {
              const res = await fetch(`https://api.themoviedb.org/3/${item.type}/${item.tmdb_id}?api_key=${TMDB_KEY}`)
              const data = await res.json()
              return { ...item, title: data.title || data.name, poster_path: data.poster_path }
            } catch {
              return item
            }
          })
        )
        setItems(enriched)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const removeFromList = async (tmdbId: number, type: string) => {
    const pid = localStorage.getItem('streamcorn_profile_id')
    if (!pid) return
    await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_id: pid, tmdb_id: tmdbId, type }),
    })
    setItems(prev => prev.filter(i => !(i.tmdb_id === tmdbId && i.type === type)))
  }

  return (
    <div className="min-h-screen bg-black pt-4 px-4">
      <h1 className="text-xl font-bold text-white mb-4">My List</h1>

      {loading ? (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] bg-[#1a1a1a] rounded-lg animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="text-white/15 mb-4">
            <path d="M5 2a2 2 0 00-2 2v16.131a1 1 0 001.555.832L12 16.2l7.445 4.763A1 1 0 0021 20.131V4a2 2 0 00-2-2H5z"/>
          </svg>
          <p className="text-white/40 text-sm">Your list is empty</p>
          <p className="text-white/25 text-xs mt-1">Tap + My List on any title to save it here</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {items.map(item => (
            <div key={`${item.type}-${item.tmdb_id}`} className="relative">
              <Link href={`/detail/${item.type}/${item.tmdb_id}`}>
                <div className="aspect-[2/3] rounded-lg overflow-hidden bg-[#1a1a1a]">
                  {item.poster_path ? (
                    <img src={`https://image.tmdb.org/t/p/w342${item.poster_path}`} alt={item.title || ''} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/20 text-[10px] p-2 text-center">{item.title || 'Unknown'}</div>
                  )}
                </div>
              </Link>
              {/* Remove button */}
              <button
                onClick={() => removeFromList(item.tmdb_id, item.type)}
                className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/70 backdrop-blur rounded-full flex items-center justify-center"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
