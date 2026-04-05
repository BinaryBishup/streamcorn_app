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
const TMDB_KEY = '5c242b6eeca95f02957505a67a488635'

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [suggestions, setSuggestions] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [tmdbResults, setTmdbResults] = useState<any[]>([])
  const [requestSent, setRequestSent] = useState(false)
  const [requestingId, setRequestingId] = useState<number | null>(null)
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

  // Search TMDB for request modal
  const searchTmdbForRequest = async () => {
    if (!query.trim()) return
    try {
      const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&page=1`)
      const data = await res.json()
      setTmdbResults((data.results || []).filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 10))
    } catch { setTmdbResults([]) }
  }

  const openRequestModal = () => {
    setShowRequestModal(true)
    setRequestSent(false)
    setRequestingId(null)
    searchTmdbForRequest()
  }

  const submitRequest = async (item: any) => {
    setRequestingId(item.id)
    try {
      await fetch('/api/content-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tmdb_id: item.id,
          type: item.media_type,
          title: item.title || item.name,
          poster_path: item.poster_path,
        }),
      })
      setRequestSent(true)
    } catch {}
    setRequestingId(null)
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

      {/* No results — request content */}
      {!loading && query && results.length === 0 && (
        <div className="text-center py-12">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="text-white/15 mx-auto mb-4">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <p className="text-white/50 text-sm mb-1">No results for &ldquo;{query}&rdquo;</p>
          <p className="text-white/30 text-xs mb-4">Can&apos;t find what you&apos;re looking for?</p>
          <button
            onClick={openRequestModal}
            className="px-6 py-2.5 bg-[#e50914] text-white text-sm font-bold rounded-xl active:bg-[#b20710]"
          >
            Request This Content
          </button>
        </div>
      )}

      {/* Request modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-[200] bg-black/90 flex items-end justify-center" onClick={() => setShowRequestModal(false)}>
          <div className="bg-[#1a1a1a] rounded-t-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/[0.06]">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-white text-lg font-bold">Request Content</h3>
                <button onClick={() => setShowRequestModal(false)} className="text-white/40 p-1">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
              <p className="text-white/40 text-xs">Select the content you want us to add</p>
            </div>

            {requestSent ? (
              <div className="p-8 text-center">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth={2} className="mx-auto mb-3">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
                <p className="text-white font-semibold mb-1">Request Submitted!</p>
                <p className="text-white/40 text-xs mb-4">We&apos;ll try to add this content soon.</p>
                <button onClick={() => setShowRequestModal(false)} className="px-6 py-2.5 bg-white/10 text-white text-sm font-semibold rounded-xl">Done</button>
              </div>
            ) : (
              <div className="p-4 space-y-2">
                {tmdbResults.length === 0 && (
                  <p className="text-white/30 text-sm text-center py-8">No matches found on TMDB</p>
                )}
                {tmdbResults.map(item => (
                  <div key={item.id} className="flex gap-3 p-3 bg-white/[0.04] rounded-xl">
                    <div className="w-12 aspect-[2/3] rounded-lg overflow-hidden bg-[#252525] flex-shrink-0">
                      {item.poster_path ? (
                        <img src={`https://image.tmdb.org/t/p/w92${item.poster_path}`} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/15 text-[8px]">?</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 py-0.5">
                      <p className="text-white text-sm font-medium truncate">{item.title || item.name}</p>
                      <p className="text-white/40 text-xs">{item.media_type === 'movie' ? 'Movie' : 'TV Show'} &middot; {(item.release_date || item.first_air_date || '').substring(0, 4)}</p>
                    </div>
                    <button
                      onClick={() => submitRequest(item)}
                      disabled={requestingId === item.id}
                      className="self-center px-4 py-1.5 bg-[#e50914] text-white text-xs font-bold rounded-lg active:bg-[#b20710] disabled:opacity-50 flex-shrink-0"
                    >
                      {requestingId === item.id ? '...' : 'Request'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
