import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Returns the HLS master URL for a piece of content, plus any
 * per-episode metadata (intro markers, recap/outro) the player uses.
 *
 * URL scheme (Bunny CDN, written by the streamcorn-converter pipeline):
 *   Movie:  {contentId}/master.m3u8
 *   Series: {contentId}/{season}/{episode}/master.m3u8
 *
 * Callers may pass EITHER `content_id` (uuid, preferred) or the legacy
 * `tmdb_id`; both are resolved to a catalogue row. We return a path under
 * `/api/stream/…` so the proxy can rewrite the embedded key URI on the fly.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const contentIdParam = sp.get('content_id')
  const tmdbId = sp.get('tmdb_id')
  const type = sp.get('type') // 'movie' | 'tv'
  const seasonNumber = sp.get('season_number')
  const episodeNumber = sp.get('episode_number')

  if (!contentIdParam && !tmdbId) {
    return NextResponse.json({ error: 'Missing content_id or tmdb_id' }, { status: 400 })
  }

  const supabase = await createClient()

  // Resolve content row
  type ContentRow = { id: string; type: string; hash_key: string | null }
  let content: ContentRow | null = null
  if (contentIdParam) {
    const { data } = await supabase
      .from('content')
      .select('id, type, hash_key')
      .eq('id', contentIdParam)
      .maybeSingle()
    content = data as ContentRow | null
  } else if (tmdbId) {
    const { data } = await supabase
      .from('content')
      .select('id, type, hash_key')
      .eq('tmdb_id', parseInt(tmdbId, 10))
      .eq('is_hidden', false)
      .maybeSingle()
    content = data as ContentRow | null
  }
  if (!content) return NextResponse.json({ error: 'Content not found' }, { status: 404 })

  const isMovie = content.type === 'movie'
  const clientType = isMovie ? 'movie' : 'tv'

  // Build proxied stream URL (the /api/stream proxy maps to Bunny).
  const path = (!isMovie && seasonNumber && episodeNumber)
    ? `${content.id}/${seasonNumber}/${episodeNumber}/master.m3u8`
    : `${content.id}/master.m3u8`

  const proxyParams = new URLSearchParams({ content_id: content.id, type: clientType })
  if (!isMovie && seasonNumber && episodeNumber) {
    proxyParams.set('season_number', seasonNumber)
    proxyParams.set('episode_number', episodeNumber)
  }
  const url = `/api/stream/${path}?${proxyParams.toString()}`

  // Pull per-episode metadata for skip markers when this is a series request.
  let metadata: {
    skip_intro_start: number | null
    skip_intro_end: number | null
    skip_recap_end: number | null
    credits_start: number | null
    next_episode_prompt: number | null
    completion_threshold: number | null
  } | null = null

  // Default to the content-level key (used for movies and as a fallback
  // for series whose per-episode key isn't populated).
  let encryptionKeyHex = content.hash_key?.trim() ?? null

  if (!isMovie && seasonNumber && episodeNumber) {
    const { data: season } = await supabase
      .from('seasons')
      .select('id')
      .eq('content_id', content.id)
      .eq('season_number', parseInt(seasonNumber, 10))
      .maybeSingle()
    if (season) {
      const { data: ep } = await supabase
        .from('episodes')
        .select('intro_start_sec, intro_end_sec, recap_end_sec, outro_start_sec, duration_sec, hash_key')
        .eq('season_id', (season as { id: string }).id)
        .eq('episode_number', parseInt(episodeNumber, 10))
        .maybeSingle()
      if (ep) {
        const e = ep as {
          intro_start_sec: number | null
          intro_end_sec: number | null
          recap_end_sec: number | null
          outro_start_sec: number | null
          duration_sec: number | null
          hash_key: string | null
        }
        metadata = {
          skip_intro_start: e.intro_start_sec,
          skip_intro_end: e.intro_end_sec,
          skip_recap_end: e.recap_end_sec,
          credits_start: e.outro_start_sec,
          next_episode_prompt: e.outro_start_sec,
          completion_threshold: 0.93,
        }
        if (e.hash_key?.trim()) encryptionKeyHex = e.hash_key.trim()
      }
    }
  }

  return NextResponse.json({
    url,
    encryptionKeyHex,
    subtitleTracks: [],
    audioTracks: [],
    metadata,
  })
}
