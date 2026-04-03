'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'subscribed' | 'none'>('loading')

  const isFree = pathname.startsWith('/auth') || pathname === '/profiles' || pathname.startsWith('/subscribe')

  useEffect(() => {
    if (isFree) { setStatus('subscribed'); return }
    fetch('/api/auth/subscription')
      .then(r => r.json())
      .then(d => {
        if (d.subscribed) {
          setStatus('subscribed')
        } else {
          // Redirect straight to subscribe page
          router.replace('/subscribe')
        }
      })
      .catch(() => setStatus('subscribed'))
  }, [isFree, pathname, router])

  if (isFree || status === 'subscribed') return <>{children}</>

  // Brief loading while checking
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#e50914] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
