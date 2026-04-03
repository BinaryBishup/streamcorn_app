'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'

interface ContentItem {
  tmdb_id: number
  type: 'movie' | 'tv'
  title: string
  poster_path: string | null
  rating: number
  year: number | null
  genres: string[]
  platform: string | null
}

const GENRES = ['Action','Adventure','Animation','Comedy','Crime','Drama','Family','Fantasy','History','Horror','Mystery','Romance','Science Fiction','Thriller','War']
const PLATFORMS = [
  { key: 'netflix', label: 'Netflix' },
  { key: 'prime_video', label: 'Prime' },
  { key: 'appletv', label: 'Apple TV+' },
  { key: 'hulu', label: 'Hulu' },
  { key: 'crunchyroll', label: 'Crunchyroll' },
]

export default function BrowsePage() {
  const [items, setItems] = useState<ContentItem[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [type, setType] = useState<string | null>(null)
  const [genre, setGenre] = useState<string | null>(null)
  const [platform, setPlatform] = useState<string | null>(null)
  const observerRef = useRef<HTMLDivElement | null>(null)

  const fetchContent = useCallback(async (p: number, append: boolean) => {
    if (p === 1) setLoading(true)
    else setLoadingMore(true)

    const params = new URLSearchParams({ page: String(p), limit: '30' })
    if (type) params.set('type', type)
    if (genre) params.set('genre', genre)
    if (platform) params.set('platform', platform)

    try {
      const res = await fetch(`/api/content?${params}`)
      const data = await res.json()
      setItems(prev => append ? [...prev, ...data.items] : data.items)
      setTotal(data.total)
      setTotalPages(data.totalPages)
    } catch {}
    setLoading(false)
    setLoadingMore(false)
  }, [type, genre, platform])

  useEffect(() => {
    setPage(1)
    fetchContent(1, false)
  }, [type, genre, platform, fetchContent])

  // Infinite scroll
  useEffect(() => {
    if (!observerRef.current) return
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !loadingMore && page < totalPages) {
        const next = page + 1
        setPage(next)
        fetchContent(next, true)
      }
    }, { threshold: 0.1 })
    obs.observe(observerRef.current)
    return () => obs.disconnect()
  }, [page, totalPages, loadingMore, fetchContent])

  return (
    <div className="min-h-screen bg-black pt-2">
      {/* Type toggle */}
      <div className="flex gap-2 px-4 mb-3">
        {[null, 'movie', 'tv'].map(t => (
          <button
            key={t || 'all'}
            onClick={() => setType(t)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${type === t ? 'bg-white text-black' : 'bg-white/[0.08] text-white/50 active:bg-white/[0.15]'}`}
          >
            {t === null ? 'All' : t === 'movie' ? 'Movies' : 'Shows'}
          </button>
        ))}
        <span className="ml-auto text-white/30 text-xs self-center tabular-nums">{total}</span>
      </div>

      {/* Platform chips */}
      <div className="flex gap-2 px-4 mb-3 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => setPlatform(null)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${!platform ? 'bg-[#e50914] text-white' : 'bg-white/[0.06] text-white/40 active:bg-white/[0.12]'}`}
        >
          All
        </button>
        {PLATFORMS.map(p => (
          <button
            key={p.key}
            onClick={() => setPlatform(platform === p.key ? null : p.key)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${platform === p.key ? 'bg-[#e50914] text-white' : 'bg-white/[0.06] text-white/40 active:bg-white/[0.12]'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Genre chips */}
      <div className="flex gap-2 px-4 mb-4 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => setGenre(null)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${!genre ? 'bg-white/[0.15] text-white' : 'bg-white/[0.06] text-white/30 active:bg-white/[0.12]'}`}
        >
          All Genres
        </button>
        {GENRES.map(g => (
          <button
            key={g}
            onClick={() => setGenre(genre === g ? null : g)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${genre === g ? 'bg-white/[0.15] text-white' : 'bg-white/[0.06] text-white/30 active:bg-white/[0.12]'}`}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-3 gap-2 px-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] bg-[#1a1a1a] rounded-lg animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-white/40 text-sm">No content found</p>
          <button onClick={() => { setType(null); setGenre(null); setPlatform(null) }} className="mt-3 text-[#e50914] text-sm font-medium">Clear filters</button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 px-4">
          {items.map(item => (
            <Link key={`${item.type}-${item.tmdb_id}`} href={`/detail/${item.type}/${item.tmdb_id}`}>
              <div className="aspect-[2/3] rounded-lg overflow-hidden bg-[#1a1a1a]">
                {item.poster_path ? (
                  <img src={`https://image.tmdb.org/t/p/w342${item.poster_path}`} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/20 text-[10px] p-2 text-center">{item.title}</div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {loadingMore && (
        <div className="flex justify-center py-6">
          <div className="w-6 h-6 border-2 border-[#e50914] border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <div ref={observerRef} className="h-4" />
    </div>
  )
}
