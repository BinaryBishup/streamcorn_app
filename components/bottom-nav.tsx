'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  {
    href: '/',
    label: 'Home',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : 1.5}>
        <path d="M12 3l9 7.5V21a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1V10.5L12 3z"/>
      </svg>
    ),
  },
  {
    href: '/browse',
    label: 'Browse',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
      </svg>
    ),
  },
  {
    href: '/search',
    label: 'Search',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
      </svg>
    ),
  },
  {
    href: '/account',
    label: 'Account',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
      </svg>
    ),
  },
]

export function BottomNav() {
  const pathname = usePathname()

  // Hide on watch/player pages
  if (pathname.startsWith('/watch')) return null

  return (
    <nav className="fixed bottom-3 left-3 right-3 z-50 bg-white/[0.06] backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
      <div className="flex items-center justify-around h-14 max-w-md mx-auto">
        {tabs.map((tab) => {
          const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-col items-center gap-0.5 py-1 px-4"
            >
              <span className={active ? 'text-[#e50914]' : 'text-white/40'}>
                {tab.icon(active)}
              </span>
              <span className={`text-[10px] font-medium ${active ? 'text-[#e50914]' : 'text-white/40'}`}>
                {tab.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
