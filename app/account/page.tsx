'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { signOut } from '@/lib/sign-out'
import { usePWA } from '@/components/pwa-provider'

interface Profile { id: string; name: string; avatar_url: string | null }

export default function AccountPage() {
  const [user, setUser] = useState<any>(null)
  const [sub, setSub] = useState<any>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const { canInstall, isInstalled, install } = usePWA()

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setUser(d.user)).catch(() => {})
    fetch('/api/auth/subscription').then(r => r.json()).then(d => setSub(d.subscription)).catch(() => {})
    fetch('/api/profiles').then(r => r.json()).then(d => {
      const profs = d.profiles || []
      setProfiles(profs)
      const savedId = localStorage.getItem('streamcorn_profile_id')
      setActiveProfile(profs.find((p: Profile) => p.id === savedId) || profs[0] || null)
    }).catch(() => {})
  }, [])

  const switchProfile = (p: Profile) => {
    localStorage.setItem('streamcorn_profile_id', p.id)
    localStorage.setItem('streamcorn_profile_name', p.name)
    setActiveProfile(p)
    window.location.reload()
  }

  const handleSignOut = async () => {
    setSigningOut(true)
    await signOut()
  }

  const isSubscribed = sub && sub.status === 'active'
  const phone = user?.phone ? `+${user.phone.slice(0, 2)} ${user.phone.slice(2)}` : '—'
  const activeAvatarIsImage = activeProfile?.avatar_url?.startsWith('/avatars/')

  return (
    <div className="min-h-screen bg-black px-4 pt-4 pb-8">

      {/* Active profile hero */}
      <div className="flex flex-col items-center pt-4 mb-6">
        <div className="w-20 h-20 rounded-2xl overflow-hidden bg-[#1a1a1a] mb-3 shadow-lg shadow-black/50">
          {activeAvatarIsImage ? (
            <Image src={activeProfile!.avatar_url!} alt="" width={80} height={80} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white text-2xl font-bold" style={{ backgroundColor: activeProfile?.avatar_url?.startsWith('#') ? activeProfile.avatar_url : '#e50914' }}>
              {activeProfile?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
          )}
        </div>
        <h1 className="text-white text-lg font-bold">{activeProfile?.name || 'User'}</h1>
        <p className="text-white/30 text-xs mt-0.5">{phone}</p>
      </div>

      {/* Switch profile */}
      {profiles.length > 1 && (
        <div className="bg-[#111] rounded-2xl p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">Switch Profile</h2>
            <Link href="/profiles" className="text-[#e50914] text-xs font-medium">Manage</Link>
          </div>
          <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
            {profiles.map(p => {
              const isImage = p.avatar_url?.startsWith('/avatars/')
              const isActive = p.id === activeProfile?.id
              return (
                <button
                  key={p.id}
                  onClick={() => !isActive && switchProfile(p)}
                  className={`flex flex-col items-center gap-1.5 flex-shrink-0 transition-transform active:scale-95 ${isActive ? '' : 'opacity-50'}`}
                >
                  <div className={`w-14 h-14 rounded-xl overflow-hidden bg-[#1a1a1a] ${isActive ? 'ring-2 ring-[#e50914] ring-offset-2 ring-offset-[#111]' : ''}`}>
                    {isImage ? (
                      <Image src={p.avatar_url!} alt={p.name} width={56} height={56} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white text-lg font-bold" style={{ backgroundColor: p.avatar_url?.startsWith('#') ? p.avatar_url : '#e50914' }}>
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className={`text-[11px] max-w-[56px] truncate ${isActive ? 'text-white font-medium' : 'text-white/50'}`}>{p.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Subscription */}
      <div className="bg-[#111] rounded-2xl p-4 mb-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-white">Subscription</h2>
          {isSubscribed && (
            <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] font-medium rounded-full">Active</span>
          )}
        </div>
        {sub ? (
          <>
            <p className="text-white font-bold">{sub.plan_name}</p>
            <p className="text-white/40 text-xs mt-0.5">₹{sub.price}/mo &middot; {sub.max_devices} screen{sub.max_devices > 1 ? 's' : ''}</p>
          </>
        ) : (
          <p className="text-white/40 text-sm">No active plan</p>
        )}
        <Link href="/subscribe" className="mt-3 block text-center bg-[#e50914] text-white py-2.5 rounded-xl text-sm font-bold active:bg-[#b20710]">
          {isSubscribed ? 'Upgrade Plan' : 'Subscribe'}
        </Link>
      </div>

      {/* Account info */}
      <div className="bg-[#111] rounded-2xl p-4 mb-3 space-y-3">
        <h2 className="text-sm font-semibold text-white">Account Details</h2>
        <div className="flex justify-between text-sm">
          <span className="text-white/40">Phone</span>
          <span className="text-white">{phone}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-white/40">Member since</span>
          <span className="text-white">{user?.created_at ? new Date(user.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-white/40">Profiles</span>
          <span className="text-white">{profiles.length}/5</span>
        </div>
      </div>

      {/* Quick links */}
      <div className="bg-[#111] rounded-2xl overflow-hidden mb-3">
        <Link href="/profiles" className="flex items-center justify-between p-4 active:bg-white/[0.04]">
          <div className="flex items-center gap-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.5} className="opacity-50">
              <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4-4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
            <span className="text-white text-sm">Manage Profiles</span>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.5} opacity={0.2}><path d="M9 5l7 7-7 7"/></svg>
        </Link>
        <div className="h-px bg-white/[0.06] mx-4" />
        <Link href="/mylist" className="flex items-center justify-between p-4 active:bg-white/[0.04]">
          <div className="flex items-center gap-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.5} className="opacity-50">
              <path d="M5 2a2 2 0 00-2 2v16.131a1 1 0 001.555.832L12 16.2l7.445 4.763A1 1 0 0021 20.131V4a2 2 0 00-2-2H5z" />
            </svg>
            <span className="text-white text-sm">My Watchlist</span>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.5} opacity={0.2}><path d="M9 5l7 7-7 7"/></svg>
        </Link>
      </div>

      {/* Install app */}
      {canInstall && !isInstalled && (
        <button
          onClick={install}
          className="w-full py-3.5 bg-[#e50914] rounded-2xl text-white text-sm font-bold active:bg-[#b20710] mb-3 flex items-center justify-center gap-2"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Install App
        </button>
      )}
      {isInstalled && (
        <div className="w-full py-3 bg-[#111] rounded-2xl text-center mb-3">
          <span className="text-green-400 text-sm font-medium flex items-center justify-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M20 6L9 17l-5-5" />
            </svg>
            App Installed
          </span>
        </div>
      )}

      {/* Sign out */}
      <button
        onClick={handleSignOut}
        disabled={signingOut}
        className="w-full py-3.5 bg-[#111] rounded-2xl text-[#e50914] text-sm font-semibold active:bg-white/[0.04] disabled:opacity-50 mt-1"
      >
        {signingOut ? 'Signing Out...' : 'Sign Out'}
      </button>

      {/* App version */}
      <p className="text-center text-white/15 text-[10px] mt-6">Streamcorn v0.1.0</p>
    </div>
  )
}
