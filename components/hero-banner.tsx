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
  const [genres, setGenres] = useState<Record<string, string[]>>({})
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const touchStartX = useRef(0)

  useEffect(() => {
    if (items.length <= 1) return
    timerRef.current = setInterval(() => setActive(prev => (prev + 1) % items.length), 6000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [items.length])

  // Fetch logos + genres
  useEffect(() => {
    items.forEach(item => {
      const key = `${item.type}-${item.tmdb_id}`

      // Logo
      if (logos[key] === undefined) {
        fetch(`https://api.themoviedb.org/3/${item.type}/${item.tmdb_id}/images?api_key=${TMDB_KEY}`)
          .then(r => r.json())
          .then(d => {
            const logo = (d.logos || []).find((l: any) => l.iso_639_1 === 'en') || (d.logos || [])[0]
            setLogos(prev => ({ ...prev, [key]: logo ? `https://image.tmdb.org/t/p/w300${logo.file_path}` : null }))
          })
          .catch(() => setLogos(prev => ({ ...prev, [key]: null })))
      }

      // Genres
      if (!genres[key]) {
        fetch(`https://api.themoviedb.org/3/${item.type}/${item.tmdb_id}?api_key=${TMDB_KEY}`)
          .then(r => r.json())
          .then(d => setGenres(prev => ({ ...prev, [key]: (d.genres || []).slice(0, 4).map((g: any) => g.name) })))
          .catch(() => setGenres(prev => ({ ...prev, [key]: [] })))
      }
    })
  }, [items])

  if (items.length === 0) return null
  const item = items[active]
  const key = `${item.type}-${item.tmdb_id}`
  const poster = item.poster_path ? `https://image.tmdb.org/t/p/w780${item.poster_path}` : null
  const logoUrl = logos[key]
  const genreList = genres[key] || []

  const handleSwipeStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX }
  const handleSwipeEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 50) {
      if (diff > 0) setActive(prev => (prev + 1) % items.length)
      else setActive(prev => (prev - 1 + items.length) % items.length)
      // Reset auto-rotate timer
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = setInterval(() => setActive(prev => (prev + 1) % items.length), 6000)
    }
  }

  return (
    <div
      className="relative w-full px-4 pt-12 pb-2"
      style={{ background: 'linear-gradient(180deg, #0d0015 0%, #0a0010 40%, #000 100%)' }}
      onTouchStart={handleSwipeStart}
      onTouchEnd={handleSwipeEnd}
    >
      {/* Poster card */}
      <div className="relative w-full rounded-2xl overflow-hidden shadow-2xl shadow-purple-900/30" style={{ aspectRatio: '2/3', maxHeight: '70vh', border: '1px solid rgba(255,255,255,0.12)' }}>
        {poster && (
          <img
            key={active}
            src={poster}
            alt={item.title}
            className="absolute inset-0 w-full h-full object-cover animate-in fade-in duration-500"
          />
        )}
        {/* Bottom gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />

        {/* Content at bottom of card */}
        <div className="absolute bottom-0 left-0 right-0 p-5 pb-4">
          {/* Logo or title */}
          {logoUrl ? (
            <img src={logoUrl} alt={item.title} className="h-14 max-w-[220px] object-contain mb-2 drop-shadow-lg" />
          ) : (
            <h1 className="text-2xl font-bold text-white mb-2 drop-shadow-lg">{item.title}</h1>
          )}

          {/* Genre tags */}
          {genreList.length > 0 && (
            <p className="text-white/60 text-xs mb-4">
              {genreList.join('  ·  ')}
            </p>
          )}

          {/* Buttons */}
          <div className="flex gap-3">
            <Link
              href={item.type === 'movie' ? `/watch/movie/${item.tmdb_id}` : `/watch/tv/${item.tmdb_id}?s=1&e=1`}
              className="flex-1 flex items-center justify-center gap-2 bg-white text-black font-bold py-3 rounded-lg text-sm active:bg-white/80"
              onTouchStart={() => prefetchVideo(item.tmdb_id, item.type, item.type === 'tv' ? 1 : undefined, item.type === 'tv' ? 1 : undefined)}
              onMouseEnter={() => prefetchVideo(item.tmdb_id, item.type, item.type === 'tv' ? 1 : undefined, item.type === 'tv' ? 1 : undefined)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="black"><path d="M8 5v14l11-7z" /></svg>
              Play
            </Link>
            <Link
              href={`/detail/${item.type}/${item.tmdb_id}`}
              className="flex-1 flex items-center justify-center gap-2 bg-white/15 backdrop-blur text-white font-bold py-3 rounded-lg text-sm active:bg-white/25"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 4v16m8-8H4" />
              </svg>
              My List
            </Link>
          </div>
        </div>
      </div>

      {/* Dots */}
      {items.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {items.map((_, i) => (
            <button key={i} onClick={() => setActive(i)} className={`h-1.5 rounded-full transition-all ${i === active ? 'bg-white w-5' : 'bg-white/30 w-1.5'}`} />
          ))}
        </div>
      )}
    </div>
  )
}
