import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Watchlist routes — keyed on `content_id` (uuid). The legacy `tmdb_id`/`type`
 * body shape is accepted on writes for back-compat with older clients;
 * we resolve it to a `content_id` via the `content` table before writing.
 */

async function resolveContentId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  body: { content_id?: string; tmdb_id?: string | number; type?: string }
): Promise<string | null> {
  if (body.content_id) return body.content_id
  if (body.tmdb_id != null) {
    const tmdbNum = typeof body.tmdb_id === 'number' ? body.tmdb_id : Number(body.tmdb_id)
    if (Number.isFinite(tmdbNum)) {
      const { data } = await supabase
        .from('content')
        .select('id')
        .eq('tmdb_id', tmdbNum)
        .maybeSingle()
      return (data as { id: string } | null)?.id ?? null
    }
  }
  return null
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profileId = request.nextUrl.searchParams.get('profile_id')
  if (!profileId) return NextResponse.json({ error: 'Missing profile_id' }, { status: 400 })

  const { data } = await supabase
    .from('watchlist')
    .select('content_id, added_at')
    .eq('profile_id', profileId)
    .order('added_at', { ascending: false })

  return NextResponse.json({ items: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const profileId = body.profile_id
  if (!profileId) return NextResponse.json({ error: 'Missing profile_id' }, { status: 400 })

  const contentId = await resolveContentId(supabase, body)
  if (!contentId) return NextResponse.json({ error: 'Missing content_id / tmdb_id' }, { status: 400 })

  const { data: existing } = await supabase
    .from('watchlist')
    .select('id')
    .eq('profile_id', profileId)
    .eq('content_id', contentId)
    .maybeSingle()

  if (existing) {
    await supabase.from('watchlist').delete().eq('id', (existing as { id: string }).id)
    return NextResponse.json({ ok: true, added: false })
  }

  const { error } = await supabase
    .from('watchlist')
    .insert({ profile_id: profileId, content_id: contentId })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, added: true })
}
