'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

interface Profile { id: string; name: string; avatar_url: string | null }

export function BottomNav() {
  const pathname = usePathname()
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null)

  useEffect(() => {
    fetch('/api/profiles')
      .then(r => r.json())
      .then(d => {
        const profs = d.profiles || []
        const savedId = localStorage.getItem('streamcorn_profile_id')
        setActiveProfile(profs.find((p: Profile) => p.id === savedId) || profs[0] || null)
      })
      .catch(() => {})
  }, [])

  if (pathname.startsWith('/watch') || pathname.startsWith('/auth') || pathname === '/profiles' || pathname.startsWith('/subscribe')) return null

  const tabs = [
    { href: '/', label: 'Home', icon: '/icons/home.svg' },
    { href: '/browse', label: 'Browse', icon: '/icons/browse.svg' },
    { href: '/mylist', label: 'Watchlist', icon: 'bookmark' },
    { href: '/account', label: 'Account', icon: 'profile' },
  ]

  const isAvatarImage = activeProfile?.avatar_url?.startsWith('/avatars/')

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0a0a0a] border-t border-white/[0.06]">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2 pb-[env(safe-area-inset-bottom)]">
        {tabs.map((tab) => {
          const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)

          // Watchlist bookmark icon
          if (tab.icon === 'bookmark') {
            return (
              <Link key={tab.href} href={tab.href} className="flex flex-col items-center justify-center gap-1 flex-1 py-2">
                <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'white' : 'none'} stroke="white" strokeWidth={1.8} className={active ? 'opacity-100' : 'opacity-40'}>
                  <path d="M5 2a2 2 0 00-2 2v16.131a1 1 0 001.555.832L12 16.2l7.445 4.763A1 1 0 0021 20.131V4a2 2 0 00-2-2H5z" />
                </svg>
                <span className={`text-[10px] font-medium ${active ? 'text-white' : 'text-white/40'}`}>
                  {tab.label}
                </span>
              </Link>
            )
          }

          // Account tab with profile picture
          if (tab.icon === 'profile') {
            return (
              <Link key={tab.href} href={tab.href} className="flex flex-col items-center justify-center gap-1 flex-1 py-2">
                <div className={`w-[24px] h-[24px] rounded-full overflow-hidden flex-shrink-0 ${active ? 'ring-[1.5px] ring-white ring-offset-1 ring-offset-[#0a0a0a]' : 'opacity-50'}`}>
                  {isAvatarImage ? (
                    <Image src={activeProfile!.avatar_url!} alt="" width={24} height={24} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white text-[10px] font-bold bg-[#e50914]">
                      {activeProfile?.name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                  )}
                </div>
                <span className={`text-[10px] font-medium ${active ? 'text-white' : 'text-white/40'}`}>
                  {tab.label}
                </span>
              </Link>
            )
          }

          // Default icon tabs (Home, Browse)
          return (
            <Link key={tab.href} href={tab.href} className="flex flex-col items-center justify-center gap-1 flex-1 py-2">
              <img
                src={tab.icon}
                alt={tab.label}
                className="w-[22px] h-[22px]"
                style={{ filter: active ? 'brightness(0) invert(1)' : 'brightness(0) invert(1) opacity(0.4)' }}
              />
              <span className={`text-[10px] font-medium ${active ? 'text-white' : 'text-white/40'}`}>
                {tab.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
