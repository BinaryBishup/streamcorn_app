'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

const TMDB_KEY = '5c242b6eeca95f02957505a67a488635'

interface Details {
  id: number; title: string; overview: string; posterPath: string; backdropPath: string
  rating: number; year: string; type: 'movie' | 'tv'; runtime?: number
  seasons?: { season_number: number; name: string; episode_count: number }[]
  genreNames: string[]
  cast: { name: string; character: string; photo: string }[]
}

interface Episode {
  id: number; episode_number: number; name: string; overview: string
  still_path: string | null; runtime: number | null
}

export default function DetailPage() {
  const params = useParams()
  const router = useRouter()
  const type = params.type as string
  const id = params.id as string

  const [details, setDetails] = useState<Details | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedSeason, setSelectedSeason] = useState(1)
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [loadingEpisodes, setLoadingEpisodes] = useState(false)

  // Fetch details
  useEffect(() => {
    async function load() {
      try {
        const ep = type === 'movie' ? `/movie/${id}` : `/tv/${id}`
        const res = await fetch(`https://api.themoviedb.org/3${ep}?api_key=${TMDB_KEY}&append_to_response=credits`)
        const d = await res.json()
        setDetails({
          id: d.id, title: d.title || d.name || '', overview: d.overview || '',
          posterPath: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : '',
          backdropPath: d.backdrop_path ? `https://image.tmdb.org/t/p/w780${d.backdrop_path}` : '',
          rating: d.vote_average || 0, year: (d.release_date || d.first_air_date || '').substring(0, 4),
          type: type as 'movie' | 'tv', runtime: d.runtime,
          seasons: (d.seasons || []).filter((s: any) => s.season_number > 0),
          genreNames: (d.genres || []).map((g: any) => g.name),
          cast: (d.credits?.cast || []).slice(0, 10).map((c: any) => ({
            name: c.name, character: c.character,
            photo: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : '',
          })),
        })
      } catch {}
      setLoading(false)
    }
    load()
  }, [type, id])

  // Fetch episodes when season changes (TV only)
  useEffect(() => {
    if (type !== 'tv' || !details) return
    setLoadingEpisodes(true)
    fetch(`https://api.themoviedb.org/3/tv/${id}/season/${selectedSeason}?api_key=${TMDB_KEY}`)
      .then(r => r.json())
      .then(d => setEpisodes(d.episodes || []))
      .catch(() => setEpisodes([]))
      .finally(() => setLoadingEpisodes(false))
  }, [type, id, selectedSeason, details])

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center"><div className="w-8 h-8 border-2 border-[#e50914] border-t-transparent rounded-full animate-spin" /></div>
  if (!details) return <div className="min-h-screen bg-black flex items-center justify-center"><p className="text-white/50">Not found</p></div>

  return (
    <div className="min-h-screen bg-black">
      {/* Backdrop */}
      <div className="relative aspect-video">
        {details.backdropPath && <img src={details.backdropPath} alt="" className="w-full h-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        <button onClick={() => router.back()} className="absolute top-4 left-4 w-9 h-9 bg-black/50 backdrop-blur rounded-full flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
        </button>
      </div>

      <div className="px-4 -mt-8 relative z-10">
        <h1 className="text-2xl font-bold text-white mb-2">{details.title}</h1>
        <div className="flex items-center gap-2 text-xs text-white/50 mb-4 flex-wrap">
          <span className="text-[#46d369] font-semibold">{Math.round(details.rating * 10)}% Match</span>
          <span>{details.year}</span>
          {details.runtime && <span>{Math.floor(details.runtime / 60)}h {details.runtime % 60}m</span>}
          {details.seasons && <span>{details.seasons.length} Season{details.seasons.length > 1 ? 's' : ''}</span>}
          <span className="px-1.5 py-0.5 border border-white/20 rounded text-[10px]">HD</span>
        </div>

        {/* Play button */}
        <Link
          href={type === 'movie' ? `/watch/movie/${id}` : `/watch/tv/${id}?s=${selectedSeason}&e=${episodes[0]?.episode_number || 1}`}
          className="flex items-center justify-center gap-2 bg-white text-black font-bold py-3 rounded-lg text-sm mb-3 w-full active:bg-white/80"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="black"><path d="M8 5v14l11-7z"/></svg>
          Play
        </Link>

        <p className="text-white/70 text-sm leading-relaxed mb-5">{details.overview}</p>

        {/* Genres */}
        <div className="flex gap-2 flex-wrap mb-5">
          {details.genreNames.map(g => (
            <span key={g} className="px-3 py-1 rounded-full bg-white/[0.06] text-white/50 text-xs">{g}</span>
          ))}
        </div>

        {/* Seasons & Episodes (TV only) */}
        {type === 'tv' && details.seasons && details.seasons.length > 0 && (
          <div className="mb-6">
            {/* Season selector */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-4">
              {details.seasons.map(s => (
                <button
                  key={s.season_number}
                  onClick={() => setSelectedSeason(s.season_number)}
                  className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-all ${
                    selectedSeason === s.season_number
                      ? 'bg-white text-black'
                      : 'bg-white/[0.08] text-white/50 active:bg-white/[0.15]'
                  }`}
                >
                  Season {s.season_number}
                </button>
              ))}
            </div>

            {/* Episodes list */}
            {loadingEpisodes ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-20 bg-[#1a1a1a] rounded-xl animate-pulse" />)}
              </div>
            ) : (
              <div className="space-y-2">
                {episodes.map(ep => (
                  <Link
                    key={ep.id}
                    href={`/watch/tv/${id}?s=${selectedSeason}&e=${ep.episode_number}`}
                    className="flex gap-3 p-3 bg-[#1a1a1a] rounded-xl active:bg-white/[0.06]"
                  >
                    <div className="w-28 aspect-video rounded-lg overflow-hidden bg-[#252525] flex-shrink-0 relative">
                      {ep.still_path ? (
                        <img src={`https://image.tmdb.org/t/p/w300${ep.still_path}`} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/15 text-2xl font-bold">{ep.episode_number}</div>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-8 h-8 bg-black/60 rounded-full flex items-center justify-center">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 py-0.5">
                      <p className="text-white text-sm font-medium truncate">{ep.episode_number}. {ep.name}</p>
                      {ep.runtime && <p className="text-white/30 text-xs">{ep.runtime}m</p>}
                      <p className="text-white/40 text-xs line-clamp-2 mt-1">{ep.overview}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Cast */}
        {details.cast.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-white/80 mb-3">Cast</h3>
            <div className="flex gap-3 overflow-x-auto scrollbar-hide">
              {details.cast.map(c => (
                <div key={c.name} className="flex-shrink-0 w-16 text-center">
                  <div className="w-14 h-14 rounded-full bg-[#1a1a1a] overflow-hidden mx-auto mb-1">
                    {c.photo ? <img src={c.photo} alt={c.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white/20 text-lg">?</div>}
                  </div>
                  <p className="text-white/60 text-[10px] truncate">{c.name}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
