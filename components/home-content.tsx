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

      <ContinueWatching />

      {/* Sports section */}
      {sports.length > 0 && <SportsSection events={sports} />}

      {sections.map(section => (
        <ContentRow key={section.title} title={section.title} items={section.items} />
      ))}

      {/* Category toggle — bottom, above footer */}
      <div className="sticky bottom-[72px] z-30 flex justify-center py-2">
        <div className="flex bg-[#1a1a1a]/90 backdrop-blur-lg rounded-full border border-white/[0.08] p-1 shadow-lg">
          {([['all', 'All'], ['shows', 'TV'], ['movies', 'Movies']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                tab === key
                  ? 'bg-white text-black'
                  : 'text-white/60 active:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
