'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { prefetchVideo } from '@/lib/prefetch-video'

const TMDB_KEY = '5c242b6eeca95f02957505a67a488635'

interface HeroItem {
  tmdb_id: number
  type: 'movie' | 'tv'
  title: string
  poster_path: string | null
  backdrop_path: string | null
  rating: number
  year: number | null
  overview: string | null
}

export function HeroBanner({ items }: { items: HeroItem[] }) {
  const [active, setActive] = useState(0)
  const [logos, setLogos] = useState<Record<string, string | null>>({})
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (items.length <= 1) return
    timerRef.current = setInterval(() => {
      setActive(prev => (prev + 1) % items.length)
    }, 6000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [items.length])

  // Fetch logos for all hero items
  useEffect(() => {
    items.forEach(item => {
      const key = `${item.type}-${item.tmdb_id}`
      if (logos[key] !== undefined) return
      fetch(`https://api.themoviedb.org/3/${item.type}/${item.tmdb_id}/images?api_key=${TMDB_KEY}`)
        .then(r => r.json())
        .then(d => {
          const logo = (d.logos || []).find((l: any) => l.iso_639_1 === 'en') || (d.logos || [])[0]
          setLogos(prev => ({ ...prev, [key]: logo ? `https://image.tmdb.org/t/p/w300${logo.file_path}` : null }))
        })
        .catch(() => setLogos(prev => ({ ...prev, [key]: null })))
    })
  }, [items])

  if (items.length === 0) return null
  const item = items[active]
  const image = item.poster_path
    ? `https://image.tmdb.org/t/p/w780${item.poster_path}`
    : item.backdrop_path
      ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}`
      : null
  const logoUrl = logos[`${item.type}-${item.tmdb_id}`]

  return (
    <div className="relative w-full" style={{ height: '60vh' }}>
      {image && (
        <img
          key={active}
          src={image}
          alt={item.title}
          className="absolute inset-0 w-full h-full object-cover animate-in fade-in duration-500"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/40" />

      <div className="absolute bottom-0 left-0 right-0 p-4 pb-5">
        {/* Logo or fallback title */}
        {logoUrl ? (
          <img src={logoUrl} alt={item.title} className="h-12 max-w-[200px] object-contain mb-2 drop-shadow-lg" />
        ) : (
          <h1 className="text-2xl font-bold text-white mb-1 line-clamp-2 drop-shadow-lg">{item.title}</h1>
        )}
        <div className="flex items-center gap-2 text-xs text-white/60 mb-3">
          <span className="text-[#46d369] font-semibold">{Math.round(item.rating * 10)}% Match</span>
          {item.year && <span>{item.year}</span>}
          <span className="px-1 py-0.5 border border-white/20 rounded text-[10px]">HD</span>
          <span className="text-white/40 capitalize">{item.type === 'tv' ? 'Series' : 'Movie'}</span>
        </div>
        <div className="flex gap-2">
          <Link
            href={item.type === 'movie' ? `/watch/movie/${item.tmdb_id}` : `/watch/tv/${item.tmdb_id}?s=1&e=1`}
            className="flex-1 flex items-center justify-center gap-2 bg-white text-black font-bold py-2.5 rounded-lg text-sm active:bg-white/80"
            onTouchStart={() => prefetchVideo(item.tmdb_id, item.type, item.type === 'tv' ? 1 : undefined, item.type === 'tv' ? 1 : undefined)}
            onMouseEnter={() => prefetchVideo(item.tmdb_id, item.type, item.type === 'tv' ? 1 : undefined, item.type === 'tv' ? 1 : undefined)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="black"><path d="M8 5v14l11-7z"/></svg>
            Play
          </Link>
          <Link
            href={`/detail/${item.type}/${item.tmdb_id}`}
            className="flex-1 flex items-center justify-center gap-2 bg-white/15 backdrop-blur text-white font-bold py-2.5 rounded-lg text-sm active:bg-white/25"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
            </svg>
            Info
          </Link>
        </div>
      </div>

      {items.length > 1 && (
        <div className="absolute bottom-2 right-4 flex gap-1.5">
          {items.map((_, i) => (
            <button key={i} onClick={() => setActive(i)} className={`h-1.5 rounded-full transition-all ${i === active ? 'bg-white w-5' : 'bg-white/30 w-1.5'}`} />
          ))}
        </div>
      )}
    </div>
  )
}
