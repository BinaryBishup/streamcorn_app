import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { AdaptedContent } from '@/lib/content-adapter'

/**
 * Browse listing — filters are applied against the live catalogue shape:
 *   ?type=movie|tv  (maps to DB 'movie' or in ('show','anime'))
 *   ?genre=<Category>  — matches `content.categories[]`
 *   ?tag=<SearchTag>   — matches `content.search_tags[]`
 *   ?page=1&limit=30   — paginated window
 */
const PAGE_SIZE_MAX = 100

const ROW_COLUMNS =
  'id,name,type,poster_image,backdrop_image,logo_image,categories,search_tags,release_year,description,language,duration_sec,hash_key,next_episode_timer_sec,tmdb_id,is_hidden,created_at'

type Row = {
  id: string
  name: string | null
  type: 'movie' | 'show' | 'anime'
  poster_image: string | null
  backdrop_image: string | null
  logo_image: string | null
  categories: string[] | null
  search_tags: string[] | null
  release_year: number | null
  description: string | null
  language: string | null
  duration_sec: number | null
  hash_key: string | null
  next_episode_timer_sec: number | null
  tmdb_id: number | null
  created_at: string
}

function shape(row: Row): AdaptedContent & { genres: string[]; platform: string | null } {
  const clientType = row.type === 'movie' ? 'movie' : 'tv'
  return {
    tmdb_id: row.id,
    real_tmdb_id: row.tmdb_id,
    type: clientType,
    db_type: row.type,
    title: row.name ?? '',
    poster_path: row.poster_image,
    backdrop_path: row.backdrop_image,
    logo_path: row.logo_image,
    rating: 0,
    year: row.release_year,
    overview: row.description,
    categories: row.categories ?? [],
    genres: row.categories ?? [],
    platform: null,
    language: row.language,
    duration_sec: row.duration_sec,
    hash_key: row.hash_key,
    next_episode_timer_sec: row.next_episode_timer_sec ?? 10,
  }
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10))
  const limit = Math.min(PAGE_SIZE_MAX, Math.max(1, parseInt(sp.get('limit') || '30', 10)))
  const type = sp.get('type')
  const genre = sp.get('genre')
  const tag = sp.get('tag')
  const from = (page - 1) * limit
  const to = from + limit - 1

  const supabase = await createClient()
  let q = supabase
    .from('content')
    .select(ROW_COLUMNS, { count: 'exact' })
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (type === 'movie') q = q.eq('type', 'movie')
  else if (type === 'tv') q = q.in('type', ['show', 'anime'])
  if (genre) q = q.contains('categories', [genre])
  if (tag) q = q.contains('search_tags', [tag])

  const { data, error, count } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const items = ((data as Row[] | null) ?? []).map(shape)
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / limit))
  return NextResponse.json({ items, total, totalPages, page, limit })
}
