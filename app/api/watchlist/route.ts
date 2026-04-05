import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profileId = request.nextUrl.searchParams.get('profile_id')
  if (!profileId) return NextResponse.json({ error: 'Missing profile_id' }, { status: 400 })

  const { data } = await supabase
    .from('watchlist')
    .select('tmdb_id, type')
    .eq('profile_id', profileId)
    .order('added_at', { ascending: false })

  return NextResponse.json({ items: data || [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { profile_id, tmdb_id, type } = await request.json()
  if (!profile_id || !tmdb_id || !type) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  // Check if already in watchlist
  const { data: existing } = await supabase
    .from('watchlist')
    .select('id')
    .eq('profile_id', profile_id)
    .eq('tmdb_id', tmdb_id)
    .eq('type', type)
    .maybeSingle()

  if (existing) {
    // Remove from watchlist (toggle)
    await supabase.from('watchlist').delete().eq('id', existing.id)
    return NextResponse.json({ ok: true, added: false })
  }

  // Add to watchlist
  const { error } = await supabase.from('watchlist').insert({ profile_id, tmdb_id, type })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, added: true })
}
