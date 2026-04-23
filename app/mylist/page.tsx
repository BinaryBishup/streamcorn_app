'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface WatchlistItem {
  tmdb_id: string
  content_id: string
  type: 'movie' | 'tv'
  title: string
  poster_path: string | null
}

/**
 * My List — one round-trip to our DB (with a join to `content` for titles
 * and posters). No more TMDB fallback.
 */
export default function MyListPage() {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const pid = localStorage.getItem('streamcorn_profile_id')
    if (!pid) { setLoading(false); return }
    load(pid).finally(() => setLoading(false))
  }, [])

  async function load(pid: string) {
    try {
      const res = await fetch(`/api/watchlist?profile_id=${pid}`)
      if (!res.ok) return
      const { items: rows } = await res.json() as { items: { content_id: string }[] }
      if (!rows?.length) { setItems([]); return }

      // Fetch each content row from our DB for the title + poster. This
      // is sequential in request count but concurrent in flight.
      const enriched = await Promise.all(
        rows.map(async (r) => {
          try {
            const d = await fetch(`/api/content/${r.content_id}`).then(x => x.ok ? x.json() : null)
            if (!d?.content) return null
            const c = d.content
            return {
              tmdb_id: c.tmdb_id,
              content_id: r.content_id,
              type: c.type,
              title: c.title,
              poster_path: c.poster_path,
            } as WatchlistItem
          } catch { return null }
        })
      )
      setItems(enriched.filter(Boolean) as WatchlistItem[])
    } catch {}
  }

  const removeFromList = async (contentId: string) => {
    const pid = localStorage.getItem('streamcorn_profile_id')
    if (!pid) return
    await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_id: pid, content_id: contentId }),
    })
    setItems(prev => prev.filter(i => i.content_id !== contentId))
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
            <div key={item.content_id} className="relative">
              <Link href={`/detail/${item.type}/${item.tmdb_id}`}>
                <div className="aspect-[2/3] rounded-lg overflow-hidden bg-[#1a1a1a]">
                  {item.poster_path ? (
                    <img src={item.poster_path} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/20 text-[10px] p-2 text-center">{item.title}</div>
                  )}
                </div>
              </Link>
              <button
                onClick={() => removeFromList(item.content_id)}
                className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/70 backdrop-blur rounded-full flex items-center justify-center"
                aria-label="Remove"
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
