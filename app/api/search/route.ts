import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')
  if (!query?.trim()) {
    return NextResponse.json({ results: [] })
  }

  const supabase = await createClient()
  const searchLower = query.toLowerCase()

  // Search by title (ilike) and tags, using cached columns
  const { data: content, error } = await supabase
    .from('content')
    .select('tmdb_id, type, title, poster_path, backdrop_path, rating, year, overview, genres')
    .not('title', 'is', null)
    .or(`title.ilike.%${searchLower}%,tags.cs.{${searchLower}}`)
    .order('rating', { ascending: false })
    .limit(30)

  if (error || !content || content.length === 0) {
    return NextResponse.json({ results: [] })
  }

  const results = content.map((item: any) => ({
    id: item.tmdb_id,
    type: item.type,
    title: item.title,
    posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '',
    backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : '',
    rating: item.rating || 0,
    year: item.year ? String(item.year) : '',
    overview: item.overview || '',
    genres: [],
  }))

  return NextResponse.json({ results })
}
