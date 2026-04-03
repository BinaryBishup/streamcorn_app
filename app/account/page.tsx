'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function AccountPage() {
  const [user, setUser] = useState<any>(null)
  const [sub, setSub] = useState<any>(null)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setUser(d.user)).catch(() => {})
    fetch('/api/auth/subscription').then(r => r.json()).then(d => setSub(d.subscription)).catch(() => {})
  }, [])

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      const supabase = createClient()
      const deviceId = localStorage.getItem('streamcorn_device_id')
      if (deviceId && user?.id) {
        await supabase.from('active_sessions').delete().eq('user_id', user.id).eq('device_id', deviceId)
      }
      await supabase.auth.signOut()
    } catch {}
    localStorage.clear()
    window.location.href = '/auth'
  }

  const isSubscribed = sub && sub.status === 'active'
  const phone = user?.phone ? `+${user.phone.slice(0, 2)} ${user.phone.slice(2)}` : '—'

  return (
    <div className="min-h-screen bg-black px-4 pt-4">
      <h1 className="text-xl font-bold text-white mb-6">Account</h1>

      {/* Subscription */}
      <div className="bg-[#1a1a1a] rounded-2xl p-4 mb-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-white">Subscription</h2>
          {isSubscribed && <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] font-medium rounded-full">Active</span>}
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
      <div className="bg-[#1a1a1a] rounded-2xl p-4 mb-3 space-y-3">
        <h2 className="text-sm font-semibold text-white">Account</h2>
        <div className="flex justify-between text-sm">
          <span className="text-white/40">Phone</span>
          <span className="text-white">{phone}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-white/40">Member since</span>
          <span className="text-white">{user?.created_at ? new Date(user.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—'}</span>
        </div>
      </div>

      {/* Links */}
      <div className="bg-[#1a1a1a] rounded-2xl overflow-hidden mb-3">
        <Link href="/profiles" className="flex items-center justify-between p-4 active:bg-white/[0.04]">
          <span className="text-white text-sm">Manage Profiles</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.5} opacity={0.3}><path d="M9 5l7 7-7 7"/></svg>
        </Link>
      </div>

      {/* Sign out */}
      <button
        onClick={handleSignOut}
        disabled={signingOut}
        className="w-full py-3 bg-[#1a1a1a] rounded-2xl text-[#e50914] text-sm font-semibold active:bg-white/[0.04] disabled:opacity-50"
      >
        {signingOut ? 'Signing Out...' : 'Sign Out'}
      </button>
    </div>
  )
}
