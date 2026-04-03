import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '42')
  const type = searchParams.get('type') // 'movie' | 'tv' | null for all
  const genre = searchParams.get('genre')
  const platform = searchParams.get('platform')

  const offset = (page - 1) * limit
  const supabase = await createClient()

  let query = supabase
    .from('content')
    .select('tmdb_id, type, title, poster_path, backdrop_path, rating, year, genres, platform', { count: 'exact' })
    .not('title', 'is', null) // only cached items

  if (type === 'movie' || type === 'tv') {
    query = query.eq('type', type)
  }
  if (genre) {
    query = query.contains('genres', [genre])
  }
  if (platform) {
    query = query.eq('platform', platform)
  }

  const { data, count, error } = await query
    .order('rating', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    items: data || [],
    total: count || 0,
    page,
    totalPages: Math.ceil((count || 0) / limit),
  })
}
