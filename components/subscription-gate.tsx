'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [status, setStatus] = useState<'loading' | 'subscribed' | 'none'>('loading')

  // Pages that don't need subscription
  const isFree = pathname.startsWith('/auth') || pathname === '/profiles' || pathname.startsWith('/subscribe')

  useEffect(() => {
    if (isFree) { setStatus('subscribed'); return }
    fetch('/api/auth/subscription')
      .then(r => r.json())
      .then(d => setStatus(d.subscribed ? 'subscribed' : 'none'))
      .catch(() => setStatus('none'))
  }, [isFree, pathname])

  if (isFree || status === 'subscribed') return <>{children}</>

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#e50914] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // No subscription — show subscribe prompt
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 text-center">
      <div className="w-16 h-16 mb-5 rounded-full bg-[#e50914]/15 flex items-center justify-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#e50914" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      </div>
      <h1 className="text-white text-xl font-bold mb-2">Subscribe to Stream</h1>
      <p className="text-white/40 text-sm mb-6 max-w-xs">Choose a plan to start watching movies and shows on Streamcorn.</p>
      <Link href="/subscribe" className="w-full max-w-xs py-3.5 bg-[#e50914] text-white font-bold text-sm rounded-2xl text-center active:bg-[#b20710] block">
        View Plans
      </Link>
    </div>
  )
}
