'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

interface SearchResult {
  id: number
  type: 'movie' | 'tv'
  title: string
  posterPath: string
  rating: number
  year: string
}

const CHIPS = ['Action', 'Comedy', 'Thriller', 'Sci-Fi', 'Drama', 'Horror', 'Romance', 'Animation']

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [suggestions, setSuggestions] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/suggestions')
      .then(r => r.json())
      .then(d => setSuggestions(d.suggestions || []))
      .catch(() => {})
    inputRef.current?.focus()
  }, [])

  const search = async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data.results || [])
    } catch { setResults([]) }
    setLoading(false)
  }

  const handleInput = (val: string) => {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 300)
  }

  const displayItems = query.trim() ? results : suggestions

  return (
    <div className="min-h-screen bg-black pt-2 px-4">
      {/* Search bar */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => handleInput(e.target.value)}
          placeholder="Search movies, shows..."
          className="w-full bg-[#1a1a1a] text-white pl-11 pr-10 py-3 rounded-xl text-sm outline-none border border-white/[0.06] focus:border-white/20"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]) }} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        )}
      </div>

      {/* Quick chips */}
      {!query && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-5">
          {CHIPS.map(c => (
            <button
              key={c}
              onClick={() => { setQuery(c.toLowerCase()); search(c.toLowerCase()) }}
              className="flex-shrink-0 px-4 py-2 rounded-full bg-white/[0.06] text-white/60 text-xs font-medium active:bg-white/[0.12]"
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-[#e50914] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Results grid */}
      {!loading && displayItems.length > 0 && (
        <>
          {!query && <p className="text-white/40 text-xs mb-3">You might like</p>}
          {query && <p className="text-white/40 text-xs mb-3">{results.length} results</p>}
          <div className="grid grid-cols-3 gap-2">
            {displayItems.map(item => (
              <Link key={`${item.type}-${item.id}`} href={`/detail/${item.type}/${item.id}`}>
                <div className="aspect-[2/3] rounded-lg overflow-hidden bg-[#1a1a1a]">
                  {item.posterPath ? (
                    <img src={item.posterPath} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/20 text-[10px] p-2 text-center">{item.title}</div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {!loading && query && results.length === 0 && (
        <div className="text-center py-16">
          <p className="text-white/50 text-sm">No results for "{query}"</p>
        </div>
      )}
    </div>
  )
}
