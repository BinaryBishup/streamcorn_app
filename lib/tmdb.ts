const TMDB_API_KEY = '5c242b6eeca95f02957505a67a488635'
const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p'

export const imageUrl = (path: string | null, size: 'w200' | 'w300' | 'w400' | 'w500' | 'w780' | 'w1280' | 'original' = 'w500') => {
  if (!path) return '/placeholder.jpg'
  return `${TMDB_IMAGE_BASE}/${size}${path}`
}

export const backdropUrl = (path: string | null) => {
  if (!path) return '/placeholder-backdrop.jpg'
  return `${TMDB_IMAGE_BASE}/original${path}`
}

async function fetchTMDB<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${TMDB_BASE_URL}${endpoint}`)
  url.searchParams.set('api_key', TMDB_API_KEY)
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))

  try {
    const res = await fetch(url.toString(), {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(10000)
    })
    if (!res.ok) throw new Error(`TMDB API error: ${res.status}`)
    return res.json()
  } catch (error) {
    console.error(`TMDB fetch error for ${endpoint}:`, error)
    // Return empty result for list endpoints
    return { results: [], page: 1, total_pages: 0, total_results: 0 } as T
  }
}

// Types
export interface TMDBMovie {
  id: number
  title: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  release_date: string
  vote_average: number
  vote_count: number
  genre_ids: number[]
  adult: boolean
  popularity: number
  original_language: string
  video: boolean
}

export interface TMDBTVShow {
  id: number
  name: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  first_air_date: string
  vote_average: number
  vote_count: number
  genre_ids: number[]
  popularity: number
  origin_country: string[]
  original_language: string
}

export interface TMDBMovieDetails extends Omit<TMDBMovie, 'genre_ids'> {
  runtime: number
  genres: { id: number; name: string }[]
  tagline: string
  status: string
  budget: number
  revenue: number
  production_companies: { id: number; name: string; logo_path: string | null }[]
  credits?: {
    cast: TMDBCast[]
    crew: TMDBCrew[]
  }
  videos?: {
    results: TMDBVideo[]
  }
  similar?: {
    results: TMDBMovie[]
  }
  images?: {
    logos: { file_path: string; iso_639_1: string }[]
  }
}

export interface TMDBTVDetails extends Omit<TMDBTVShow, 'genre_ids'> {
  number_of_seasons: number
  number_of_episodes: number
  episode_run_time: number[]
  genres: { id: number; name: string }[]
  tagline: string
  status: string
  created_by: { id: number; name: string }[]
  seasons: TMDBSeason[]
  credits?: {
    cast: TMDBCast[]
    crew: TMDBCrew[]
  }
  videos?: {
    results: TMDBVideo[]
  }
  similar?: {
    results: TMDBTVShow[]
  }
  images?: {
    logos: { file_path: string; iso_639_1: string }[]
  }
}

export interface TMDBSeason {
  id: number
  name: string
  overview: string
  poster_path: string | null
  season_number: number
  episode_count: number
  air_date: string
}

export interface TMDBEpisode {
  id: number
  name: string
  overview: string
  still_path: string | null
  episode_number: number
  season_number: number
  air_date: string
  runtime: number
  vote_average: number
}

export interface TMDBCast {
  id: number
  name: string
  character: string
  profile_path: string | null
  order: number
}

export interface TMDBCrew {
  id: number
  name: string
  job: string
  department: string
}

export interface TMDBVideo {
  id: string
  key: string
  name: string
  site: string
  type: string
  official: boolean
}

interface TMDBResponse<T> {
  page: number
  results: T[]
  total_pages: number
  total_results: number
}

// Movie endpoints
export async function getTrendingMovies() {
  return fetchTMDB<TMDBResponse<TMDBMovie>>('/trending/movie/week')
}

export async function getPopularMovies() {
  return fetchTMDB<TMDBResponse<TMDBMovie>>('/movie/popular')
}

export async function getTopRatedMovies() {
  return fetchTMDB<TMDBResponse<TMDBMovie>>('/movie/top_rated')
}

export async function getNowPlayingMovies() {
  return fetchTMDB<TMDBResponse<TMDBMovie>>('/movie/now_playing')
}

export async function getUpcomingMovies() {
  return fetchTMDB<TMDBResponse<TMDBMovie>>('/movie/upcoming')
}

export async function getMovieDetails(id: number) {
  return fetchTMDB<TMDBMovieDetails>(`/movie/${id}`, {
    append_to_response: 'credits,videos,similar,images',
    include_image_language: 'en,null'
  })
}

export async function getMoviesByGenre(genreId: number) {
  return fetchTMDB<TMDBResponse<TMDBMovie>>('/discover/movie', {
    with_genres: genreId.toString(),
    sort_by: 'popularity.desc'
  })
}

// TV endpoints
export async function getTrendingTV() {
  return fetchTMDB<TMDBResponse<TMDBTVShow>>('/trending/tv/week')
}

export async function getPopularTV() {
  return fetchTMDB<TMDBResponse<TMDBTVShow>>('/tv/popular')
}

export async function getTopRatedTV() {
  return fetchTMDB<TMDBResponse<TMDBTVShow>>('/tv/top_rated')
}

export async function getOnTheAirTV() {
  return fetchTMDB<TMDBResponse<TMDBTVShow>>('/tv/on_the_air')
}

export async function getTVDetails(id: number) {
  return fetchTMDB<TMDBTVDetails>(`/tv/${id}`, {
    append_to_response: 'credits,videos,similar,images',
    include_image_language: 'en,null'
  })
}

export async function getTVSeasonDetails(tvId: number, seasonNumber: number) {
  return fetchTMDB<{ episodes: TMDBEpisode[] }>(`/tv/${tvId}/season/${seasonNumber}`)
}

export async function getTVByGenre(genreId: number) {
  return fetchTMDB<TMDBResponse<TMDBTVShow>>('/discover/tv', {
    with_genres: genreId.toString(),
    sort_by: 'popularity.desc'
  })
}

// Video/Trailer endpoints
export async function getMovieVideos(id: number) {
  return fetchTMDB<{ results: TMDBVideo[] }>(`/movie/${id}/videos`)
}

export async function getTVVideos(id: number) {
  return fetchTMDB<{ results: TMDBVideo[] }>(`/tv/${id}/videos`)
}

// Combined/Mixed endpoints
export async function getTrendingAll() {
  return fetchTMDB<TMDBResponse<TMDBMovie | TMDBTVShow>>('/trending/all/week')
}

export async function searchMulti(query: string) {
  return fetchTMDB<TMDBResponse<TMDBMovie | TMDBTVShow>>('/search/multi', { query })
}

// Genre IDs for reference
export const MOVIE_GENRES = {
  ACTION: 28,
  ADVENTURE: 12,
  ANIMATION: 16,
  COMEDY: 35,
  CRIME: 80,
  DOCUMENTARY: 99,
  DRAMA: 18,
  FAMILY: 10751,
  FANTASY: 14,
  HISTORY: 36,
  HORROR: 27,
  MUSIC: 10402,
  MYSTERY: 9648,
  ROMANCE: 10749,
  SCIENCE_FICTION: 878,
  THRILLER: 53,
  WAR: 10752,
  WESTERN: 37,
}

export const TV_GENRES = {
  ACTION_ADVENTURE: 10759,
  ANIMATION: 16,
  COMEDY: 35,
  CRIME: 80,
  DOCUMENTARY: 99,
  DRAMA: 18,
  FAMILY: 10751,
  KIDS: 10762,
  MYSTERY: 9648,
  NEWS: 10763,
  REALITY: 10764,
  SCIFI_FANTASY: 10765,
  SOAP: 10766,
  TALK: 10767,
  WAR_POLITICS: 10768,
  WESTERN: 37,
}

// Helper to get rating string
export function getRating(voteAverage: number): string {
  const rating = Math.round(voteAverage * 10)
  return `${rating}%`
}

// Helper to check if item is movie or TV
export function isMovie(item: TMDBMovie | TMDBTVShow): item is TMDBMovie {
  return 'title' in item
}

// Get content rating (simplified)
export function getContentRating(adult: boolean): string {
  return adult ? 'A' : 'U/A 13+'
}
