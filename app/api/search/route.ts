import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchContent } from '@/lib/content-adapter'

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') || '').trim()
  if (!q) return NextResponse.json({ results: [] })
  const supabase = await createClient()
  const hits = await searchContent(supabase, q, 40)
  const results = hits.map((c) => ({
    id: c.tmdb_id,
    type: c.type,
    title: c.title,
    posterPath: c.poster_path ?? '',
    rating: 0,
    year: c.year ? String(c.year) : '',
  }))
  return NextResponse.json({ results })
}
