import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { contentById, seasonsFor } from '@/lib/content-adapter'

/**
 * Single-content detail endpoint. Accepts either a uuid or a numeric
 * legacy tmdb_id via the `[id]` segment. Returns everything the detail
 * page needs — adapted content + season headers (for series).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const content = await contentById(supabase, id)
  if (!content) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const seasons = content.type === 'tv' ? await seasonsFor(supabase, content.tmdb_id) : []
  return NextResponse.json({ content, seasons })
}
