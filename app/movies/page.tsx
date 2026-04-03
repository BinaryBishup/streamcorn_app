export const dynamic = 'force-dynamic'

import { ContentRow } from '@/components/content-row'
import { createClient } from '@/lib/supabase/server'

async function getMoviesSections() {
  const supabase = await createClient()

  async function getSection(opts: { platform?: string; genre?: string }, limit = 20) {
    let query = supabase.from('content').select('tmdb_id, type, title, poster_path, rating, year')
      .eq('type', 'movie').not('title', 'is', null).order('rating', { ascending: false }).limit(limit)
    if (opts.platform) query = query.eq('platform', opts.platform)
    if (opts.genre) query = query.contains('genres', [opts.genre])
    const { data } = await query
    return data || []
  }

  const [top, netflix, prime, action, comedy, scifi, horror] = await Promise.all([
    getSection({}),
    getSection({ platform: 'netflix' }),
    getSection({ platform: 'prime_video' }),
    getSection({ genre: 'Action' }),
    getSection({ genre: 'Comedy' }),
    getSection({ genre: 'Science Fiction' }),
    getSection({ genre: 'Horror' }),
  ])

  return [
    { title: 'Top Rated Movies', items: top },
    { title: 'Netflix Movies', items: netflix },
    { title: 'Prime Video Movies', items: prime },
    { title: 'Action', items: action },
    { title: 'Comedy', items: comedy },
    { title: 'Sci-Fi', items: scifi },
    { title: 'Horror', items: horror },
  ].filter(s => s.items.length > 0)
}

export default async function MoviesPage() {
  const sections = await getMoviesSections()
  return (
    <div className="min-h-screen bg-black pt-4">
      <h1 className="text-xl font-bold text-white px-4 mb-4">Movies</h1>
      {sections.map(s => <ContentRow key={s.title} title={s.title} items={s.items} />)}
    </div>
  )
}
