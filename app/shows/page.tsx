export const dynamic = 'force-dynamic'

import { ContentRow } from '@/components/content-row'
import { createClient } from '@/lib/supabase/server'
import { sectionFeed } from '@/lib/content-adapter'

async function getShowsSections() {
  const supabase = await createClient()
  const [top, drama, action, scifi, comedy, thriller, anime] = await Promise.all([
    sectionFeed(supabase, { type: 'tv', limit: 20 }),
    sectionFeed(supabase, { type: 'tv', category: 'Drama' }),
    sectionFeed(supabase, { type: 'tv', category: 'Action' }),
    sectionFeed(supabase, { type: 'tv', category: 'Science Fiction' }),
    sectionFeed(supabase, { type: 'tv', category: 'Comedy' }),
    sectionFeed(supabase, { type: 'tv', category: 'Thriller' }),
    sectionFeed(supabase, { type: 'anime', limit: 20 }),
  ])
  return [
    { title: 'New Shows', items: top },
    { title: 'Drama', items: drama },
    { title: 'Action', items: action },
    { title: 'Sci-Fi', items: scifi },
    { title: 'Comedy', items: comedy },
    { title: 'Thriller', items: thriller },
    { title: 'Anime', items: anime },
  ].filter(s => s.items.length > 0)
}

export default async function ShowsPage() {
  const sections = await getShowsSections()
  return (
    <div className="min-h-screen bg-black pt-4">
      <h1 className="text-xl font-bold text-white px-4 mb-4">TV Shows</h1>
      {sections.map(s => <ContentRow key={s.title} title={s.title} items={s.items} />)}
    </div>
  )
}
