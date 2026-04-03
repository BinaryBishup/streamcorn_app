'use client'

import { HeroBanner } from './hero-banner'
import { ContentRow } from './content-row'
import { ContinueWatching } from './continue-watching'

interface ContentItem {
  tmdb_id: number; type: 'movie' | 'tv'; title: string; poster_path: string | null; rating: number; year: number | null
}

interface HeroItem extends ContentItem {
  backdrop_path: string | null; overview: string | null
}

interface HomeContentProps {
  hero: HeroItem[]
  sections: { title: string; items: ContentItem[] }[]
}

export function HomeContent({ hero, sections }: HomeContentProps) {
  // TODO: get profileId from auth context once login is implemented
  const profileId = typeof window !== 'undefined' ? localStorage.getItem('streamcorn_profile_id') : null

  return (
    <div className="min-h-screen bg-black">
      <HeroBanner items={hero} />
      <div className="mt-4">
        <ContinueWatching profileId={profileId || undefined} />
        {sections.map((section) => (
          <ContentRow key={section.title} title={section.title} items={section.items} />
        ))}
      </div>
    </div>
  )
}
