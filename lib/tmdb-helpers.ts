import {
  TMDBMovie,
  TMDBTVShow,
  TMDBMovieDetails,
  TMDBTVDetails,
  imageUrl,
  backdropUrl,
  isMovie,
} from './tmdb'

export interface NormalizedMedia {
  id: number
  title: string
  overview: string
  posterPath: string
  backdropPath: string
  year: string
  rating: number
  type: 'movie' | 'tv'
  genres: number[]
  logoPath?: string
}

export interface NormalizedMediaDetails extends NormalizedMedia {
  runtime?: number
  seasons?: number
  episodes?: number
  tagline?: string
  cast: { name: string; character: string; photo: string }[]
  director?: string
  creators?: string[]
  genreNames: string[]
  trailerKey?: string
  similar: NormalizedMedia[]
}

export function normalizeMedia(item: TMDBMovie | TMDBTVShow): NormalizedMedia {
  if (isMovie(item)) {
    return {
      id: item.id,
      title: item.title,
      overview: item.overview,
      posterPath: imageUrl(item.poster_path, 'w500'),
      backdropPath: backdropUrl(item.backdrop_path),
      year: item.release_date?.split('-')[0] || '',
      rating: item.vote_average,
      type: 'movie',
      genres: item.genre_ids,
    }
  }
  return {
    id: item.id,
    title: item.name,
    overview: item.overview,
    posterPath: imageUrl(item.poster_path, 'w500'),
    backdropPath: backdropUrl(item.backdrop_path),
    year: item.first_air_date?.split('-')[0] || '',
    rating: item.vote_average,
    type: 'tv',
    genres: item.genre_ids,
  }
}

export function normalizeMovieDetails(movie: TMDBMovieDetails): NormalizedMediaDetails {
  const trailer = movie.videos?.results.find(
    v => v.type === 'Trailer' && v.site === 'YouTube'
  )
  const logo = movie.images?.logos?.find(l => l.iso_639_1 === 'en') || movie.images?.logos?.[0]
  const director = movie.credits?.crew.find(c => c.job === 'Director')

  return {
    id: movie.id,
    title: movie.title,
    overview: movie.overview,
    posterPath: imageUrl(movie.poster_path, 'w500'),
    backdropPath: backdropUrl(movie.backdrop_path),
    year: movie.release_date?.split('-')[0] || '',
    rating: movie.vote_average,
    type: 'movie',
    genres: movie.genres.map(g => g.id),
    genreNames: movie.genres.map(g => g.name),
    runtime: movie.runtime,
    tagline: movie.tagline,
    cast: movie.credits?.cast.slice(0, 10).map(c => ({
      name: c.name,
      character: c.character,
      photo: imageUrl(c.profile_path, 'w200'),
    })) || [],
    director: director?.name,
    trailerKey: trailer?.key,
    logoPath: logo ? imageUrl(logo.file_path, 'w500') : undefined,
    similar: movie.similar?.results.slice(0, 6).map(normalizeMedia) || [],
  }
}

export function normalizeTVDetails(tv: TMDBTVDetails): NormalizedMediaDetails {
  const trailer = tv.videos?.results.find(
    v => (v.type === 'Trailer' || v.type === 'Teaser') && v.site === 'YouTube'
  )
  const logo = tv.images?.logos?.find(l => l.iso_639_1 === 'en') || tv.images?.logos?.[0]

  return {
    id: tv.id,
    title: tv.name,
    overview: tv.overview,
    posterPath: imageUrl(tv.poster_path, 'w500'),
    backdropPath: backdropUrl(tv.backdrop_path),
    year: tv.first_air_date?.split('-')[0] || '',
    rating: tv.vote_average,
    type: 'tv',
    genres: tv.genres.map(g => g.id),
    genreNames: tv.genres.map(g => g.name),
    seasons: tv.number_of_seasons,
    episodes: tv.number_of_episodes,
    runtime: tv.episode_run_time?.[0],
    tagline: tv.tagline,
    cast: tv.credits?.cast.slice(0, 10).map(c => ({
      name: c.name,
      character: c.character,
      photo: imageUrl(c.profile_path, 'w200'),
    })) || [],
    creators: tv.created_by?.map(c => c.name),
    trailerKey: trailer?.key,
    logoPath: logo ? imageUrl(logo.file_path, 'w500') : undefined,
    similar: tv.similar?.results.slice(0, 6).map(m => normalizeMedia(m as TMDBTVShow)) || [],
  }
}

export function formatRuntime(minutes?: number): string {
  if (!minutes) return ''
  const hrs = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hrs === 0) return `${mins}m`
  if (mins === 0) return `${hrs}h`
  return `${hrs}h ${mins}m`
}

export function getMatchPercentage(rating: number): number {
  // Convert 0-10 rating to match percentage (typically 80-99%)
  return Math.min(99, Math.max(80, Math.round(rating * 10)))
}
