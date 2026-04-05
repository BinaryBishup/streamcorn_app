'use client'

import { useState } from 'react'
import { HeroBanner } from './hero-banner'
import { ContentRow } from './content-row'
import { ContinueWatching } from './continue-watching'
import { SportsSection } from './sports-section'

interface ContentItem {
  tmdb_id: number; type: 'movie' | 'tv'; title: string; poster_path: string | null; rating: number; year: number | null
}
interface HeroItem extends ContentItem { backdrop_path: string | null; overview: string | null }
interface Section { title: string; items: ContentItem[] }

interface HomeContentProps {
  hero: HeroItem[]
  sports: any[]
  allSections: Section[]
  movieSections: Section[]
  showSections: Section[]
}

export function HomeContent({ hero, sports, allSections, movieSections, showSections }: HomeContentProps) {
  const [tab, setTab] = useState<'all' | 'movies' | 'shows'>('all')

  const sections = tab === 'movies' ? movieSections : tab === 'shows' ? showSections : allSections

  return (
    <div className="min-h-screen bg-black">
      <HeroBanner items={hero} />

      {/* Category pills — Netflix/Hotstar style */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide">
        {([['all', 'All'], ['shows', 'Shows'], ['movies', 'Movies']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-5 py-2 rounded-full text-xs font-semibold border transition-all flex-shrink-0 ${
              tab === key
                ? 'bg-white text-black border-white'
                : 'bg-transparent text-white/70 border-white/20 active:bg-white/[0.08]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ContinueWatching />

      {/* Sports section — after continue watching */}
      {sports.length > 0 && <SportsSection events={sports} />}

      {sections.map(section => (
        <ContentRow key={section.title} title={section.title} items={section.items} />
      ))}
    </div>
  )
}
