'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { getResumePosition } from '@/lib/watch-progress'
import type { Episode, SeasonInfo } from '@/components/player/video-player'

const VideoPlayer = dynamic(() => import('@/components/player/video-player'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 bg-black z-[9999] flex items-center justify-center">
      <div className="w-12 h-12 border-3 border-white/20 border-t-[#e50914] rounded-full animate-spin" />
    </div>
  ),
})

const TMDB_KEY = '5c242b6eeca95f02957505a67a488635'

export default function WatchPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()

  const type = params.type as string
  const id = params.id as string
  const season = parseInt(searchParams.get('s') || '1')
  const episode = parseInt(searchParams.get('e') || '1')
  const tmdbId = parseInt(id)
  const mediaType = type as 'movie' | 'tv'

  const [src, setSrc] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [epTitle, setEpTitle] = useState('')
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [seasons, setSeasons] = useState<SeasonInfo[]>([])
  const [hasNext, setHasNext] = useState(false)
  const [resumePos, setResumePos] = useState<number | null>(null)
  const [ready, setReady] = useState(false)

  // Fetch everything in parallel
  useEffect(() => {
    let cancelled = false

    async function load() {
      const queryParams = new URLSearchParams({ tmdb_id: id, type })
      if (type === 'tv') {
        queryParams.set('season_number', String(season))
        queryParams.set('episode_number', String(episode))
      }

      const profileId = localStorage.getItem('streamcorn_profile_id')
      const seasonNum = type === 'tv' ? season : undefined
      const episodeNum = type === 'tv' ? episode : undefined

      const [srcRes, detailRes, resume] = await Promise.all([
        fetch(`/api/video-source?${queryParams}`).then(r => r.json()),
        fetch(`https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_KEY}`).then(r => r.json()),
        profileId ? getResumePosition(profileId, tmdbId, mediaType, seasonNum, episodeNum) : null,
      ])

      if (cancelled) return

      setSrc(srcRes.url || null)
      setTitle(detailRes.title || detailRes.name || '')
      setResumePos(resume)

      if (type === 'tv') {
        const filteredSeasons = (detailRes.seasons || [])
          .filter((s: any) => s.season_number > 0)
          .map((s: any) => ({ season_number: s.season_number, name: s.name }))
        setSeasons(filteredSeasons)

        const seasonRes = await fetch(
          `https://api.themoviedb.org/3/tv/${id}/season/${season}?api_key=${TMDB_KEY}`
        ).then(r => r.json())

        if (cancelled) return

        const eps: Episode[] = (seasonRes.episodes || []).map((e: any) => ({
          id: e.id,
          episode_number: e.episode_number,
          name: e.name,
          still_path: e.still_path,
          runtime: e.runtime,
        }))
        setEpisodes(eps)

        const cur = eps.find(e => e.episode_number === episode)
        setEpTitle(cur ? `S${season}:E${episode} ${cur.name}` : '')
        setHasNext(eps.findIndex(e => e.episode_number === episode) < eps.length - 1)
      }

      setReady(true)
    }

    setReady(false)
    load()
    return () => { cancelled = true }
  }, [id, type, season, episode, tmdbId, mediaType])

  const handleNextEpisode = () => {
    const idx = episodes.findIndex(ep => ep.episode_number === episode)
    if (idx < episodes.length - 1) {
      router.push(`/watch/tv/${id}?s=${season}&e=${episodes[idx + 1].episode_number}`)
    }
  }

  const handleSelectEpisode = (s: number, ep: number) => {
    router.push(`/watch/tv/${id}?s=${s}&e=${ep}`)
  }

  // Loading state
  if (!ready || !src) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
        <div className="w-12 h-12 border-3 border-white/20 border-t-[#e50914] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <VideoPlayer
      src={src}
      title={title}
      epTitle={epTitle}
      mediaType={mediaType}
      tmdbId={tmdbId}
      seasonNumber={type === 'tv' ? season : undefined}
      episodeNumber={type === 'tv' ? episode : undefined}
      resumePosition={resumePos}
      episodes={episodes}
      seasons={seasons}
      currentSeason={season}
      hasNext={hasNext}
      onBack={() => router.back()}
      onNextEpisode={handleNextEpisode}
      onSelectEpisode={handleSelectEpisode}
    />
  )
}
