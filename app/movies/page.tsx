export const dynamic = 'force-dynamic'

import { ContentRow } from '@/components/content-row'
import { createClient } from '@/lib/supabase/server'
import { sectionFeed } from '@/lib/content-adapter'

async function getMoviesSections() {
  const supabase = await createClient()
  const [top, action, comedy, scifi, horror, drama, thriller] = await Promise.all([
    sectionFeed(supabase, { type: 'movie', limit: 20 }),
    sectionFeed(supabase, { type: 'movie', category: 'Action' }),
    sectionFeed(supabase, { type: 'movie', category: 'Comedy' }),
    sectionFeed(supabase, { type: 'movie', category: 'Science Fiction' }),
    sectionFeed(supabase, { type: 'movie', category: 'Horror' }),
    sectionFeed(supabase, { type: 'movie', category: 'Drama' }),
    sectionFeed(supabase, { type: 'movie', category: 'Thriller' }),
  ])
  return [
    { title: 'New Movies', items: top },
    { title: 'Action', items: action },
    { title: 'Comedy', items: comedy },
    { title: 'Sci-Fi', items: scifi },
    { title: 'Horror', items: horror },
    { title: 'Drama', items: drama },
    { title: 'Thriller', items: thriller },
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
