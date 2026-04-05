'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'

interface ContentItem {
  tmdb_id: number; type: 'movie' | 'tv'; title: string
  poster_path: string | null; rating: number; year: number | null
  genres: string[]; platform: string | null
}

const GENRES = ['Action','Adventure','Animation','Comedy','Crime','Drama','Family','Fantasy','History','Horror','Mystery','Romance','Science Fiction','Thriller','War']
const PLATFORMS = [
  { key: 'netflix', label: 'Netflix', logo: '/platforms/netflix.webp' },
  { key: 'prime_video', label: 'Prime Video', logo: '/platforms/prime_video.png' },
  { key: 'appletv', label: 'Apple TV+', logo: '/platforms/appletv.png' },
  { key: 'crunchyroll', label: 'Crunchyroll', logo: '/platforms/crunchyroll.png' },
  { key: 'hulu', label: 'Hulu', logo: '/platforms/hulu.svg' },
  { key: 'sonyliv', label: 'SonyLIV', logo: '/platforms/sonyliv.jpeg' },
  { key: 'zee5', label: 'ZEE5', logo: '/platforms/zee5.png' },
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
    if (p === 1) setLoading(true); else setLoadingMore(true)
    const params = new URLSearchParams({ page: String(p), limit: '30' })
    if (type) params.set('type', type)
    if (genre) params.set('genre', genre)
    if (platform) params.set('platform', platform)
    try {
      const res = await fetch(`/api/content?${params}`)
      const data = await res.json()
      setItems(prev => append ? [...prev, ...data.items] : data.items)
      setTotal(data.total); setTotalPages(data.totalPages)
    } catch {}
    setLoading(false); setLoadingMore(false)
  }, [type, genre, platform])

  useEffect(() => { setPage(1); fetchContent(1, false) }, [type, genre, platform, fetchContent])

  useEffect(() => {
    if (!observerRef.current) return
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !loadingMore && page < totalPages) {
        const next = page + 1; setPage(next); fetchContent(next, true)
      }
    }, { threshold: 0.1 })
    obs.observe(observerRef.current)
    return () => obs.disconnect()
  }, [page, totalPages, loadingMore, fetchContent])

  const activeFilters = [type, genre, platform].filter(Boolean).length

  return (
    <div className="min-h-screen bg-black pt-2">
      {/* Platform logos — horizontal scroll */}
      <div className="px-4 mb-4">
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
          {PLATFORMS.map(p => (
            <button
              key={p.key}
              onClick={() => setPlatform(platform === p.key ? null : p.key)}
              className={`flex-shrink-0 w-[72px] h-[72px] rounded-xl overflow-hidden border-2 transition-all ${
                platform === p.key
                  ? 'border-[#e50914] shadow-lg shadow-[#e50914]/20 scale-105'
                  : 'border-white/[0.08] active:border-white/20'
              }`}
            >
              <img src={p.logo} alt={p.label} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      </div>

      {/* Type + Genre row */}
      <div className="px-4 mb-4">
        {/* Type pills */}
        <div className="flex gap-2 mb-3">
          {[
            { val: null, label: 'All' },
            { val: 'movie', label: 'Movies' },
            { val: 'tv', label: 'Shows' },
          ].map(t => (
            <button
              key={t.val || 'all'}
              onClick={() => setType(t.val)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                type === t.val
                  ? 'bg-white text-black border-white'
                  : 'bg-transparent text-white/60 border-white/15 active:border-white/30'
              }`}
            >
              {t.label}
            </button>
          ))}

          {/* Results count */}
          <span className="ml-auto text-white/25 text-xs self-center tabular-nums">{total} titles</span>
        </div>

        {/* Genre scroll */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setGenre(null)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
              !genre ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-white/35 active:text-white/50'
            }`}
          >
            All Genres
          </button>
          {GENRES.map(g => (
            <button
              key={g}
              onClick={() => setGenre(genre === g ? null : g)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all ${
                genre === g ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-white/35 active:text-white/50'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Active filters bar */}
      {activeFilters > 0 && (
        <div className="flex items-center gap-2 px-4 mb-3">
          {platform && (
            <span className="flex items-center gap-1.5 bg-[#e50914]/15 text-[#e50914] text-[11px] font-medium px-2.5 py-1 rounded-full">
              {PLATFORMS.find(p => p.key === platform)?.label}
              <button onClick={() => setPlatform(null)} className="ml-0.5">×</button>
            </span>
          )}
          {type && (
            <span className="flex items-center gap-1.5 bg-white/10 text-white/70 text-[11px] font-medium px-2.5 py-1 rounded-full">
              {type === 'movie' ? 'Movies' : 'Shows'}
              <button onClick={() => setType(null)} className="ml-0.5">×</button>
            </span>
          )}
          {genre && (
            <span className="flex items-center gap-1.5 bg-white/10 text-white/70 text-[11px] font-medium px-2.5 py-1 rounded-full">
              {genre}
              <button onClick={() => setGenre(null)} className="ml-0.5">×</button>
            </span>
          )}
          <button onClick={() => { setType(null); setGenre(null); setPlatform(null) }} className="text-white/30 text-[11px] ml-auto">Clear all</button>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-3 gap-2 px-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] bg-[#1a1a1a] rounded-lg animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <svg width="48" height="48" viewBox="0 -960 960 960" fill="rgba(255,255,255,0.1)" className="mx-auto mb-3"><path d="M480-480q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v112H160Z"/></svg>
          <p className="text-white/40 text-sm">No content found</p>
          <button onClick={() => { setType(null); setGenre(null); setPlatform(null) }} className="mt-3 text-[#e50914] text-sm font-medium">Clear filters</button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 px-4">
          {items.map(item => (
            <Link key={`${item.type}-${item.tmdb_id}`} href={`/detail/${item.type}/${item.tmdb_id}`}>
              <div className="aspect-[2/3] rounded-lg overflow-hidden bg-[#1a1a1a] relative">
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
