'use client'

import { useState } from 'react'
import Link from 'next/link'
import { HeroBanner } from './hero-banner'
import { ContentRow } from './content-row'
import { ContinueWatching } from './continue-watching'

interface ContentItem {
  tmdb_id: number; type: 'movie' | 'tv'; title: string; poster_path: string | null; rating: number; year: number | null
}
interface HeroItem extends ContentItem { backdrop_path: string | null; overview: string | null }

interface Section { title: string; items: ContentItem[] }

interface HomeContentProps {
  hero: HeroItem[]
  allSections: Section[]
  movieSections: Section[]
  showSections: Section[]
}

export function HomeContent({ hero, allSections, movieSections, showSections }: HomeContentProps) {
  const [tab, setTab] = useState<'all' | 'movies' | 'shows'>('all')

  const sections = tab === 'movies' ? movieSections : tab === 'shows' ? showSections : allSections

  return (
    <div className="min-h-screen bg-black">
      <HeroBanner items={hero} />

      {/* Tab switcher */}
      <div className="flex gap-2 px-4 py-3">
        {(['all', 'movies', 'shows'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${tab === t ? 'bg-white text-black' : 'bg-white/[0.08] text-white/50 active:bg-white/[0.15]'}`}
          >
            {t === 'all' ? 'All' : t === 'movies' ? 'Movies' : 'Web Shows'}
          </button>
        ))}
      </div>

      {/* Test player button */}
      <div className="px-4 pb-3">
        <Link href="/test-player" className="block w-full py-2.5 bg-[#e50914] text-white text-sm font-bold rounded-xl text-center active:bg-[#b20710]">
          Test Player
        </Link>
      </div>

      <ContinueWatching />

      {sections.map(section => (
        <ContentRow key={section.title} title={section.title} items={section.items} />
      ))}
    </div>
  )
}
