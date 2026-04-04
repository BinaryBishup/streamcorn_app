import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  // Check auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profileId = request.nextUrl.searchParams.get('profile_id')
  if (!profileId) {
    return NextResponse.json({ error: 'Missing profile_id' }, { status: 400 })
  }

  // Verify the profile belongs to this user
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', profileId)
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('watch_progress')
    .select('*')
    .eq('profile_id', profileId)
    .eq('completed', false)
    .order('last_watched', { ascending: false })
    .limit(20)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ items: data || [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { profile_id, tmdb_id, type, season_number, episode_number, progress_seconds, duration_seconds } = body

  if (!profile_id || !tmdb_id || !type) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const progressNum = Math.floor(Number(progress_seconds) || 0)
  const durationNum = Math.floor(Number(duration_seconds) || 0)

  if (durationNum <= 0 || progressNum < 0) {
    return NextResponse.json({ error: 'Invalid progress/duration values' }, { status: 400 })
  }

  // Verify the profile belongs to this user
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', profile_id)
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
  }

  const completed = durationNum > 0 && (progressNum / durationNum) >= 0.93

  const row = {
    profile_id,
    tmdb_id,
    type,
    season_number: season_number ?? null,
    episode_number: episode_number ?? null,
    progress_seconds: progressNum,
    duration_seconds: durationNum,
    completed,
    last_watched: new Date().toISOString(),
  }

  // Use raw SQL upsert to handle the COALESCE-based unique index atomically
  // This avoids race conditions between rapid saves (timeupdate + beacon)
  const { error } = await supabase.rpc('upsert_watch_progress' as any, {
    p_profile_id: row.profile_id,
    p_tmdb_id: row.tmdb_id,
    p_type: row.type,
    p_season_number: row.season_number,
    p_episode_number: row.episode_number,
    p_progress_seconds: row.progress_seconds,
    p_duration_seconds: row.duration_seconds,
    p_completed: row.completed,
  })

  // Fallback to check-then-update if RPC doesn't exist
  if (error && error.message?.includes('upsert_watch_progress')) {
    let query = supabase
      .from('watch_progress')
      .select('id')
      .eq('profile_id', profile_id)
      .eq('tmdb_id', tmdb_id)
      .eq('type', type)

    if (season_number != null) query = query.eq('season_number', season_number)
    else query = query.is('season_number', null)
    if (episode_number != null) query = query.eq('episode_number', episode_number)
    else query = query.is('episode_number', null)

    const { data: existing } = await query.maybeSingle()

    const progressData = {
      progress_seconds: progressNum,
      duration_seconds: durationNum,
      completed,
      last_watched: new Date().toISOString(),
    }

    let fallbackError
    if (existing) {
      const result = await supabase
        .from('watch_progress')
        .update(progressData)
        .eq('id', existing.id)
      fallbackError = result.error
    } else {
      const result = await supabase
        .from('watch_progress')
        .insert(row)
      fallbackError = result.error
    }

    if (fallbackError) {
      return NextResponse.json({ error: fallbackError.message }, { status: 500 })
    }
  } else if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
