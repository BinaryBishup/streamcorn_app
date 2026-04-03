'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function Header() {
  const pathname = usePathname()

  if (pathname.startsWith('/watch') || pathname.startsWith('/detail')) return null

  return (
    <header className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-11 bg-gradient-to-b from-black/80 to-transparent">
      <Link href="/" className="flex items-center">
        <span className="text-[#e50914] font-extrabold text-base uppercase tracking-tight drop-shadow-lg">Streamcorn</span>
      </Link>
      <div className="flex items-center gap-2">
        <Link href="/search" className="w-9 h-9 flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} className="drop-shadow">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
        </Link>
        <Link href="/account" className="w-7 h-7 rounded-md bg-[#e50914] flex items-center justify-center shadow-lg">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
          </svg>
        </Link>
      </div>
    </header>
  )
}
