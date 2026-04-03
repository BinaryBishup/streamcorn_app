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

  const body = await request.json()
  const { profile_id, tmdb_id, type, season_number, episode_number, progress_seconds, duration_seconds } = body

  if (!profile_id || !tmdb_id || !type) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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

  const completed = duration_seconds > 0 && (progress_seconds / duration_seconds) >= 0.93

  // Check if row exists
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
    progress_seconds: Math.floor(progress_seconds),
    duration_seconds: Math.floor(duration_seconds),
    completed,
    last_watched: new Date().toISOString(),
  }

  let error
  if (existing) {
    const result = await supabase
      .from('watch_progress')
      .update(progressData)
      .eq('id', existing.id)
    error = result.error
  } else {
    const result = await supabase
      .from('watch_progress')
      .insert({
        profile_id,
        tmdb_id,
        type,
        season_number: season_number ?? null,
        episode_number: episode_number ?? null,
        ...progressData,
      })
    error = result.error
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
