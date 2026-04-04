'use client'

import { useEffect, useRef, useCallback, useState } from 'react'

export interface WatchProgressData {
  tmdb_id: number
  type: 'movie' | 'tv'
  progress_seconds: number
  duration_seconds: number
  completed: boolean
  season_number?: number | null
  episode_number?: number | null
  last_watched?: string
}

const SAVE_INTERVAL = 15_000 // Save every 15 seconds

/**
 * Hook to save and restore watch progress for the current profile.
 */
export function useWatchProgress({
  profileId,
  tmdbId,
  mediaType,
  seasonNumber,
  episodeNumber,
}: {
  profileId: string | null | undefined
  tmdbId: number | undefined
  mediaType: 'movie' | 'tv' | undefined
  seasonNumber?: number
  episodeNumber?: number
}) {
  const lastSavedRef = useRef(0)
  const currentTimeRef = useRef(0)
  const durationRef = useRef(0)
  const [resumePosition, setResumePosition] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch resume position on mount via API route
  useEffect(() => {
    if (!tmdbId || !mediaType) {
      setLoading(false)
      return
    }
    if (!profileId) {
      return
    }

    setLoading(true)
    let cancelled = false

    async function fetchProgress() {
      try {
        const res = await fetch(`/api/watch-progress?profile_id=${profileId}`)
        if (!res.ok) { setLoading(false); return }
        const { items } = await res.json()

        if (cancelled) return

        const match = (items || []).find((row: any) => {
          if (row.tmdb_id !== tmdbId || row.type !== mediaType) return false
          if (mediaType === 'tv') {
            if (seasonNumber != null && row.season_number !== seasonNumber) return false
            if (episodeNumber != null && row.episode_number !== episodeNumber) return false
          }
          return true
        })

        if (match && !match.completed && match.progress_seconds > 5) {
          setResumePosition(Math.max(0, match.progress_seconds - 3))
        } else {
          setResumePosition(null)
        }
      } catch {
        // silently fail
      }
      if (!cancelled) setLoading(false)
    }

    fetchProgress()
    return () => { cancelled = true }
  }, [profileId, tmdbId, mediaType, seasonNumber, episodeNumber])

  const saveProgress = useCallback(async () => {
    if (!profileId || !tmdbId || !mediaType) return
    if (durationRef.current < 10) return
    if (currentTimeRef.current < 5) return

    const progressData = {
      profile_id: profileId,
      tmdb_id: tmdbId,
      type: mediaType,
      season_number: mediaType === 'tv' ? (seasonNumber ?? null) : null,
      episode_number: mediaType === 'tv' ? (episodeNumber ?? null) : null,
      progress_seconds: Math.floor(currentTimeRef.current),
      duration_seconds: Math.floor(durationRef.current),
      completed: durationRef.current > 0 && currentTimeRef.current / durationRef.current > 0.93,
    }

    try {
      await fetch('/api/watch-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(progressData),
      })
    } catch (err) {
      console.error('[WatchProgress] server save failed:', err)
    }
  }, [profileId, tmdbId, mediaType, seasonNumber, episodeNumber])

  const updateTime = useCallback((time: number, dur: number) => {
    currentTimeRef.current = time
    durationRef.current = dur
  }, [])

  // Periodic save
  useEffect(() => {
    if (!profileId || !tmdbId || !mediaType) return

    const interval = setInterval(() => {
      if (currentTimeRef.current > 5 && Math.abs(currentTimeRef.current - lastSavedRef.current) > 5) {
        lastSavedRef.current = currentTimeRef.current
        saveProgress()
      }
    }, SAVE_INTERVAL)

    return () => clearInterval(interval)
  }, [profileId, tmdbId, mediaType, saveProgress])

  // Save on unmount
  useEffect(() => {
    return () => {
      if (currentTimeRef.current > 5 && profileId && tmdbId && mediaType) {
        saveProgress()
      }
    }
  }, [profileId, tmdbId, mediaType, saveProgress])

  // Save on visibilitychange / pagehide (critical for mobile browsers)
  useEffect(() => {
    if (!profileId || !tmdbId || !mediaType) return

    const handleSave = () => {
      if (currentTimeRef.current > 5) saveProgress()
    }
    const onVisChange = () => { if (document.visibilityState === 'hidden') handleSave() }

    document.addEventListener('visibilitychange', onVisChange)
    window.addEventListener('pagehide', handleSave)
    return () => {
      document.removeEventListener('visibilitychange', onVisChange)
      window.removeEventListener('pagehide', handleSave)
    }
  }, [profileId, tmdbId, mediaType, saveProgress])

  return { resumePosition, loading, updateTime, saveProgress }
}

/**
 * Fetch "Continue Watching" items for a profile via API route.
 */
export async function fetchContinueWatching(profileId: string): Promise<WatchProgressData[]> {
  try {
    const res = await fetch(`/api/watch-progress?profile_id=${profileId}`)
    if (!res.ok) return []
    const { items } = await res.json()

    return (items || []).map((row: any) => ({
      tmdb_id: row.tmdb_id,
      type: row.type,
      progress_seconds: row.progress_seconds,
      duration_seconds: row.duration_seconds,
      completed: row.completed ?? false,
      season_number: row.season_number,
      episode_number: row.episode_number,
      last_watched: row.last_watched ?? undefined,
    }))
  } catch {
    return []
  }
}
