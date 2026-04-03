export const dynamic = 'force-dynamic'

import { ContentRow } from '@/components/content-row'
import { createClient } from '@/lib/supabase/server'

async function getShowsSections() {
  const supabase = await createClient()

  async function getSection(opts: { platform?: string; genre?: string }, limit = 20) {
    let query = supabase.from('content').select('tmdb_id, type, title, poster_path, rating, year')
      .eq('type', 'tv').not('title', 'is', null).order('rating', { ascending: false }).limit(limit)
    if (opts.platform) query = query.eq('platform', opts.platform)
    if (opts.genre) query = query.contains('genres', [opts.genre])
    const { data } = await query
    return data || []
  }

  const [top, netflix, prime, drama, action, scifi] = await Promise.all([
    getSection({}),
    getSection({ platform: 'netflix' }),
    getSection({ platform: 'prime_video' }),
    getSection({ genre: 'Drama' }),
    getSection({ genre: 'Action' }),
    getSection({ genre: 'Science Fiction' }),
  ])

  return [
    { title: 'Top Rated Shows', items: top },
    { title: 'Netflix Shows', items: netflix },
    { title: 'Prime Video Shows', items: prime },
    { title: 'Drama', items: drama },
    { title: 'Action', items: action },
    { title: 'Sci-Fi', items: scifi },
  ].filter(s => s.items.length > 0)
}

export default async function ShowsPage() {
  const sections = await getShowsSections()
  return (
    <div className="min-h-screen bg-black pt-4">
      <h1 className="text-xl font-bold text-white px-4 mb-4">Web Shows</h1>
      {sections.map(s => <ContentRow key={s.title} title={s.title} items={s.items} />)}
    </div>
  )
}
