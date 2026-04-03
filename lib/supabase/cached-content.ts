import { createClient } from './server'
import { NormalizedMedia } from '@/lib/tmdb-helpers'

interface CachedContentRow {
  tmdb_id: number
  type: 'movie' | 'tv'
  title: string | null
  poster_path: string | null
  backdrop_path: string | null
  rating: number | null
  year: number | null
  overview: string | null
  genres: string[] | null
  platform: string | null
  is_featured: boolean | null
}

const TMDB_IMG = 'https://image.tmdb.org/t/p'

function toNormalizedMedia(row: CachedContentRow): NormalizedMedia {
  return {
    id: row.tmdb_id,
    type: row.type,
    title: row.title || '',
    posterPath: row.poster_path ? `${TMDB_IMG}/w500${row.poster_path}` : '',
    backdropPath: row.backdrop_path ? `${TMDB_IMG}/w1280${row.backdrop_path}` : '',
    rating: row.rating || 0,
    year: row.year ? String(row.year) : '',
    overview: row.overview || '',
    genres: [],
  }
}

// Get content by platform, sorted by rating
export async function getContentByPlatform(platform: string, options?: { type?: 'movie' | 'tv'; limit?: number }): Promise<NormalizedMedia[]> {
  const supabase = await createClient()
  let query = supabase
    .from('content')
    .select('tmdb_id, type, title, poster_path, backdrop_path, rating, year, overview, genres, platform, is_featured')
    .eq('platform', platform)
    .not('title', 'is', null)
    .order('rating', { ascending: false })

  if (options?.type) query = query.eq('type', options.type)
  query = query.limit(options?.limit || 20)

  const { data } = await query
  return (data || []).map(toNormalizedMedia)
}

// Get top rated content
export async function getTopRated(options?: { type?: 'movie' | 'tv'; limit?: number }): Promise<NormalizedMedia[]> {
  const supabase = await createClient()
  let query = supabase
    .from('content')
    .select('tmdb_id, type, title, poster_path, backdrop_path, rating, year, overview, genres, platform, is_featured')
    .not('title', 'is', null)
    .order('rating', { ascending: false })

  if (options?.type) query = query.eq('type', options.type)
  query = query.limit(options?.limit || 20)

  const { data } = await query
  return (data || []).map(toNormalizedMedia)
}

// Get recent content by year
export async function getRecentContent(options?: { type?: 'movie' | 'tv'; limit?: number }): Promise<NormalizedMedia[]> {
  const supabase = await createClient()
  let query = supabase
    .from('content')
    .select('tmdb_id, type, title, poster_path, backdrop_path, rating, year, overview, genres, platform, is_featured')
    .not('title', 'is', null)
    .order('year', { ascending: false })
    .order('rating', { ascending: false })

  if (options?.type) query = query.eq('type', options.type)
  query = query.limit(options?.limit || 20)

  const { data } = await query
  return (data || []).map(toNormalizedMedia)
}

// Get content by genre
export async function getContentByGenre(genre: string, options?: { type?: 'movie' | 'tv'; limit?: number }): Promise<NormalizedMedia[]> {
  const supabase = await createClient()
  let query = supabase
    .from('content')
    .select('tmdb_id, type, title, poster_path, backdrop_path, rating, year, overview, genres, platform, is_featured')
    .contains('genres', [genre])
    .not('title', 'is', null)
    .order('rating', { ascending: false })

  if (options?.type) query = query.eq('type', options.type)
  query = query.limit(options?.limit || 20)

  const { data } = await query
  return (data || []).map(toNormalizedMedia)
}

// Get featured content
export async function getCachedFeatured(): Promise<NormalizedMedia | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('content')
    .select('tmdb_id, type, title, poster_path, backdrop_path, rating, year, overview, genres, platform, is_featured')
    .eq('is_featured', true)
    .not('title', 'is', null)
    .order('rating', { ascending: false })
    .limit(1)

  if (!data || data.length === 0) return null
  return toNormalizedMedia(data[0])
}

// Get random content for hero carousel
export async function getHeroItems(limit: number = 5): Promise<NormalizedMedia[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('content')
    .select('tmdb_id, type, title, poster_path, backdrop_path, rating, year, overview, genres, platform, is_featured')
    .not('title', 'is', null)
    .not('backdrop_path', 'is', null)
    .gte('rating', 7)
    .order('rating', { ascending: false })
    .limit(limit)

  return (data || []).map(toNormalizedMedia)
}

// Build all sections for a page
export async function buildBrowseSections(type?: 'movie' | 'tv') {
  const [
    featured,
    heroItems,
    topRated,
    recent,
    netflix,
    prime,
    appletv,
    hulu,
    crunchyroll,
    actionItems,
    comedyItems,
    dramaItems,
    sciFiItems,
    thrillerItems,
  ] = await Promise.all([
    getCachedFeatured(),
    getHeroItems(8),
    getTopRated({ type, limit: 20 }),
    getRecentContent({ type, limit: 20 }),
    getContentByPlatform('netflix', { type, limit: 20 }),
    getContentByPlatform('prime_video', { type, limit: 20 }),
    getContentByPlatform('appletv', { type, limit: 20 }),
    getContentByPlatform('hulu', { type, limit: 20 }),
    getContentByPlatform('crunchyroll', { type, limit: 20 }),
    getContentByGenre('Action', { type, limit: 20 }),
    getContentByGenre('Comedy', { type, limit: 20 }),
    getContentByGenre('Drama', { type, limit: 20 }),
    getContentByGenre('Science Fiction', { type, limit: 20 }),
    getContentByGenre('Thriller', { type, limit: 20 }),
  ])

  const sections = [
    { id: 'top-rated', name: 'Top Rated', items: topRated, isTopTen: true },
    { id: 'new-releases', name: 'New Releases', items: recent },
    { id: 'netflix', name: 'Popular on Netflix', items: netflix },
    { id: 'prime', name: 'Popular on Prime Video', items: prime },
    { id: 'appletv', name: 'Popular on Apple TV+', items: appletv },
    { id: 'hulu', name: 'Popular on Hulu', items: hulu },
    { id: 'crunchyroll', name: 'Popular on Crunchyroll', items: crunchyroll },
    { id: 'action', name: 'Action & Adventure', items: actionItems },
    { id: 'comedy', name: 'Laugh Out Loud', items: comedyItems },
    { id: 'drama', name: 'Award-Winning Dramas', items: dramaItems },
    { id: 'sci-fi', name: 'Sci-Fi & Fantasy', items: sciFiItems },
    { id: 'thriller', name: 'Edge of Your Seat', items: thrillerItems },
  ].filter(s => s.items.length > 0)

  return {
    featured: featured || heroItems[0] || null,
    heroItems,
    sections,
  }
}
