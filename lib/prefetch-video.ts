'use client'

// Prefetch video source + HLS manifest in the background
// Call this on link hover/touchstart before navigation happens

const prefetchCache = new Map<string, boolean>()

export function prefetchVideo(tmdbId: number, type: 'movie' | 'tv', season?: number, episode?: number) {
  const key = `${tmdbId}-${type}-${season || 0}-${episode || 0}`
  if (prefetchCache.has(key)) return
  prefetchCache.set(key, true)

  const params = new URLSearchParams({ tmdb_id: String(tmdbId), type })
  if (type === 'tv' && season && episode) {
    params.set('season_number', String(season))
    params.set('episode_number', String(episode))
  }

  // Fetch video source API (gets the manifest URL)
  fetch(`/api/video-source?${params}`)
    .then(r => r.json())
    .then(d => {
      if (d.url) {
        // Prefetch the HLS master manifest
        fetch(d.url, { priority: 'low' } as any).catch(() => {})
      }
    })
    .catch(() => {})
}
