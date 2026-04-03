export const dynamic = 'force-dynamic'

import { HeroBanner } from '@/components/hero-banner'
import { ContentRow } from '@/components/content-row'
import { createClient } from '@/lib/supabase/server'

async function getHomeData() {
  const supabase = await createClient()

  const { data: hero } = await supabase
    .from('content')
    .select('tmdb_id, type, title, backdrop_path, rating, year, overview')
    .not('title', 'is', null)
    .not('backdrop_path', 'is', null)
    .gte('rating', 7.5)
    .order('rating', { ascending: false })
    .limit(5)

  async function getSection(opts: { type?: string; platform?: string; genre?: string }, limit = 20) {
    let query = supabase
      .from('content')
      .select('tmdb_id, type, title, poster_path, rating, year')
      .not('title', 'is', null)
      .order('rating', { ascending: false })
      .limit(limit)
    if (opts.type) query = query.eq('type', opts.type)
    if (opts.platform) query = query.eq('platform', opts.platform)
    if (opts.genre) query = query.contains('genres', [opts.genre])
    const { data } = await query
    return data || []
  }

  const [topRated, netflix, prime, action, comedy, scifi, thriller] = await Promise.all([
    getSection({}),
    getSection({ platform: 'netflix' }),
    getSection({ platform: 'prime_video' }),
    getSection({ genre: 'Action' }),
    getSection({ genre: 'Comedy' }),
    getSection({ genre: 'Science Fiction' }),
    getSection({ genre: 'Thriller' }),
  ])

  return {
    hero: hero || [],
    sections: [
      { title: 'Top Rated', items: topRated },
      { title: 'Popular on Netflix', items: netflix },
      { title: 'Popular on Prime Video', items: prime },
      { title: 'Action & Adventure', items: action },
      { title: 'Laugh Out Loud', items: comedy },
      { title: 'Sci-Fi & Fantasy', items: scifi },
      { title: 'Edge of Your Seat', items: thriller },
    ].filter(s => s.items.length > 0),
  }
}

export default async function HomePage() {
  const { hero, sections } = await getHomeData()

  return (
    <div className="min-h-screen bg-black">
      <HeroBanner items={hero} />

      {sections.map((section) => (
        <ContentRow key={section.title} title={section.title} items={section.items} />
      ))}
    </div>
  )
}
