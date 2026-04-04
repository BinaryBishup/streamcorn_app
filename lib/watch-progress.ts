'use client'

// ── Types ──────────────────────────────────────────────────────────────────
export interface WatchProgressRow {
  tmdb_id: number
  type: 'movie' | 'tv'
  progress_seconds: number
  duration_seconds: number
  completed: boolean
  season_number: number | null
  episode_number: number | null
  last_watched?: string
}

interface SavePayload {
  profile_id: string
  tmdb_id: number
  type: 'movie' | 'tv'
  season_number: number | null
  episode_number: number | null
  progress_seconds: number
  duration_seconds: number
  completed: boolean
}

// ── Fetch all incomplete progress for a profile ────────────────────────────
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

// ── Find resume position for a specific item ───────────────────────────────
export async function getResumePosition(
  profileId: string,
  tmdbId: number,
  mediaType: 'movie' | 'tv',
  seasonNumber?: number,
  episodeNumber?: number,
): Promise<number | null> {
  const items = await fetchProgress(profileId)
  const match = items.find((row) => {
    if (row.tmdb_id !== tmdbId || row.type !== mediaType) return false
    if (mediaType === 'tv') {
      if (seasonNumber != null && row.season_number !== seasonNumber) return false
      if (episodeNumber != null && row.episode_number !== episodeNumber) return false
    }
    return true
  })
  if (match && !match.completed && match.progress_seconds > 5) {
    return Math.max(0, match.progress_seconds - 3) // back up 3s for context
  }
  return null
}

// ── Save progress via fetch (normal) ───────────────────────────────────────
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

// ── Save progress via sendBeacon (for unload / visibility hidden) ──────────
// sendBeacon is guaranteed to complete even if the page is being destroyed.
// Regular fetch() in cleanup functions gets cancelled by the browser.
export function beaconProgress(payload: SavePayload): void {
  try {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
    navigator.sendBeacon('/api/watch-progress', blob)
  } catch {
    // last-resort fallback
    saveProgress(payload).catch(() => {})
  }
}

// ── Build a save payload from current state ────────────────────────────────
export function buildPayload(
  profileId: string,
  tmdbId: number,
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
    tmdb_id: tmdbId,
    type: mediaType,
    season_number: mediaType === 'tv' ? (seasonNumber ?? null) : null,
    episode_number: mediaType === 'tv' ? (episodeNumber ?? null) : null,
    progress_seconds: ct,
    duration_seconds: dur,
    completed: dur > 0 && ct / dur > 0.93,
  }
}
