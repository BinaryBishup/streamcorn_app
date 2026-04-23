import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Watch progress — keyed on (profile_id, content_id, season_number,
 * episode_number). The client may still send legacy (tmdb_id, type); we
 * translate those to a content_id via the `content` table.
 */

const COMPLETE_THRESHOLD = 0.93

async function resolveContentId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  body: { content_id?: string; tmdb_id?: string | number }
): Promise<string | null> {
  if (body.content_id) return body.content_id
  const n = typeof body.tmdb_id === 'number' ? body.tmdb_id : Number(body.tmdb_id)
  if (!Number.isFinite(n)) return null
  const { data } = await supabase
    .from('content')
    .select('id')
    .eq('tmdb_id', n)
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profileId = request.nextUrl.searchParams.get('profile_id')
  if (!profileId) return NextResponse.json({ error: 'Missing profile_id' }, { status: 400 })

  const contentIdFilter = request.nextUrl.searchParams.get('content_id')
  const seasonFilter = request.nextUrl.searchParams.get('s')
  const episodeFilter = request.nextUrl.searchParams.get('e')

  // RLS scopes watch_progress to the caller's profiles automatically, but we
  // still do a defensive profile-owner check so a bad profile_id returns 403
  // instead of a silently empty list.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', profileId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

  let q = supabase
    .from('watch_progress')
    .select('id, content_id, season_number, episode_number, progress_seconds, duration_seconds, completed, last_watched, content:content_id(id, name, type, backdrop_image, poster_image)')
    .eq('profile_id', profileId)

  if (contentIdFilter) q = q.eq('content_id', contentIdFilter)
  if (seasonFilter) q = q.eq('season_number', Number(seasonFilter))
  if (episodeFilter) q = q.eq('episode_number', Number(episodeFilter))

  const { data, error } = await q
    .order('last_watched', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Shape rows for the existing continue-watching component: expose a
  // `tmdb_id` alias pointing at the content uuid so the component keeps
  // working; plus the already-joined title/backdrop so it doesn't have
  // to round-trip to TMDB.
  type JoinedRow = {
    id: string
    content_id: string
    season_number: number | null
    episode_number: number | null
    progress_seconds: number
    duration_seconds: number
    completed: boolean | null
    last_watched: string
    content: { id: string; name: string; type: 'movie' | 'show' | 'anime'; backdrop_image: string | null; poster_image: string | null } | null
  }
  const items = ((data ?? []) as unknown as JoinedRow[]).map((row) => ({
    tmdb_id: row.content_id,
    content_id: row.content_id,
    type: (row.content?.type === 'movie' ? 'movie' : 'tv') as 'movie' | 'tv',
    season_number: row.season_number,
    episode_number: row.episode_number,
    progress_seconds: row.progress_seconds,
    duration_seconds: row.duration_seconds,
    completed: row.completed ?? false,
    last_watched: row.last_watched,
    title: row.content?.name ?? '',
    backdrop_path: row.content?.backdrop_image ?? null,
    poster_path: row.content?.poster_image ?? null,
  }))

  return NextResponse.json({ items })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    profile_id?: string
    content_id?: string
    tmdb_id?: string | number
    type?: string
    season_number?: number | null
    episode_number?: number | null
    progress_seconds?: number
    duration_seconds?: number
  }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { profile_id, season_number, episode_number, progress_seconds, duration_seconds } = body
  if (!profile_id) return NextResponse.json({ error: 'Missing profile_id' }, { status: 400 })

  const contentId = await resolveContentId(supabase, body)
  if (!contentId) return NextResponse.json({ error: 'Unknown content' }, { status: 400 })

  const progressNum = Math.floor(Number(progress_seconds) || 0)
  const durationNum = Math.floor(Number(duration_seconds) || 0)
  if (durationNum <= 0 || progressNum < 0) {
    return NextResponse.json({ error: 'Invalid progress/duration' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', profile_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

  const completed = progressNum / durationNum >= COMPLETE_THRESHOLD

  // Best-effort upsert: the `watch_progress` unique index is on
  // (profile_id, content_id, season_number, episode_number) with NULL
  // handled correctly for movies. We do a delete+insert to keep the logic
  // portable across index definitions.
  let del = supabase
    .from('watch_progress')
    .delete()
    .eq('profile_id', profile_id)
    .eq('content_id', contentId)
  del = season_number != null ? del.eq('season_number', season_number) : del.is('season_number', null)
  del = episode_number != null ? del.eq('episode_number', episode_number) : del.is('episode_number', null)
  await del

  const { error } = await supabase.from('watch_progress').insert({
    profile_id,
    content_id: contentId,
    season_number: season_number ?? null,
    episode_number: episode_number ?? null,
    progress_seconds: progressNum,
    duration_seconds: durationNum,
    completed,
    last_watched: new Date().toISOString(),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
