'use client'

import { useState, useRef, useEffect } from 'react'
import { HeroBanner } from './hero-banner'
import { ContentRow } from './content-row'
import { ContinueWatching } from './continue-watching'
import { SportsSection } from './sports-section'

export interface ContentItem {
  tmdb_id: string // uuid from content.id — aliased by the server adapter
  type: 'movie' | 'tv'
  title: string
  poster_path: string | null // absolute URL from content.poster_image
  rating: number
  year: number | null
  categories?: string[]
}

export interface HeroItem extends ContentItem {
  backdrop_path: string | null
  overview: string | null
  logo_path: string | null
}

interface Section { title: string; items: ContentItem[] }

interface HomeContentProps {
  hero: HeroItem[]
  sports: unknown[]
  allSections: Section[]
  movieSections: Section[]
  showSections: Section[]
}

export function HomeContent({ hero, sports, allSections, movieSections, showSections }: HomeContentProps) {
  const [tab, setTab] = useState<'all' | 'movies' | 'shows'>('all')
  const [showToggle, setShowToggle] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => setShowToggle(entry.isIntersecting),
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const sections = tab === 'movies' ? movieSections : tab === 'shows' ? showSections : allSections

  return (
    <div className="min-h-screen bg-black">
      <HeroBanner items={hero} />

      <ContinueWatching />

      {sports.length > 0 && <SportsSection events={sports as never} />}

      <div ref={contentRef}>
        {sections.map(section => (
          <ContentRow key={section.title} title={section.title} items={section.items} />
        ))}
      </div>

      <div style={{
        position: 'sticky', bottom: 72, zIndex: 30,
        display: 'flex', justifyContent: 'center', padding: '8px 0',
        opacity: showToggle ? 1 : 0, pointerEvents: showToggle ? 'auto' : 'none',
        transition: 'opacity 0.3s ease',
      }}>
        <div className="flex bg-[#1a1a1a]/90 backdrop-blur-lg rounded-full border border-white/[0.08] p-1 shadow-lg">
          {([['all', 'All'], ['shows', 'TV'], ['movies', 'Movies']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                tab === key ? 'bg-white text-black' : 'text-white/60 active:text-white'
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
