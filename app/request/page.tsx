'use client'

import { useState, useEffect, useRef } from 'react'

const TMDB_KEY = '5c242b6eeca95f02957505a67a488635'

interface ContentRequest {
  id: string; tmdb_id: number; type: string; title: string
  poster_path: string | null; status: string; vote_count: number; created_at: string
}

interface TmdbResult {
  id: number; media_type: 'movie' | 'tv'; title?: string; name?: string
  poster_path: string | null; release_date?: string; first_air_date?: string; overview?: string
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-yellow-500/15', text: 'text-yellow-400', label: 'Pending' },
  approved: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'Approved' },
  added: { bg: 'bg-green-500/15', text: 'text-green-400', label: 'Added' },
  rejected: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'Rejected' },
}

export default function RequestPage() {
  const [requests, setRequests] = useState<ContentRequest[]>([])
  const [loadingRequests, setLoadingRequests] = useState(true)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TmdbResult[]>([])
  const [loading, setLoading] = useState(false)
  const [requestedIds, setRequestedIds] = useState<Set<number>>(new Set())
  const [requestingId, setRequestingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchRequests = () => {
    fetch('/api/content-requests')
      .then(r => r.json())
      .then(d => {
        setRequests(d.requests || [])
        setRequestedIds(new Set((d.requests || []).map((r: ContentRequest) => r.tmdb_id)))
      })
      .catch(() => {})
      .finally(() => setLoadingRequests(false))
  }

  useEffect(() => { fetchRequests() }, [])

  const search = async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    try {
      const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}&page=1`)
      const data = await res.json()
      setResults((data.results || []).filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 15))
    } catch { setResults([]) }
    setLoading(false)
  }

  const handleInput = (val: string) => {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 300)
  }

  const submitRequest = async (item: TmdbResult) => {
    setRequestingId(item.id)
    try {
      await fetch('/api/content-requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmdb_id: item.id, type: item.media_type, title: item.title || item.name, poster_path: item.poster_path }),
      })
      setRequestedIds(prev => new Set(prev).add(item.id))
      fetchRequests()
    } catch {}
    setRequestingId(null)
  }

  const deleteRequest = async (id: string) => {
    setDeletingId(id)
    try {
      await fetch(`/api/content-requests?id=${id}`, { method: 'DELETE' })
      setRequests(prev => prev.filter(r => r.id !== id))
    } catch {}
    setDeletingId(null)
  }

  return (
    <div className="min-h-screen bg-black pt-4 px-4 pb-20">
      <h1 className="text-xl font-bold text-white mb-1">Request Content</h1>
      <p className="text-white/40 text-xs mb-5">Search and request any movie or show</p>

      {/* Search bar */}
      <div className="relative mb-5">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <input type="text" value={query} onChange={e => handleInput(e.target.value)} placeholder="Search any movie or show..."
          className="w-full bg-[#1a1a1a] text-white pl-11 pr-10 py-3 rounded-xl text-sm outline-none border border-white/[0.06] focus:border-white/20" />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]) }} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        )}
      </div>

      {/* Search results */}
      {loading && <div className="flex justify-center py-6"><div className="w-8 h-8 border-2 border-[#e50914] border-t-transparent rounded-full animate-spin" /></div>}

      {!loading && results.length > 0 && (
        <div className="space-y-2 mb-6">
          <p className="text-white/40 text-xs mb-2">Search Results</p>
          {results.map(item => {
            const title = item.title || item.name || 'Unknown'
            const year = (item.release_date || item.first_air_date || '').substring(0, 4)
            const alreadyRequested = requestedIds.has(item.id)
            return (
              <div key={item.id} className="flex gap-3 p-2.5 bg-[#111] rounded-xl">
                <div className="w-11 aspect-[2/3] rounded-lg overflow-hidden bg-[#252525] flex-shrink-0">
                  {item.poster_path ? <img src={`https://image.tmdb.org/t/p/w92${item.poster_path}`} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white/15 text-[8px]">?</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{title}</p>
                  <p className="text-white/40 text-[11px]">{item.media_type === 'movie' ? 'Movie' : 'TV Show'}{year && ` · ${year}`}</p>
                </div>
                <div className="self-center flex-shrink-0">
                  {alreadyRequested ? (
                    <span className="text-[#46d369] text-[11px] font-medium flex items-center gap-1">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>Done
                    </span>
                  ) : (
                    <button onClick={() => submitRequest(item)} disabled={requestingId === item.id}
                      className="px-3.5 py-1.5 bg-[#e50914] text-white text-[11px] font-bold rounded-lg disabled:opacity-50">
                      {requestingId === item.id ? '...' : 'Request'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && query && results.length === 0 && (
        <div className="text-center py-8 mb-4">
          <p className="text-white/40 text-sm">No results for "{query}"</p>
        </div>
      )}

      {/* Your Requests */}
      {!loadingRequests && requests.length > 0 && (
        <div className="mb-6">
          <h2 className="text-white font-semibold text-sm mb-3">Your Requests</h2>
          <div className="space-y-2">
            {requests.map(req => {
              const s = STATUS_COLORS[req.status] || STATUS_COLORS.pending
              const canDelete = req.status === 'pending'
              return (
                <div key={req.id} className="flex gap-3 p-3 bg-[#111] rounded-xl">
                  <div className="w-12 aspect-[2/3] rounded-lg overflow-hidden bg-[#252525] flex-shrink-0">
                    {req.poster_path ? <img src={`https://image.tmdb.org/t/p/w92${req.poster_path}`} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white/15 text-[8px]">?</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{req.title}</p>
                    <p className="text-white/40 text-[11px] capitalize">{req.type} · {new Date(req.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                  </div>
                  <div className="self-center flex-shrink-0 flex items-center gap-2">
                    <span className={`${s.bg} ${s.text} text-[10px] font-semibold px-2.5 py-1 rounded-full`}>{s.label}</span>
                    {canDelete && (
                      <button onClick={() => deleteRequest(req.id)} disabled={deletingId === req.id}
                        className="w-7 h-7 flex items-center justify-center bg-white/[0.06] rounded-full active:bg-white/10 disabled:opacity-30">
                        <svg width="14" height="14" viewBox="0 -960 960 960" fill="rgba(255,255,255,0.4)"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm80-160h80v-360h-80v360Zm160 0h80v-360h-80v360Z"/></svg>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {loadingRequests && (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-[#111] rounded-xl animate-pulse" />)}
        </div>
      )}

      {!loadingRequests && !query && requests.length === 0 && (
        <div className="text-center py-10">
          <svg width="48" height="48" viewBox="0 -960 960 960" fill="rgba(255,255,255,0.08)" className="mx-auto mb-3">
            <path d="M440-280h80v-160h160v-80H520v-160h-80v160H280v80h160v160ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Z"/>
          </svg>
          <p className="text-white/40 text-sm">No requests yet</p>
          <p className="text-white/25 text-xs mt-1">Search above to request any content</p>
        </div>
      )}
    </div>
  )
}
