import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const CDN_BASE_URL = process.env.NEXT_PUBLIC_CDN_BASE_URL || ''

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const tmdbId = searchParams.get('tmdb_id')
  const type = searchParams.get('type')
  const seasonNumber = searchParams.get('season_number')
  const episodeNumber = searchParams.get('episode_number')

  if (!tmdbId || !type) {
    return NextResponse.json({ error: 'Missing tmdb_id or type' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() } } }
  )

  // Fetch video source
  let query = supabase
    .from('video_sources')
    .select('url, quality, audio_tracks, subtitle_tracks')
    .eq('tmdb_id', parseInt(tmdbId))
    .eq('type', type)

  if (type === 'tv' && seasonNumber && episodeNumber) {
    query = query.eq('season_number', parseInt(seasonNumber)).eq('episode_number', parseInt(episodeNumber))
  }

  const { data, error } = await query.order('quality', { ascending: false }).limit(1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const source = data?.[0]
  let url = source?.url || null
  if (url && !url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/')) {
    url = `/api/stream/${url}`
  }

  // Fetch content metadata (skip intro, credits, etc.)
  let metaQuery = supabase
    .from('content_metadata')
    .select('skip_intro_start, skip_intro_end, skip_recap_end, credits_start, next_episode_prompt, completion_threshold')
    .eq('tmdb_id', parseInt(tmdbId))
    .eq('type', type)

  if (type === 'tv' && seasonNumber && episodeNumber) {
    metaQuery = metaQuery.eq('season_number', parseInt(seasonNumber)).eq('episode_number', parseInt(episodeNumber))
  }

  const { data: metaData } = await metaQuery.maybeSingle()

  return NextResponse.json({
    url,
    subtitleTracks: source?.subtitle_tracks || [],
    audioTracks: source?.audio_tracks || [],
    metadata: metaData || null,
  })
}
