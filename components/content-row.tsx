'use client'

import Link from 'next/link'
import { setCache } from '@/lib/cache'

const TMDB_KEY = '5c242b6eeca95f02957505a67a488635'

function prefetchDetail(tmdbId: number, type: string) {
  const key = `detail_${type}_${tmdbId}`
  // Only prefetch once
  if (sessionStorage.getItem(key)) return
  sessionStorage.setItem(key, '1')
  fetch(`https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=credits,videos`)
    .then(r => r.json())
    .then(d => setCache(`detail_${type}_${tmdbId}`, d))
    .catch(() => {})
}

interface ContentItem {
  tmdb_id: number
  type: 'movie' | 'tv'
  title: string
  poster_path: string | null
  rating: number
  year: number | null
}

export function ContentRow({ title, items }: { title: string; items: ContentItem[] }) {
  if (items.length === 0) return null

  return (
    <div className="mb-6">
      <h2 className="text-base font-bold text-white px-4 mb-2.5">{title}</h2>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide px-4">
        {items.map((item) => (
          <Link
            key={`${item.type}-${item.tmdb_id}`}
            href={`/detail/${item.type}/${item.tmdb_id}`}
            className="flex-shrink-0 w-[110px]"
            onTouchStart={() => prefetchDetail(item.tmdb_id, item.type)}
          >
            <div className="aspect-[2/3] rounded-lg overflow-hidden bg-[#1a1a1a] relative">
              {item.poster_path ? (
                <img
                  src={`https://image.tmdb.org/t/p/w342${item.poster_path}`}
                  alt={item.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/20 text-[10px] text-center p-2">
                  {item.title}
                </div>
              )}
              {item.year && item.year >= new Date().getFullYear() && (
                <span className="absolute top-1.5 left-1.5 bg-[#e50914] text-white text-[8px] font-bold px-1.5 py-0.5 rounded">NEW</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
