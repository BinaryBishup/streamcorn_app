'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
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

// Random dark color for hero background
const HERO_COLORS = [
  'from-[#0d0020] to-black',
  'from-[#001a0d] to-black',
  'from-[#0d0a1a] to-black',
  'from-[#1a0a0a] to-black',
  'from-[#0a0d1a] to-black',
  'from-[#0f0a15] to-black',
  'from-[#0a1510] to-black',
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
  const [showToggle, setShowToggle] = useState(false)
  const observerRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)

  const heroColor = useMemo(() => HERO_COLORS[Math.floor(Math.random() * HERO_COLORS.length)], [])

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

  // Show toggle when content is visible
  useEffect(() => {
    const el = contentRef.current; if (!el) return
    const obs = new IntersectionObserver(([entry]) => setShowToggle(entry.isIntersecting), { threshold: 0.1 })
    obs.observe(el); return () => obs.disconnect()
  }, [])

  const activeFilters = [type, genre, platform].filter(Boolean).length

  return (
    <div className="min-h-screen bg-black">
      {/* Hero section with glass effect + random dark color */}
      <div className={`bg-gradient-to-b ${heroColor} pt-14 pb-4`}>
        <div className="backdrop-blur-sm bg-white/[0.02] rounded-2xl mx-3 p-4 border border-white/[0.04]">
          {/* Platform logos */}
          <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-3">
            {PLATFORMS.map(p => (
              <button
                key={p.key}
                onClick={() => setPlatform(platform === p.key ? null : p.key)}
                className={`flex-shrink-0 w-[68px] h-[68px] rounded-xl overflow-hidden border-2 transition-all ${
                  platform === p.key
                    ? 'border-[#e50914] shadow-lg shadow-[#e50914]/20 scale-105'
                    : 'border-white/[0.08] active:border-white/20'
                }`}
              >
                <img src={p.logo} alt={p.label} className="w-full h-full object-cover" />
              </button>
            ))}
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
      </div>

      {/* Active filters + count */}
      {activeFilters > 0 && (
        <div className="flex items-center gap-2 px-4 py-2">
          {platform && (
            <span className="flex items-center gap-1.5 bg-[#e50914]/15 text-[#e50914] text-[11px] font-medium px-2.5 py-1 rounded-full">
              {PLATFORMS.find(p => p.key === platform)?.label}
              <button onClick={() => setPlatform(null)}>×</button>
            </span>
          )}
          {genre && (
            <span className="flex items-center gap-1.5 bg-white/10 text-white/70 text-[11px] font-medium px-2.5 py-1 rounded-full">
              {genre}
              <button onClick={() => setGenre(null)}>×</button>
            </span>
          )}
          {type && (
            <span className="flex items-center gap-1.5 bg-white/10 text-white/70 text-[11px] font-medium px-2.5 py-1 rounded-full">
              {type === 'movie' ? 'Movies' : 'Shows'}
              <button onClick={() => setType(null)}>×</button>
            </span>
          )}
          <button onClick={() => { setType(null); setGenre(null); setPlatform(null) }} className="text-white/30 text-[11px] ml-auto">Clear</button>
        </div>
      )}

      {/* Results count */}
      <div className="px-4 py-2">
        <span className="text-white/25 text-xs tabular-nums">{total} titles</span>
      </div>

      {/* Grid */}
      <div ref={contentRef}>
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
      </div>

      {loadingMore && (
        <div className="flex justify-center py-6">
          <div className="w-6 h-6 border-2 border-[#e50914] border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <div ref={observerRef} className="h-4" />

      {/* Floating type toggle — same as home page, shows when content visible */}
      <div style={{
        position: 'sticky', bottom: 72, zIndex: 30,
        display: 'flex', justifyContent: 'center', padding: '8px 0',
        opacity: showToggle ? 1 : 0, pointerEvents: showToggle ? 'auto' : 'none',
        transition: 'opacity 0.3s ease',
      }}>
        <div className="flex bg-[#1a1a1a]/90 backdrop-blur-lg rounded-full border border-white/[0.08] p-1 shadow-lg">
          {([
            [null, 'All'],
            ['tv', 'TV'],
            ['movie', 'Movies'],
          ] as const).map(([key, label]) => (
            <button
              key={key || 'all'}
              onClick={() => setType(key as string | null)}
              className={`px-5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                type === key ? 'bg-white text-black' : 'text-white/60 active:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
