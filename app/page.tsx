export const dynamic = 'force-dynamic'

import { HomeContent } from '@/components/home-content'
import { createClient } from '@/lib/supabase/server'

async function getHomeData() {
  const supabase = await createClient()

  const { data: hero } = await supabase
    .from('content')
    .select('tmdb_id, type, title, poster_path, backdrop_path, rating, year, overview')
    .not('title', 'is', null).not('backdrop_path', 'is', null)
    .gte('rating', 7.5).order('rating', { ascending: false }).limit(5)

  async function getSection(opts: { type?: string; platform?: string; genre?: string }, limit = 20) {
    let q = supabase.from('content').select('tmdb_id, type, title, poster_path, rating, year')
      .not('title', 'is', null).order('rating', { ascending: false }).limit(limit)
    if (opts.type) q = q.eq('type', opts.type)
    if (opts.platform) q = q.eq('platform', opts.platform)
    if (opts.genre) q = q.contains('genres', [opts.genre])
    return (await q).data || []
  }

  // All content sections (same as web browse page)
  const [topRated, netflix, prime, appletv, crunchyroll, action, comedy, scifi, thriller, drama] = await Promise.all([
    getSection({}), getSection({ platform: 'netflix' }), getSection({ platform: 'prime_video' }),
    getSection({ platform: 'appletv' }), getSection({ platform: 'crunchyroll' }),
    getSection({ genre: 'Action' }), getSection({ genre: 'Comedy' }),
    getSection({ genre: 'Science Fiction' }), getSection({ genre: 'Thriller' }), getSection({ genre: 'Drama' }),
  ])

  // Movie-only sections
  const [mTop, mNetflix, mPrime, mAction, mComedy, mScifi, mHorror] = await Promise.all([
    getSection({ type: 'movie' }), getSection({ type: 'movie', platform: 'netflix' }),
    getSection({ type: 'movie', platform: 'prime_video' }), getSection({ type: 'movie', genre: 'Action' }),
    getSection({ type: 'movie', genre: 'Comedy' }), getSection({ type: 'movie', genre: 'Science Fiction' }),
    getSection({ type: 'movie', genre: 'Horror' }),
  ])

  // Show-only sections
  const [tTop, tNetflix, tPrime, tDrama, tAction, tScifi] = await Promise.all([
    getSection({ type: 'tv' }), getSection({ type: 'tv', platform: 'netflix' }),
    getSection({ type: 'tv', platform: 'prime_video' }), getSection({ type: 'tv', genre: 'Drama' }),
    getSection({ type: 'tv', genre: 'Action' }), getSection({ type: 'tv', genre: 'Science Fiction' }),
  ])

  const buildSections = (arr: [string, any[]][]) => arr.filter(([, items]) => items.length > 0).map(([title, items]) => ({ title, items }))

  // Sports events
  const { data: sports } = await supabase
    .from('sports_events')
    .select('*')
    .eq('is_featured', true)
    .order('match_date', { ascending: true })
    .limit(10)

  return {
    hero: hero || [],
    sports: sports || [],
    allSections: buildSections([
      ['Top Rated', topRated], ['Popular on Netflix', netflix], ['Popular on Prime Video', prime],
      ['Popular on Apple TV+', appletv], ['Popular on Crunchyroll', crunchyroll],
      ['Action & Adventure', action], ['Laugh Out Loud', comedy], ['Award-Winning Dramas', drama],
      ['Sci-Fi & Fantasy', scifi], ['Edge of Your Seat', thriller],
    ]),
    movieSections: buildSections([
      ['Top Rated Movies', mTop], ['Netflix Movies', mNetflix], ['Prime Video Movies', mPrime],
      ['Action', mAction], ['Comedy', mComedy], ['Sci-Fi', mScifi], ['Horror', mHorror],
    ]),
    showSections: buildSections([
      ['Top Rated Shows', tTop], ['Netflix Shows', tNetflix], ['Prime Video Shows', tPrime],
      ['Drama', tDrama], ['Action', tAction], ['Sci-Fi', tScifi],
    ]),
  }
}

export default async function HomePage() {
  const data = await getHomeData()
  return <HomeContent hero={data.hero} sports={data.sports} allSections={data.allSections} movieSections={data.movieSections} showSections={data.showSections} />
}
