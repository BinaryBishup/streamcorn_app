export const dynamic = 'force-dynamic'

import { HomeContent } from '@/components/home-content'
import { createClient } from '@/lib/supabase/server'
import { heroFeed, sectionFeed, type AdaptedContent } from '@/lib/content-adapter'

async function getHomeData() {
  const supabase = await createClient()

  const hero = await heroFeed(supabase, 5)

  // Category sections — pulled from the live `content.categories[]` column.
  // Keeping the row labels close to what the UI used before, but sourced
  // from whatever tags actually exist in the DB now.
  const [allRecent, action, drama, comedy, scifi, thriller, romance] = await Promise.all([
    sectionFeed(supabase, { limit: 20 }),
    sectionFeed(supabase, { category: 'Action' }),
    sectionFeed(supabase, { category: 'Drama' }),
    sectionFeed(supabase, { category: 'Comedy' }),
    sectionFeed(supabase, { category: 'Science Fiction' }),
    sectionFeed(supabase, { category: 'Thriller' }),
    sectionFeed(supabase, { category: 'Romance' }),
  ])

  const [mRecent, mAction, mComedy, mScifi, mHorror, mDrama] = await Promise.all([
    sectionFeed(supabase, { type: 'movie', limit: 20 }),
    sectionFeed(supabase, { type: 'movie', category: 'Action' }),
    sectionFeed(supabase, { type: 'movie', category: 'Comedy' }),
    sectionFeed(supabase, { type: 'movie', category: 'Science Fiction' }),
    sectionFeed(supabase, { type: 'movie', category: 'Horror' }),
    sectionFeed(supabase, { type: 'movie', category: 'Drama' }),
  ])

  const [tRecent, tAction, tDrama, tScifi, tAnime] = await Promise.all([
    sectionFeed(supabase, { type: 'tv', limit: 20 }),
    sectionFeed(supabase, { type: 'tv', category: 'Action' }),
    sectionFeed(supabase, { type: 'tv', category: 'Drama' }),
    sectionFeed(supabase, { type: 'tv', category: 'Science Fiction' }),
    sectionFeed(supabase, { type: 'anime', limit: 20 }),
  ])

  const build = (arr: [string, AdaptedContent[]][]) =>
    arr.filter(([, items]) => items.length > 0).map(([title, items]) => ({ title, items }))

  // Sports events stay on the existing table — schema unchanged.
  const { data: sports } = await supabase
    .from('sports_events')
    .select('*')
    .eq('is_featured', true)
    .order('match_date', { ascending: true })
    .limit(10)

  return {
    hero,
    sports: sports || [],
    allSections: build([
      ['New & Popular', allRecent],
      ['Action & Adventure', action],
      ['Award-Winning Dramas', drama],
      ['Laugh Out Loud', comedy],
      ['Sci-Fi & Fantasy', scifi],
      ['Edge of Your Seat', thriller],
      ['Romance', romance],
    ]),
    movieSections: build([
      ['New Movies', mRecent],
      ['Action', mAction],
      ['Comedy', mComedy],
      ['Sci-Fi', mScifi],
      ['Horror', mHorror],
      ['Drama', mDrama],
    ]),
    showSections: build([
      ['New Shows', tRecent],
      ['Drama', tDrama],
      ['Action', tAction],
      ['Sci-Fi', tScifi],
      ['Anime', tAnime],
    ]),
  }
}

export default async function HomePage() {
  const data = await getHomeData()
  return (
    <HomeContent
      hero={data.hero}
      sports={data.sports}
      allSections={data.allSections}
      movieSections={data.movieSections}
      showSections={data.showSections}
    />
  )
}
