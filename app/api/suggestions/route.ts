import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const TMDB_IMG = 'https://image.tmdb.org/t/p'

export async function GET() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .rpc('get_random_content', { num: 18 })

  if (error || !data) {
    return NextResponse.json({ suggestions: [] })
  }

  const tmdbIds = data.map((d: { tmdb_id: number }) => d.tmdb_id)

  const { data: items } = await supabase
    .from('content')
    .select('tmdb_id, type, title, poster_path, backdrop_path, rating, year')
    .in('tmdb_id', tmdbIds)
    .not('title', 'is', null)

  const suggestions = (items || []).map((item: any) => ({
    id: item.tmdb_id,
    type: item.type,
    title: item.title,
    posterPath: item.poster_path ? `${TMDB_IMG}/w500${item.poster_path}` : '',
    backdropPath: item.backdrop_path ? `${TMDB_IMG}/w1280${item.backdrop_path}` : '',
    rating: item.rating,
    year: item.year ? String(item.year) : '',
    overview: '',
  }))

  return NextResponse.json({ suggestions })
}
