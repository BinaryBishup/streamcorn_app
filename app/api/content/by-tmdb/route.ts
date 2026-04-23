import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Batch lookup: given a list of TMDB ids, return which of them already
 * exist in our catalogue. Used by the Request page to show an
 * "In catalogue" chip that deep-links into the detail page instead of
 * offering a redundant Request button.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('ids')
  if (!raw) return NextResponse.json({ items: [] })

  const ids = raw
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n))

  if (ids.length === 0) return NextResponse.json({ items: [] })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('content')
    .select('id, tmdb_id, type')
    .in('tmdb_id', ids)
    .eq('is_hidden', false)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const items = (data ?? []).map((r) => {
    const row = r as { id: string; tmdb_id: number | null; type: 'movie' | 'show' | 'anime' }
    return {
      tmdb_id: row.tmdb_id,
      content_id: row.id,
      client_type: row.type === 'movie' ? 'movie' : 'tv',
    }
  })
  return NextResponse.json({ items })
}
