'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

interface Profile { id: string; name: string; avatar_url: string | null }

export function Header() {
  const pathname = usePathname()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (pathname !== '/') return
    fetch('/api/profiles').then(r => r.json()).then(d => {
      const profs = d.profiles || []
      setProfiles(profs)
      const savedId = localStorage.getItem('streamcorn_profile_id')
      setActiveProfile(profs.find((p: Profile) => p.id === savedId) || profs[0] || null)
    }).catch(() => {})
  }, [pathname])

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDropdown(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Hide on all pages except home — AFTER all hooks
  if (pathname !== '/') return null

  const switchProfile = (p: Profile) => {
    localStorage.setItem('streamcorn_profile_id', p.id)
    localStorage.setItem('streamcorn_profile_name', p.name)
    setActiveProfile(p)
    setShowDropdown(false)
    window.location.reload()
  }

  const isImage = activeProfile?.avatar_url?.startsWith('/avatars/')

  return (
    <header className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-12 bg-gradient-to-b from-black/90 to-transparent">
      <Link href="/"><span className="text-[#e50914] font-extrabold text-base uppercase tracking-tight drop-shadow-lg">Streamcorn</span></Link>
      <div className="flex items-center gap-2">
        <Link href="/search" className="w-9 h-9 flex items-center justify-center">
          <img src="/icons/search.svg" alt="Search" className="w-5 h-5 drop-shadow" style={{ filter: 'brightness(0) invert(1)' }} />
        </Link>
        <div className="relative" ref={dropdownRef}>
          <button onClick={() => setShowDropdown(!showDropdown)} className="w-8 h-8 rounded-lg overflow-hidden bg-[#e50914] flex items-center justify-center shadow-lg">
            {isImage ? <Image src={activeProfile!.avatar_url!} alt="" width={32} height={32} className="w-full h-full object-cover" /> : <span className="text-white text-sm font-bold">{activeProfile?.name?.charAt(0).toUpperCase() || 'U'}</span>}
          </button>
          {showDropdown && (
            <div className="absolute right-0 top-11 w-48 bg-[#1a1a1a] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden z-50">
              {profiles.map(p => {
                const pImg = p.avatar_url?.startsWith('/avatars/')
                return (
                  <button key={p.id} onClick={() => switchProfile(p)} className={`w-full flex items-center gap-3 px-3 py-2.5 active:bg-white/[0.06] ${p.id === activeProfile?.id ? 'bg-white/[0.04]' : ''}`}>
                    <div className="w-7 h-7 rounded-md overflow-hidden bg-[#333] flex-shrink-0">
                      {pImg ? <Image src={p.avatar_url!} alt="" width={28} height={28} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: p.avatar_url?.startsWith('#') ? p.avatar_url : '#e50914' }}>{p.name.charAt(0)}</div>}
                    </div>
                    <span className="text-white text-sm truncate">{p.name}</span>
                    {p.id === activeProfile?.id && <svg width="14" height="14" viewBox="0 0 24 24" fill="#e50914" className="ml-auto flex-shrink-0"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>}
                  </button>
                )
              })}
              <div className="border-t border-white/[0.06]">
                <Link href="/profiles" onClick={() => setShowDropdown(false)} className="block px-3 py-2.5 text-white/50 text-sm active:bg-white/[0.06]">Manage Profiles</Link>
                <Link href="/account" onClick={() => setShowDropdown(false)} className="block px-3 py-2.5 text-white/50 text-sm active:bg-white/[0.06]">Account</Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
