'use client'

import Link from 'next/link'

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
          >
            <div className="aspect-[2/3] rounded-lg overflow-hidden bg-[#1a1a1a]">
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
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
