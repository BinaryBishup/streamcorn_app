'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/', label: 'Home', icon: '/icons/home.svg' },
  { href: '/browse', label: 'Browse', icon: '/icons/browse.svg' },
  { href: '/search', label: 'Search', icon: '/icons/search.svg' },
  { href: '/account', label: 'Account', icon: '/icons/user.svg' },
]

export function BottomNav() {
  const pathname = usePathname()

  if (pathname.startsWith('/watch') || pathname.startsWith('/auth') || pathname === '/profiles' || pathname.startsWith('/subscribe')) return null

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0a0a0a] border-t border-white/[0.06]">
      <div className="flex items-center justify-around h-14 max-w-md mx-auto safe-bottom">
        {tabs.map((tab) => {
          const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)
          return (
            <Link key={tab.href} href={tab.href} className="flex flex-col items-center gap-0.5 py-1 px-4">
              <img
                src={tab.icon}
                alt={tab.label}
                className="w-[22px] h-[22px]"
                style={{ filter: active ? 'invert(22%) sepia(95%) saturate(6000%) hue-rotate(355deg) brightness(95%)' : 'invert(1) opacity(0.4)' }}
              />
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
