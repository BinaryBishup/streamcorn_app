'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

interface Profile { id: string; name: string; avatar_url: string | null }

type IconProps = { filled: boolean }

// Icons mirror the Android ic_nav_* drawables: outlined when inactive,
// filled when selected.
function HomeIcon({ filled }: IconProps) {
  return filled ? (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.172 3 10.5V21a1 1 0 0 0 1 1h5v-7h6v7h5a1 1 0 0 0 1-1V10.5z"/></svg>
  ) : (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>
  )
}
function SearchIcon({ filled }: IconProps) {
  return filled ? (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4a6 6 0 1 0 3.78 10.66l4.28 4.28 1.42-1.42-4.28-4.28A6 6 0 0 0 10 4m0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8" /></svg>
  ) : (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="10.5" cy="10.5" r="6"/><path d="m20 20-4.5-4.5"/></svg>
  )
}
function BrowseIcon({ filled }: IconProps) {
  return filled ? (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M4 5h7v6H4zm0 8h7v6H4zm9-8h7v6h-7zm0 8h7v6h-7z"/></svg>
  ) : (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round"><rect x="4" y="5" width="7" height="6" rx="1"/><rect x="13" y="5" width="7" height="6" rx="1"/><rect x="4" y="13" width="7" height="6" rx="1"/><rect x="13" y="13" width="7" height="6" rx="1"/></svg>
  )
}
function HelpIcon({ filled }: IconProps) {
  return filled ? (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2m.08 15a1.2 1.2 0 1 1 1.2-1.2 1.2 1.2 0 0 1-1.2 1.2m2.08-6.5a2.93 2.93 0 0 1-1.26 1.08c-.55.3-.9.58-.9 1.12V13h-1.7v-.54a2.42 2.42 0 0 1 1.38-2.12 1.63 1.63 0 0 0 .76-.58 1.18 1.18 0 0 0 .16-.6 1.2 1.2 0 0 0-1.3-1.2c-.84 0-1.38.46-1.5 1.32l-1.6-.2c.22-1.6 1.48-2.7 3.1-2.7A2.86 2.86 0 0 1 14.5 9a2.66 2.66 0 0 1-.34 1.5"/></svg>
  ) : (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5"/><circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none"/></svg>
  )
}

export function BottomNav() {
  const pathname = usePathname()
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null)
  const [hasNotification, setHasNotification] = useState(false)

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

  // Surface a dot on Account when a request transitions to added/approved
  // (same trigger the phone app uses).
  useEffect(() => {
    fetch('/api/content-requests')
      .then(r => r.json())
      .then(d => {
        const reqs = d.requests || []
        setHasNotification(reqs.some((r: { status: string }) => r.status === 'added' || r.status === 'approved'))
      }).catch(() => {})
  }, [])

  if (
    pathname.startsWith('/watch') ||
    pathname.startsWith('/auth') ||
    pathname === '/profiles' ||
    pathname.startsWith('/subscribe') ||
    pathname.startsWith('/sports')
  ) return null

  const isAvatarImage = activeProfile?.avatar_url?.startsWith('/avatars/')

  type Tab =
    | { href: string; label: string; kind: 'icon'; Icon: (p: IconProps) => React.ReactElement; badge?: boolean }
    | { href: string; label: string; kind: 'profile'; badge?: boolean }

  const tabs: Tab[] = [
    { href: '/', label: 'Home', kind: 'icon', Icon: HomeIcon },
    { href: '/search', label: 'Search', kind: 'icon', Icon: SearchIcon },
    { href: '/browse', label: 'Browse', kind: 'icon', Icon: BrowseIcon },
    { href: '/help', label: 'Help', kind: 'icon', Icon: HelpIcon },
    { href: '/account', label: 'Account', kind: 'profile', badge: hasNotification },
  ]

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/')

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#050505]">
      <div
        className="flex items-stretch max-w-lg mx-auto px-1.5 pt-0.5"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 4px)' }}
      >
        {tabs.map((tab) => {
          const active = isActive(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch={false}
              className="relative flex-1 flex flex-col items-center justify-start pt-1.5 pb-1 gap-1"
            >
              <div
                className={`transition-transform duration-200 ${active ? 'scale-[1.05]' : 'scale-100'} ${active ? 'text-white' : 'text-white/40'}`}
              >
                {tab.kind === 'icon' ? (
                  <div className="relative">
                    <tab.Icon filled={active} />
                    {tab.badge && !active && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#e50914]" />
                    )}
                  </div>
                ) : (
                  <div className="relative">
                    <div
                      className={`w-[22px] h-[22px] rounded-full overflow-hidden bg-[#e50914] flex items-center justify-center ${active ? 'ring-[1.5px] ring-white ring-offset-1 ring-offset-[#050505]' : ''}`}
                    >
                      {isAvatarImage ? (
                        <Image src={activeProfile!.avatar_url!} alt="" width={22} height={22} className={`w-full h-full object-cover ${active ? '' : 'opacity-[0.65]'}`} />
                      ) : (
                        <span className={`text-white text-[10px] font-bold ${active ? '' : 'opacity-80'}`}>
                          {activeProfile?.name?.charAt(0).toUpperCase() || 'U'}
                        </span>
                      )}
                    </div>
                    {tab.badge && !active && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#e50914] ring-2 ring-[#050505]" />
                    )}
                  </div>
                )}
              </div>
              <span
                className={`text-[10px] leading-none ${active ? 'font-semibold text-white' : 'font-medium text-white/40'}`}
              >
                {tab.label}
              </span>
              <span
                aria-hidden
                className={`absolute bottom-0 h-[2.5px] rounded-full bg-[#e50914] transition-all duration-300 ease-out ${active ? 'w-[18px] opacity-100' : 'w-0 opacity-0'}`}
                style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 2px)' }}
              />
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
