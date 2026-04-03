'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface Details {
  id: number
  title: string
  overview: string
  posterPath: string
  backdropPath: string
  rating: number
  year: string
  type: 'movie' | 'tv'
  runtime?: number
  seasons?: number
  genreNames: string[]
  cast: { name: string; character: string; photo: string }[]
}

const TMDB_API_KEY = '5c242b6eeca95f02957505a67a488635'

export default function DetailPage() {
  const params = useParams()
  const router = useRouter()
  const type = params.type as string
  const id = params.id as string
  const [details, setDetails] = useState<Details | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch_details() {
      try {
        const endpoint = type === 'movie'
          ? `https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_API_KEY}&append_to_response=credits`
          : `https://api.themoviedb.org/3/tv/${id}?api_key=${TMDB_API_KEY}&append_to_response=credits`
        const res = await fetch(endpoint)
        const data = await res.json()

        setDetails({
          id: data.id,
          title: data.title || data.name || '',
          overview: data.overview || '',
          posterPath: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : '',
          backdropPath: data.backdrop_path ? `https://image.tmdb.org/t/p/w780${data.backdrop_path}` : '',
          rating: data.vote_average || 0,
          year: (data.release_date || data.first_air_date || '').substring(0, 4),
          type: type as 'movie' | 'tv',
          runtime: data.runtime,
          seasons: data.number_of_seasons,
          genreNames: (data.genres || []).map((g: any) => g.name),
          cast: (data.credits?.cast || []).slice(0, 10).map((c: any) => ({
            name: c.name,
            character: c.character,
            photo: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : '',
          })),
        })
      } catch {}
      setLoading(false)
    }
    fetch_details()
  }, [type, id])

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#e50914] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!details) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white/50">Content not found</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Backdrop */}
      <div className="relative aspect-video">
        {details.backdropPath && (
          <img src={details.backdropPath} alt="" className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />

        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="absolute top-4 left-4 w-9 h-9 bg-black/50 backdrop-blur rounded-full flex items-center justify-center"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
      </div>

      <div className="px-4 -mt-8 relative z-10">
        {/* Title */}
        <h1 className="text-2xl font-bold text-white mb-2">{details.title}</h1>

        {/* Meta */}
        <div className="flex items-center gap-2 text-xs text-white/50 mb-4 flex-wrap">
          <span className="text-[#46d369] font-semibold">{Math.round(details.rating * 10)}% Match</span>
          <span>{details.year}</span>
          {details.runtime && <span>{Math.floor(details.runtime / 60)}h {details.runtime % 60}m</span>}
          {details.seasons && <span>{details.seasons} Season{details.seasons > 1 ? 's' : ''}</span>}
          <span className="px-1.5 py-0.5 border border-white/20 rounded text-[10px]">HD</span>
        </div>

        {/* Play button */}
        <Link
          href={type === 'movie' ? `/watch/movie/${id}` : `/watch/tv/${id}?s=1&e=1`}
          className="flex items-center justify-center gap-2 bg-white text-black font-bold py-3 rounded-lg text-sm mb-3 w-full"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="black"><path d="M8 5v14l11-7z"/></svg>
          Play
        </Link>

        {/* Overview */}
        <p className="text-white/70 text-sm leading-relaxed mb-5">{details.overview}</p>

        {/* Genres */}
        <div className="flex gap-2 flex-wrap mb-5">
          {details.genreNames.map(g => (
            <span key={g} className="px-3 py-1 rounded-full bg-white/[0.06] text-white/50 text-xs">{g}</span>
          ))}
        </div>

        {/* Cast */}
        {details.cast.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-white/80 mb-3">Cast</h3>
            <div className="flex gap-3 overflow-x-auto scrollbar-hide">
              {details.cast.map(c => (
                <div key={c.name} className="flex-shrink-0 w-16 text-center">
                  <div className="w-14 h-14 rounded-full bg-[#1a1a1a] overflow-hidden mx-auto mb-1">
                    {c.photo ? (
                      <img src={c.photo} alt={c.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/20 text-lg">?</div>
                    )}
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
