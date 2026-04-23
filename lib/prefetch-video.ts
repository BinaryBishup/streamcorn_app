'use client'

/**
 * Prefetch the HLS master manifest for a content item in the background.
 * Call this on link hover/touchstart before navigation.
 *
 * Content is identified by uuid (the old `tmdb_id` slot on the component
 * prop shape now carries `content.id` thanks to the server adapter).
 */

const prefetchCache = new Map<string, boolean>()

export function prefetchVideo(
  contentId: string,
  type: 'movie' | 'tv',
  season?: number,
  episode?: number,
) {
  const key = `${contentId}-${type}-${season || 0}-${episode || 0}`
  if (prefetchCache.has(key)) return
  prefetchCache.set(key, true)

  const params = new URLSearchParams({ content_id: contentId, type })
  if (type === 'tv' && season && episode) {
    params.set('season_number', String(season))
    params.set('episode_number', String(episode))
  }

  fetch(`/api/video-source?${params}`)
    .then((r) => r.json())
    .then((d) => {
      if (d.url) fetch(d.url, { priority: 'low' } as RequestInit).catch(() => {})
    })
    .catch(() => {})
}
