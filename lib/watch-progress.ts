'use client'

/**
 * Watch-progress client helpers. Keys on the catalogue content id (uuid),
 * passed as `tmdb_id` across the wire for back-compat with component props
 * (the server adapter aliases `content.id` → `tmdb_id` for the UI).
 */

export interface WatchProgressRow {
  content_id: string
  tmdb_id: string
  type: 'movie' | 'tv'
  progress_seconds: number
  duration_seconds: number
  completed: boolean
  season_number: number | null
  episode_number: number | null
  title?: string
  backdrop_path?: string | null
  poster_path?: string | null
  last_watched?: string
}

interface SavePayload {
  profile_id: string
  content_id: string
  type: 'movie' | 'tv'
  season_number: number | null
  episode_number: number | null
  progress_seconds: number
  duration_seconds: number
  completed: boolean
}

export async function fetchProgress(profileId: string): Promise<WatchProgressRow[]> {
  try {
    const res = await fetch(`/api/watch-progress?profile_id=${profileId}`)
    if (!res.ok) return []
    const { items } = await res.json()
    return items ?? []
  } catch {
    return []
  }
}

export async function getResumePosition(
  profileId: string,
  contentId: string,
  mediaType: 'movie' | 'tv',
  seasonNumber?: number,
  episodeNumber?: number,
): Promise<number | null> {
  const items = await fetchProgress(profileId)
  const match = items.find((row) => {
    if (row.content_id !== contentId) return false
    if (mediaType === 'tv') {
      if (seasonNumber != null && row.season_number !== seasonNumber) return false
      if (episodeNumber != null && row.episode_number !== episodeNumber) return false
    }
    return true
  })
  if (match && !match.completed && match.progress_seconds > 5) {
    return Math.max(0, match.progress_seconds - 3)
  }
  return null
}

export async function saveProgress(payload: SavePayload): Promise<boolean> {
  try {
    const res = await fetch('/api/watch-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return res.ok
  } catch {
    return false
  }
}

export function beaconProgress(payload: SavePayload): void {
  try {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
    navigator.sendBeacon('/api/watch-progress', blob)
  } catch {
    saveProgress(payload).catch(() => {})
  }
}

export function buildPayload(
  profileId: string,
  contentId: string,
  mediaType: 'movie' | 'tv',
  currentTime: number,
  duration: number,
  seasonNumber?: number,
  episodeNumber?: number,
): SavePayload {
  const ct = Math.floor(Number(currentTime) || 0)
  const dur = Math.floor(Number(duration) || 0)
  return {
    profile_id: profileId,
    content_id: contentId,
    type: mediaType,
    season_number: mediaType === 'tv' ? (seasonNumber ?? null) : null,
    episode_number: mediaType === 'tv' ? (episodeNumber ?? null) : null,
    progress_seconds: ct,
    duration_seconds: dur,
    completed: dur > 0 && ct / dur > 0.93,
  }
}
