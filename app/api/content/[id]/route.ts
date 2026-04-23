import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { contentById, relatedFor, seasonsFor } from '@/lib/content-adapter'

/**
 * Single-content detail endpoint. Accepts either a uuid or a numeric
 * legacy tmdb_id via the `[id]` segment. Returns everything the detail
 * page needs — adapted content, season headers (for series), and a
 * "More like this" rail sharing the title's primary category.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const content = await contentById(supabase, id)
  if (!content) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const [seasons, related] = await Promise.all([
    content.type === 'tv' ? seasonsFor(supabase, content.tmdb_id) : Promise.resolve([]),
    relatedFor(supabase, content),
  ])
  return NextResponse.json({ content, seasons, related })
}
