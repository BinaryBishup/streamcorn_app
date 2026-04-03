'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function Header() {
  const pathname = usePathname()

  // Hide on watch/player and detail pages
  if (pathname.startsWith('/watch') || pathname.startsWith('/detail')) return null

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between px-4 h-12 bg-black/90 backdrop-blur-lg">
      <Link href="/" className="flex items-center gap-2">
        <span className="text-[#e50914] font-extrabold text-base uppercase tracking-tight">Streamcorn</span>
      </Link>
      <div className="flex items-center gap-3">
        <Link href="/search" className="p-2 -mr-1">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} opacity={0.7}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
        </Link>
        <Link href="/account" className="w-7 h-7 rounded-md bg-[#e50914] flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
          </svg>
        </Link>
      </div>
    </header>
  )
}
