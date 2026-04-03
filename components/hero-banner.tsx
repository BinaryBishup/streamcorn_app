'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

interface HeroItem {
  tmdb_id: number
  type: 'movie' | 'tv'
  title: string
  backdrop_path: string | null
  rating: number
  year: number | null
  overview: string | null
}

export function HeroBanner({ items }: { items: HeroItem[] }) {
  const [active, setActive] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (items.length <= 1) return
    timerRef.current = setInterval(() => {
      setActive(prev => (prev + 1) % items.length)
    }, 6000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [items.length])

  if (items.length === 0) return null
  const item = items[active]
  const backdrop = item.backdrop_path
    ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}`
    : null

  return (
    <div className="relative w-full aspect-[16/10] overflow-hidden">
      {backdrop && (
        <img
          src={backdrop}
          alt={item.title}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-4 pb-6">
        <h1 className="text-2xl font-bold text-white mb-1 line-clamp-1">{item.title}</h1>
        <div className="flex items-center gap-2 text-xs text-white/60 mb-3">
          <span className="text-[#46d369] font-semibold">{Math.round(item.rating * 10)}% Match</span>
          {item.year && <span>{item.year}</span>}
          <span className="px-1 py-0.5 border border-white/20 rounded text-[10px]">HD</span>
        </div>
        <div className="flex gap-2">
          <Link
            href={item.type === 'movie' ? `/watch/movie/${item.tmdb_id}` : `/watch/tv/${item.tmdb_id}?s=1&e=1`}
            className="flex-1 flex items-center justify-center gap-2 bg-white text-black font-bold py-2.5 rounded-lg text-sm"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="black"><path d="M8 5v14l11-7z"/></svg>
            Play
          </Link>
          <Link
            href={`/detail/${item.type}/${item.tmdb_id}`}
            className="flex-1 flex items-center justify-center gap-2 bg-white/20 text-white font-bold py-2.5 rounded-lg text-sm"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
            </svg>
            Info
          </Link>
        </div>
      </div>

      {/* Dots */}
      {items.length > 1 && (
        <div className="absolute bottom-2 right-4 flex gap-1">
          {items.map((_, i) => (
            <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i === active ? 'bg-white w-4' : 'bg-white/30'}`} />
          ))}
        </div>
      )}
    </div>
  )
}
