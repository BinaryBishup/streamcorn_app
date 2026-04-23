'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'

const TMDB_KEY = '5c242b6eeca95f02957505a67a488635'

interface ContentRequest {
  id: string
  tmdb_id: number
  type: string
  title: string
  poster_path: string | null
  status: 'pending' | 'approved' | 'added' | 'rejected' | string
  vote_count: number
  created_at: string
}

interface TmdbResult {
  id: number
  media_type: 'movie' | 'tv'
  title?: string
  name?: string
  poster_path: string | null
  release_date?: string
  first_air_date?: string
  overview?: string
}

type StatusKey = 'pending' | 'approved' | 'added' | 'rejected'

function StatusBadge({ status }: { status: StatusKey | string }) {
  const key = (['pending', 'approved', 'added', 'rejected'].includes(status) ? status : 'pending') as StatusKey
  const styles: Record<StatusKey, { bg: string; border: string; text: string; label: string; icon: React.ReactNode }> = {
    pending: {
      bg: 'bg-[#e50914]/10',
      border: 'border-[#e50914]/30',
      text: 'text-[#ff5a64]',
      label: 'Pending',
      icon: (
        <svg width="11" height="11" viewBox="0 -960 960 960" fill="currentColor">
          <path d="M360-840v-80h240v80H360Zm80 440h80v-240h-80v240Zm40 320q-74 0-139.5-28.5T226-186q-49-49-77.5-114.5T120-440q0-74 28.5-139.5T226-694q49-49 114.5-77.5T480-800q62 0 119 20t107 58l56-56 56 56-56 56q38 50 58 107t20 119q0 74-28.5 139.5T734-186q-49 49-114.5 77.5T480-80Z"/>
        </svg>
      ),
    },
    approved: {
      bg: 'bg-[#46d369]/10',
      border: 'border-[#46d369]/30',
      text: 'text-[#46d369]',
      label: 'Approved',
      icon: (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>
      ),
    },
    added: {
      bg: 'bg-[#46d369]/10',
      border: 'border-[#46d369]/30',
      text: 'text-[#46d369]',
      label: 'Added to catalogue',
      icon: (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2m5 11h-4v4h-2v-4H7v-2h4V7h2v4h4Z"/></svg>
      ),
    },
    rejected: {
      bg: 'bg-white/[0.06]',
      border: 'border-white/[0.12]',
      text: 'text-white/50',
      label: 'Rejected',
      icon: (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="m12 10.59-4.3-4.29-1.4 1.41L10.59 12l-4.3 4.29 1.41 1.42 4.3-4.3 4.29 4.3 1.41-1.42L13.41 12l4.3-4.29-1.41-1.41z"/></svg>
      ),
    },
  }
  const s = styles[key]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-[3px] rounded-full ${s.bg} ${s.text} border ${s.border} text-[10px] font-semibold`}>
      {s.icon}
      {s.label}
    </span>
  )
}

interface CatalogueHit {
  content_id: string
  client_type: 'movie' | 'tv'
}

export default function RequestPage() {
  const [requests, setRequests] = useState<ContentRequest[]>([])
  const [loadingRequests, setLoadingRequests] = useState(true)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TmdbResult[]>([])
  const [searching, setSearching] = useState(false)
  const [submittingId, setSubmittingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // tmdb_id → catalogue match (uuid + client-side type). Accumulates as
  // we hear about new ids from either the requests list or TMDB search.
  const [catalogue, setCatalogue] = useState<Map<number, CatalogueHit>>(new Map())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Merge a fresh set of catalogue hits into state, replacing any prior
  // entries for the same tmdb_id.
  const mergeCatalogue = (hits: Array<{ tmdb_id: number; content_id: string; client_type: 'movie' | 'tv' }>) => {
    if (hits.length === 0) return
    setCatalogue(prev => {
      const next = new Map(prev)
      for (const h of hits) next.set(h.tmdb_id, { content_id: h.content_id, client_type: h.client_type })
      return next
    })
  }

  const checkCatalogue = async (tmdbIds: number[]) => {
    if (tmdbIds.length === 0) return
    const unique = Array.from(new Set(tmdbIds)).filter((n) => Number.isFinite(n))
    if (unique.length === 0) return
    try {
      const res = await fetch(`/api/content/by-tmdb?ids=${unique.join(',')}`)
      if (!res.ok) return
      const d = (await res.json()) as { items?: Array<{ tmdb_id: number; content_id: string; client_type: 'movie' | 'tv' }> }
      mergeCatalogue(d.items ?? [])
    } catch {}
  }

  const loadRequests = () => {
    fetch('/api/content-requests')
      .then(r => r.json())
      .then((d: { requests?: ContentRequest[] }) => {
        const list = d.requests || []
        setRequests(list)
        // Backfill catalogue state for every request so "added" rows get
        // a direct Watch deep-link.
        checkCatalogue(list.map((r) => r.tmdb_id))
      })
      .catch(() => {})
      .finally(() => setLoadingRequests(false))
  }

  useEffect(() => { loadRequests() }, [])

  const requestedKeys = useMemo(
    () => new Set(requests.map(r => `${r.type}-${r.tmdb_id}`)),
    [requests],
  )

  const runSearch = async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) { setResults([]); setSearching(false); return }
    setSearching(true)
    try {
      const res = await fetch(
        `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(trimmed)}&page=1&include_adult=false`,
      )
      const data = await res.json()
      const filtered: TmdbResult[] = (data.results || [])
        .filter((r: { media_type: string; poster_path: string | null }) =>
          (r.media_type === 'movie' || r.media_type === 'tv') && r.poster_path,
        )
        .slice(0, 20)
      setResults(filtered)
      // Fire catalogue check for the new batch of results.
      checkCatalogue(filtered.map((r) => r.id))
    } catch {
      setResults([])
    }
    setSearching(false)
  }

  const onInput = (val: string) => {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(val), 350)
  }

  const submit = async (item: TmdbResult) => {
    setSubmittingId(item.id)
    setError(null)
    try {
      const res = await fetch('/api/content-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tmdb_id: item.id,
          type: item.media_type,
          title: item.title || item.name || 'Unknown',
          poster_path: item.poster_path,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to submit')
      }
      // Optimistic: shove a row into the list so the user sees feedback.
      const now = new Date().toISOString()
      setRequests(prev => [
        {
          id: `tmp-${item.id}`,
          tmdb_id: item.id,
          type: item.media_type,
          title: item.title || item.name || '',
          poster_path: item.poster_path,
          status: 'pending',
          vote_count: 1,
          created_at: now,
        },
        ...prev,
      ])
      loadRequests()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit request')
    }
    setSubmittingId(null)
  }

  const remove = async (id: string) => {
    setDeletingId(id)
    try {
      await fetch(`/api/content-requests?id=${id}`, { method: 'DELETE' })
      setRequests(prev => prev.filter(r => r.id !== id))
    } catch {}
    setDeletingId(null)
  }

  const pendingCount = requests.length

  return (
    <div className="min-h-screen bg-black px-4 pt-5 pb-10">
      <div className="max-w-lg mx-auto">
        <header className="mb-5">
          <h1 className="text-[22px] font-bold text-white leading-tight">Missing a title?</h1>
          <p className="text-white/45 text-xs mt-1">Search any movie or show on TMDB and we'll add it to the catalogue.</p>
        </header>

        {/* Search box */}
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input
            value={query}
            onChange={(e) => onInput(e.target.value)}
            placeholder="Search titles on TMDB"
            className="w-full h-11 pl-10 pr-10 rounded-xl bg-white/[0.06] border border-white/[0.1] focus:border-white/25 text-sm text-white placeholder:text-white/30 outline-none"
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setResults([]) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full text-white/40 active:bg-white/10"
              aria-label="Clear search"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          )}
        </div>

        {error && (
          <div className="flex items-center justify-between mb-4 px-3 py-2 rounded-lg bg-[#e50914]/15 border border-[#e50914]/40">
            <p className="text-[#ff7a80] text-xs">{error}</p>
            <button onClick={() => setError(null)} className="text-[#ff7a80]/70 p-1" aria-label="Dismiss error">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
        )}

        {/* Search results */}
        {query.trim().length > 0 && (
          <section className="mb-6">
            {searching && (
              <div className="flex justify-center py-5">
                <div className="w-6 h-6 rounded-full border-2 border-[#e50914] border-t-transparent animate-spin" />
              </div>
            )}
            {!searching && results.length === 0 && (
              <div className="py-8 text-center">
                <p className="text-white/40 text-xs">No matches for "{query.trim()}"</p>
              </div>
            )}
            {!searching && results.length > 0 && (
              <div className="space-y-2">
                {results.map((item) => {
                  const title = item.title || item.name || 'Unknown'
                  const year = (item.release_date || item.first_air_date || '').slice(0, 4)
                  const already = requestedKeys.has(`${item.media_type}-${item.id}`)
                  const inCatalogue = catalogue.get(item.id)
                  return (
                    <div key={`${item.media_type}-${item.id}`} className="flex gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                      <div className="w-[60px] h-[90px] flex-shrink-0 rounded-lg overflow-hidden bg-[#1a1a1a]">
                        {item.poster_path ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w154${item.poster_path}`}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/15 text-lg font-bold">?</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                        <div>
                          <p className="text-white text-sm font-semibold truncate">{title}</p>
                          <p className="text-white/40 text-[11px] mt-0.5">
                            {item.media_type === 'movie' ? 'Movie' : 'Show'}{year && ` · ${year}`}
                          </p>
                          {item.overview && (
                            <p className="text-white/35 text-[11px] mt-1 line-clamp-2 leading-snug">{item.overview}</p>
                          )}
                        </div>
                      </div>
                      <div className="self-center flex-shrink-0">
                        {inCatalogue ? (
                          <Link
                            href={`/detail/${inCatalogue.client_type}/${inCatalogue.content_id}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#46d369]/15 border border-[#46d369]/30 text-[#46d369] text-[11px] font-bold active:bg-[#46d369]/25"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>
                            In catalogue
                          </Link>
                        ) : already ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/[0.06] text-white/55 text-[11px] font-semibold">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>
                            Requested
                          </span>
                        ) : (
                          <button
                            onClick={() => submit(item)}
                            disabled={submittingId === item.id}
                            className="px-3.5 py-2 rounded-lg bg-[#e50914] text-white text-[11px] font-bold active:bg-[#b20710] disabled:opacity-50"
                          >
                            {submittingId === item.id ? '…' : 'Request'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {/* Your requests list */}
        <section>
          <div className="flex items-center gap-2 mb-3 px-0.5">
            <h2 className="text-white/70 text-[11px] font-bold tracking-[0.14em] uppercase">Your requests</h2>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-white/[0.08] text-white/60 font-semibold">
                {pendingCount}
              </span>
            )}
          </div>

          {loadingRequests && (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-[88px] rounded-xl bg-white/[0.04] animate-pulse" />)}
            </div>
          )}

          {!loadingRequests && requests.length === 0 && query.trim().length === 0 && (
            <div className="py-12 flex flex-col items-center text-center">
              <div className="w-11 h-11 rounded-full bg-white/[0.06] flex items-center justify-center mb-3">
                <svg width="20" height="20" viewBox="0 -960 960 960" fill="#e50914">
                  <path d="M440-280h80v-160h160v-80H520v-160h-80v160H280v80h160v160ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Z"/>
                </svg>
              </div>
              <p className="text-white text-sm font-bold">No requests yet</p>
              <p className="text-white/45 text-xs mt-1 max-w-[260px]">Search for a title above and tap Request to send it to us.</p>
            </div>
          )}

          {!loadingRequests && requests.length > 0 && (
            <div className="space-y-2">
              {requests.map(req => {
                const canDelete = req.status === 'pending'
                const hit = catalogue.get(req.tmdb_id)
                const watchHref = hit ? `/detail/${hit.client_type}/${hit.content_id}` : null
                const rowBody = (
                  <>
                    <div className="w-[56px] h-[84px] flex-shrink-0 rounded-lg overflow-hidden bg-[#1a1a1a]">
                      {req.poster_path ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w154${req.poster_path}`}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/15 text-base">?</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                      <div>
                        <p className="text-white text-sm font-semibold truncate">{req.title}</p>
                        <p className="text-white/40 text-[11px] capitalize mt-0.5">
                          {req.type === 'tv' ? 'Show' : 'Movie'}
                          {' · '}
                          {new Date(req.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                      <div className="mt-1.5">
                        <StatusBadge status={req.status} />
                      </div>
                    </div>
                  </>
                )
                return (
                  <div key={req.id} className="flex gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                    {watchHref ? (
                      <Link href={watchHref} className="contents">
                        {rowBody}
                      </Link>
                    ) : (
                      rowBody
                    )}
                    {canDelete ? (
                      <button
                        onClick={() => remove(req.id)}
                        disabled={deletingId === req.id}
                        className="self-center w-8 h-8 rounded-full flex items-center justify-center bg-white/[0.04] text-white/40 active:bg-white/10 disabled:opacity-30"
                        aria-label="Cancel request"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="M18 6 6 18M6 6l12 12"/>
                        </svg>
                      </button>
                    ) : watchHref ? (
                      <Link
                        href={watchHref}
                        className="self-center inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#e50914] text-white text-[11px] font-bold active:bg-[#b20710]"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        Watch
                      </Link>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
