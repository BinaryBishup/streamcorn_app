'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { signOut } from '@/lib/sign-out'

interface Session {
  id: string; device_id: string; device_name: string | null; device_type: string | null; last_active: string
}

function getOrCreateDeviceId(): string {
  const key = 'streamcorn_device_id'
  let id = localStorage.getItem(key)
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id) }
  return id
}

export function SessionGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [state, setState] = useState<'loading' | 'ok' | 'limit' | 'kicked'>('loading')
  const [sessions, setSessions] = useState<Session[]>([])
  const [maxDevices, setMaxDevices] = useState(1)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const kickedRef = useRef(false)

  const isProtected = pathname === '/' || pathname.startsWith('/browse') || pathname.startsWith('/watch') || pathname.startsWith('/detail') || pathname.startsWith('/account') || pathname.startsWith('/profiles') || pathname.startsWith('/movies') || pathname.startsWith('/shows') || pathname.startsWith('/search') || pathname.startsWith('/mylist')
  const isSubscribePage = pathname.startsWith('/subscribe')

  const registerSession = useCallback(async () => {
    try {
      // First check if user even has a subscription — if not, skip session gate
      const subRes = await fetch('/api/auth/subscription')
      const subData = await subRes.json()
      if (!subData.subscribed) {
        // No subscription — let SubscriptionGate handle it
        setState('ok')
        return
      }

      const deviceId = getOrCreateDeviceId()
      const res = await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_id: deviceId }) })
      if (res.status === 401) { setState('ok'); return }
      const data = await res.json()
      if (res.status === 409 && data.limitReached) {
        setSessions(data.sessions || []); setMaxDevices(data.maxDevices || 1); setState('limit'); return
      }
      setState('ok')
    } catch { setState('ok') }
  }, [])

  useEffect(() => {
    if (!isProtected || isSubscribePage) { setState('ok'); return }
    registerSession()
  }, [isProtected, isSubscribePage, registerSession])

  // Heartbeat
  useEffect(() => {
    if (!isProtected || state !== 'ok') return
    const interval = setInterval(async () => {
      if (kickedRef.current) return
      try {
        const deviceId = localStorage.getItem('streamcorn_device_id')
        if (!deviceId) return
        const res = await fetch('/api/sessions/heartbeat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_id: deviceId }) })
        const data = await res.json()
        if (!data.valid && data.reason === 'session_removed') { kickedRef.current = true; setState('kicked') }
      } catch {}
    }, 5000)
    return () => clearInterval(interval)
  }, [isProtected, state])

  const handleRemove = async (sessionId: string) => {
    setRemovingId(sessionId)
    await fetch(`/api/sessions?session_id=${sessionId}`, { method: 'DELETE' }).catch(() => {})
    setSessions(prev => prev.filter(s => s.id !== sessionId))
    if (sessions.filter(s => s.id !== sessionId).length < maxDevices) await registerSession()
    setRemovingId(null)
  }

  if (!isProtected || isSubscribePage || state === 'ok') return <>{children}</>

  if (state === 'loading') return <div className="min-h-screen bg-black flex items-center justify-center"><div className="w-8 h-8 border-2 border-[#e50914] border-t-transparent rounded-full animate-spin" /></div>

  if (state === 'kicked') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6 text-center">
        <div>
          <h1 className="text-xl font-bold text-white mb-2">Session Ended</h1>
          <p className="text-white/40 text-sm mb-6">You were signed out from another device.</p>
          <button onClick={() => signOut()} className="px-6 py-3 bg-[#e50914] text-white font-bold rounded-xl text-sm">Sign In Again</button>
        </div>
      </div>
    )
  }

  // Limit reached
  return (
    <div className="min-h-screen bg-black px-4 pt-8">
      <div className="text-center mb-6">
        <h1 className="text-xl font-bold text-white mb-1">Too Many Devices</h1>
        <p className="text-white/40 text-sm">Your plan allows {maxDevices} screen{maxDevices > 1 ? 's' : ''}. Remove a device or upgrade.</p>
      </div>
      <div className="space-y-2 mb-6">
        {sessions.map(s => (
          <div key={s.id} className="flex items-center gap-3 p-3 bg-[#1a1a1a] rounded-xl">
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{s.device_name || 'Unknown'}</p>
              <p className="text-white/30 text-xs">{s.device_type}</p>
            </div>
            <button onClick={() => handleRemove(s.id)} disabled={removingId === s.id} className="px-3 py-1.5 bg-white/10 text-white text-xs rounded-lg active:bg-[#e50914] disabled:opacity-50">
              {removingId === s.id ? '...' : 'Remove'}
            </button>
          </div>
        ))}
      </div>
      <Link href="/subscribe" className="block w-full py-3 bg-[#e50914] text-white font-bold text-sm rounded-xl text-center active:bg-[#b20710]">Upgrade Plan</Link>
      <button onClick={() => signOut()} className="w-full mt-3 text-white/40 text-sm py-2">Sign Out</button>
    </div>
  )
}
