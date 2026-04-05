import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('content_requests')
    .select('id, tmdb_id, type, title, poster_path, status, vote_count, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ requests: data || [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { tmdb_id, type, title, poster_path } = body
  if (!tmdb_id || !type || !title) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const { data: existing } = await supabase
    .from('content_requests')
    .select('id')
    .eq('tmdb_id', tmdb_id)
    .eq('type', type)
    .maybeSingle()

  if (existing) return NextResponse.json({ ok: true, message: 'Already requested' })

  const { error } = await supabase.from('content_requests').insert({
    user_id: user.id, tmdb_id, type, title, poster_path: poster_path || null, status: 'pending', vote_count: 1,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Only allow deleting own pending requests
  const { error } = await supabase
    .from('content_requests')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('status', 'pending')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
