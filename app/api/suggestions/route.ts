import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sectionFeed } from '@/lib/content-adapter'

export async function GET() {
  const supabase = await createClient()
  const items = await sectionFeed(supabase, { limit: 12 })
  const suggestions = items.map((c) => ({
    id: c.tmdb_id,
    type: c.type,
    title: c.title,
    posterPath: c.poster_path ?? '',
    rating: 0,
    year: c.year ? String(c.year) : '',
  }))
  return NextResponse.json({ suggestions })
}
