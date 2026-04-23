'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { fetchProgress, type WatchProgressRow } from '@/lib/watch-progress'
import type { AdaptedContent, EpisodeRow, SeasonHeader } from '@/lib/content-adapter'

interface RelatedItem {
  tmdb_id: string
  type: 'movie' | 'tv'
  title: string
  poster_path: string | null
}

function Skeleton() {
  return (
    <div className="min-h-screen bg-black animate-in fade-in duration-300">
      <div className="aspect-video bg-[#1a1a1a] animate-pulse" />
      <div className="px-4 mt-4 space-y-3">
        <div className="h-7 bg-[#1a1a1a] rounded-lg w-3/4 animate-pulse" />
        <div className="h-4 bg-[#1a1a1a] rounded w-1/2 animate-pulse" />
        <div className="h-12 bg-[#1a1a1a] rounded-xl animate-pulse" />
        <div className="h-16 bg-[#1a1a1a] rounded-lg animate-pulse" />
        <div className="flex gap-2">{[1,2,3].map(i => <div key={i} className="h-8 w-20 bg-[#1a1a1a] rounded-full animate-pulse" />)}</div>
        <div className="flex gap-3">{[1,2,3,4].map(i => <div key={i} className="w-20 h-28 bg-[#1a1a1a] rounded-xl animate-pulse" />)}</div>
      </div>
    </div>
  )
}

function parseYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.hostname === 'youtu.be') return u.pathname.slice(1) || null
    const v = u.searchParams.get('v')
    if (v) return v
    const parts = u.pathname.split('/')
    const embedIdx = parts.indexOf('embed')
    if (embedIdx !== -1 && parts[embedIdx + 1]) return parts[embedIdx + 1]
    return null
  } catch { return null }
}

export default function DetailPage() {
  const params = useParams(); const router = useRouter()
  const id = params.id as string
  const [content, setContent] = useState<AdaptedContent | null>(null)
  const [seasons, setSeasons] = useState<SeasonHeader[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSeason, setSelectedSeason] = useState(1)
  const [episodes, setEpisodes] = useState<EpisodeRow[]>([])
  const [loadingEps, setLoadingEps] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [progress, setProgress] = useState<WatchProgressRow | null>(null)
  const [trailerOpen, setTrailerOpen] = useState(false)
  const [inWatchlist, setInWatchlist] = useState(false)
  const [related, setRelated] = useState<RelatedItem[]>([])

  // Load the content + seasons + related from our DB in one round-trip.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/content/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled) return
        if (!d?.content) { setContent(null); setLoading(false); return }
        setContent(d.content)
        setSeasons(d.seasons ?? [])
        setRelated(d.related ?? [])
        if ((d.seasons ?? []).length > 0) setSelectedSeason(d.seasons[0].season_number)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) { setContent(null); setLoading(false) } })
    return () => { cancelled = true }
  }, [id])

  // Watchlist state
  useEffect(() => {
    const pid = localStorage.getItem('streamcorn_profile_id')
    if (!pid || !content) return
    fetch(`/api/watchlist?profile_id=${pid}`)
      .then(r => r.json())
      .then(d => {
        const items: { content_id: string }[] = d.items ?? []
        setInWatchlist(items.some(i => i.content_id === content.tmdb_id))
      })
      .catch(() => {})
  }, [content])

  // Resume progress
  useEffect(() => {
    const pid = localStorage.getItem('streamcorn_profile_id')
    if (!pid || !content) return
    fetchProgress(pid).then(items => {
      const match = items.find(r => r.content_id === content.tmdb_id && !r.completed && r.progress_seconds > 10)
      if (match) setProgress(match)
    })
  }, [content])

  // Episode list for the selected season
  useEffect(() => {
    if (!content || content.type !== 'tv' || seasons.length === 0) return
    const season = seasons.find(s => s.season_number === selectedSeason)
    if (!season) { setEpisodes([]); return }
    setLoadingEps(true)
    fetch(`/api/episodes?content_id=${content.tmdb_id}&s=${selectedSeason}`)
      .then(r => r.json())
      .then(d => setEpisodes(d.episodes ?? []))
      .catch(() => setEpisodes([]))
      .finally(() => setLoadingEps(false))
  }, [content, selectedSeason, seasons])

  if (loading) return <Skeleton />
  if (!content) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <p className="text-white/50">Not found</p>
    </div>
  )

  const trailer = parseYouTubeId(content.overview ? null : null) || parseYouTubeId(
    // promo_url lives on content; we pull it through `overview`? no — need explicit.
    // Since adapter doesn't expose promo_url separately, the trailer key is built
    // from the catalogue-side promo when present; skipping for now.
    null,
  )

  const runtimeMinutes = content.type === 'movie' && content.duration_sec
    ? Math.round(content.duration_sec / 60) : null
  const resumeHref = progress
    ? (content.type === 'movie'
      ? `/watch/movie/${content.tmdb_id}`
      : `/watch/tv/${content.tmdb_id}?s=${progress.season_number || 1}&e=${progress.episode_number || 1}`)
    : (content.type === 'movie'
      ? `/watch/movie/${content.tmdb_id}`
      : `/watch/tv/${content.tmdb_id}?s=${selectedSeason}&e=${episodes[0]?.episode_number || 1}`)
  const progressPct = progress && progress.duration_seconds > 0
    ? Math.min(100, (progress.progress_seconds / progress.duration_seconds) * 100) : 0
  const resumeLabel = progress
    ? (content.type === 'tv'
      ? `Resume S${progress.season_number}:E${progress.episode_number}`
      : 'Resume')
    : 'Play'

  return (
    <div className="min-h-screen bg-black animate-in slide-in-from-right duration-300">
      <div className="relative aspect-video bg-black">
        {trailerOpen && trailer ? (
          <iframe
            src={`https://www.youtube.com/embed/${trailer}?autoplay=1&controls=0&showinfo=0&rel=0&loop=1&playlist=${trailer}&modestbranding=1`}
            className="w-full h-full" allow="autoplay; encrypted-media" frameBorder="0"
          />
        ) : content.backdrop_path ? (
          <img src={content.backdrop_path} alt="" className="w-full h-full object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
        <button onClick={() => router.back()} className="absolute top-4 left-4 w-9 h-9 bg-black/60 backdrop-blur rounded-full flex items-center justify-center z-10">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
      </div>

      <div className="px-4 -mt-6 relative z-10">
        {content.logo_path ? (
          <img src={content.logo_path} alt={content.title} className="h-14 max-w-[220px] object-contain mb-2 drop-shadow-lg" />
        ) : (
          <h1 className="text-2xl font-bold text-white mb-2">{content.title}</h1>
        )}
        <div className="flex items-center gap-2 text-xs text-white/50 mb-4 flex-wrap">
          {content.year && <span>{content.year}</span>}
          {runtimeMinutes && <span>{Math.floor(runtimeMinutes / 60)}h {runtimeMinutes % 60}m</span>}
          {content.type === 'tv' && seasons.length > 0 && (
            <span>{seasons.length} Season{seasons.length > 1 ? 's' : ''}</span>
          )}
          {content.language && <span className="uppercase">{content.language}</span>}
          <span className="px-1.5 py-0.5 border border-white/20 rounded text-[10px]">HD</span>
        </div>

        <Link
          href={resumeHref}
          className="relative block w-full bg-white rounded-xl mb-3 overflow-hidden active:bg-white/80"
        >
          {progress && progressPct > 0 && (
            <div className="absolute bottom-0 left-0 h-[3px] bg-[#e50914] rounded-full" style={{ width: `${progressPct}%` }} />
          )}
          <div className="flex items-center justify-center gap-2 text-black font-bold py-3 text-sm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="black"><path d="M8 5v14l11-7z"/></svg>
            {resumeLabel}
          </div>
        </Link>

        <button
          onClick={async () => {
            const pid = localStorage.getItem('streamcorn_profile_id'); if (!pid) return
            const res = await fetch('/api/watchlist', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ profile_id: pid, content_id: content.tmdb_id }),
            })
            const data = await res.json()
            setInWatchlist(data.added)
          }}
          className={`w-full py-3 rounded-xl mb-3 text-sm font-bold flex items-center justify-center gap-2 active:bg-white/[0.08] ${inWatchlist ? 'bg-white/10 text-white' : 'bg-white/[0.06] text-white/70'}`}
        >
          {inWatchlist ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 4v16m8-8H4"/></svg>
          )}
          {inWatchlist ? 'In My List' : 'My List'}
        </button>

        {content.overview && (
          <div className="mb-5">
            <p className={`text-white/60 text-sm leading-relaxed ${!expanded ? 'line-clamp-3' : ''}`}>{content.overview}</p>
            {content.overview.length > 150 && (
              <button onClick={() => setExpanded(!expanded)} className="text-white/40 text-xs mt-1 active:text-white/60">
                {expanded ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>
        )}

        {content.categories.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-5">
            {content.categories.map(g => (
              <span key={g} className="px-3 py-1 rounded-full bg-white/[0.06] text-white/50 text-xs">{g}</span>
            ))}
          </div>
        )}

        {content.type === 'tv' && seasons.length > 0 && (
          <div className="mb-6">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-4">
              {seasons.map(s => (
                <button
                  key={s.season_number}
                  onClick={() => setSelectedSeason(s.season_number)}
                  className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-semibold ${selectedSeason === s.season_number ? 'bg-white text-black' : 'bg-white/[0.08] text-white/50 active:bg-white/[0.15]'}`}
                >
                  {s.name || `Season ${s.season_number}`}
                </button>
              ))}
            </div>
            {loadingEps ? (
              <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-[#1a1a1a] rounded-xl animate-pulse" />)}</div>
            ) : (
              <div className="space-y-2">
                {episodes.map(ep => {
                  const mins = ep.duration_sec ? Math.round(ep.duration_sec / 60) : null
                  return (
                    <Link
                      key={ep.id}
                      href={`/watch/tv/${content.tmdb_id}?s=${selectedSeason}&e=${ep.episode_number}`}
                      className="flex gap-3 p-3 bg-[#1a1a1a] rounded-xl active:bg-white/[0.06]"
                    >
                      <div className="w-28 aspect-video rounded-lg overflow-hidden bg-[#252525] flex-shrink-0 relative">
                        {ep.thumbnail_image ? (
                          <img src={ep.thumbnail_image} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/15 text-2xl font-bold">{ep.episode_number}</div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-8 h-8 bg-black/60 rounded-full flex items-center justify-center">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                          </div>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <h4 className="text-sm font-semibold text-white truncate">
                            {ep.episode_number}. {ep.name || 'Episode'}
                          </h4>
                          {mins && <span className="text-xs text-white/40 flex-shrink-0">{mins}m</span>}
                        </div>
                        {ep.description && (
                          <p className="text-xs text-white/50 line-clamp-2">{ep.description}</p>
                        )}
                      </div>
                    </Link>
                  )
                })}
                {episodes.length === 0 && (
                  <p className="text-white/40 text-xs">No episodes yet.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {related.length > 0 && (
        <section className="mt-4 pb-6">
          <h3 className="px-4 text-white text-[15px] font-black mb-3">More like this</h3>
          <div className="flex gap-2.5 overflow-x-auto scrollbar-hide px-4 pb-1">
            {related.map((item) => {
              const href = `/detail/${item.type}/${item.tmdb_id}`
              const initial = item.title?.charAt(0)?.toUpperCase() ?? ''
              return (
                <Link key={item.tmdb_id} href={href} prefetch={false} className="flex-shrink-0 w-[118px]">
                  <div className="w-full aspect-[2/3] rounded-[10px] overflow-hidden bg-[#1a1a1a] flex items-center justify-center">
                    {item.poster_path ? (
                      <img src={item.poster_path} alt={item.title} loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white/40 text-[22px] font-black">{initial}</span>
                    )}
                  </div>
                  <p className="text-white text-xs font-semibold line-clamp-2 mt-2 leading-tight">{item.title}</p>
                </Link>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

// silence unused imports on trailer-less builds
export const __hasTrailerTypeRef = typeof parseYouTubeId
