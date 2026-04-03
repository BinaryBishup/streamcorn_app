'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const UPI_ID = process.env.NEXT_PUBLIC_UPI_ID || ''

const PLANS = [
  { id: '1dev-1m', devices: 1, price: 299, label: '1 Screen', quality: 'Full HD 1080p' },
  { id: '2dev-1m', devices: 2, price: 499, label: '2 Screens', quality: 'Full HD 1080p', popular: true },
  { id: '4dev-1m', devices: 4, price: 799, label: '4 Screens', quality: '4K + HDR' },
]

const PLATFORMS = [
  { name: 'Netflix', logo: '/platforms/netflix.webp' },
  { name: 'Prime Video', logo: '/platforms/prime_video.png' },
  { name: 'Apple TV+', logo: '/platforms/appletv.png' },
  { name: 'Hulu', logo: '/platforms/hulu.svg' },
  { name: 'Crunchyroll', logo: '/platforms/crunchyroll.png' },
]

const UPI_APPS = [
  { name: 'Google Pay', scheme: 'tez://upi/pay', icon: '🅖' },
  { name: 'PhonePe', scheme: 'phonepe://pay', icon: '🅟' },
  { name: 'Paytm', scheme: 'paytmmp://pay', icon: '🅿' },
  { name: 'Other UPI', scheme: 'upi://pay', icon: '💳' },
]

export default function SubscribePage() {
  const router = useRouter()
  const [sub, setSub] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<typeof PLANS[0] | null>(null)
  const [showPayment, setShowPayment] = useState(false)
  const [txnId, setTxnId] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    fetch('/api/auth/subscription').then(r => r.json()).then(d => { setSub(d.subscription); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const isSubscribed = sub && sub.status === 'active' && new Date(sub.ends_at) > new Date()

  const handleSelect = async (plan: typeof PLANS[0]) => {
    setSelectedPlan(plan); setProcessing(true)
    try {
      const endpoint = isSubscribed ? '/api/subscribe/upgrade' : '/api/subscribe/initiate'
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan_id: plan.id }) })
      const data = await res.json()
      setTxnId(data.transaction_id || data.id || null)
      setShowPayment(true)
    } catch {}
    setProcessing(false)
  }

  const buildUpiUrl = (scheme: string) => {
    if (!selectedPlan) return '#'
    const tn = txnId || 'Streamcorn'
    return `${scheme}?pa=${UPI_ID}&pn=Streamcorn&am=${selectedPlan.price}&tn=${encodeURIComponent(tn)}&cu=INR`
  }

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center"><div className="w-8 h-8 border-2 border-[#e50914] border-t-transparent rounded-full animate-spin" /></div>

  // Payment screen — UPI app selection
  if (showPayment && selectedPlan) {
    return (
      <div className="min-h-screen bg-black px-5 pt-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <button onClick={() => setShowPayment(false)} className="text-white/40 text-sm mb-6 flex items-center gap-1 active:text-white/60">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 19l-7-7 7-7"/></svg>
          Change plan
        </button>

        {/* Plan summary */}
        <div className="bg-[#141414] rounded-2xl p-5 border border-white/[0.06] mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-white font-bold text-lg">{selectedPlan.label}</p>
              <p className="text-white/40 text-xs">{selectedPlan.quality} · {selectedPlan.devices} device{selectedPlan.devices > 1 ? 's' : ''} · Ad-free</p>
            </div>
            <span className="text-white font-bold text-2xl">₹{selectedPlan.price}<span className="text-white/30 text-xs font-normal">/mo</span></span>
          </div>
          {txnId && <p className="text-white/15 text-[9px] font-mono">ID: {txnId}</p>}
        </div>

        {/* Secure payment badge */}
        <div className="flex items-center justify-center gap-2 mb-5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#46d369" strokeWidth={2}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          <span className="text-[#46d369] text-xs font-medium">Secure UPI Payment</span>
        </div>

        {/* UPI Apps */}
        <p className="text-white/50 text-sm text-center mb-4">Pay with your favourite UPI app</p>
        <div className="space-y-2.5 mb-6">
          {UPI_APPS.map(app => (
            <a
              key={app.name}
              href={buildUpiUrl(app.scheme)}
              className="flex items-center gap-4 p-4 bg-[#141414] rounded-2xl border border-white/[0.06] active:bg-white/[0.06] active:scale-[0.98] transition-transform"
            >
              <div className="w-11 h-11 rounded-xl bg-white/[0.08] flex items-center justify-center text-xl">
                {app.icon}
              </div>
              <span className="text-white font-medium text-sm flex-1">{app.name}</span>
              <span className="text-white font-bold">₹{selectedPlan.price}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} opacity={0.3}><path d="M9 5l7 7-7 7"/></svg>
            </a>
          ))}
        </div>

        <p className="text-white/15 text-[10px] text-center px-4">
          Your subscription starts immediately after payment. Cancel anytime.
        </p>
      </div>
    )
  }

  // Plan selection screen
  return (
    <div className="min-h-screen bg-black animate-in fade-in duration-500">
      {/* Hero */}
      <div className="relative px-5 pt-10 pb-8 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#e50914]/10 via-transparent to-transparent pointer-events-none" />
        <h1 className="text-[#e50914] font-black text-3xl uppercase tracking-tight mb-3 relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-500">Streamcorn</h1>
        <p className="text-white text-xl font-bold mb-2 relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '100ms' }}>
          {isSubscribed ? 'Upgrade Your Plan' : 'Every Platform. One Price.'}
        </p>
        <p className="text-white/40 text-sm relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '200ms' }}>
          {isSubscribed ? `You're on ${sub.plan_name}` : 'Start watching today'}
        </p>
      </div>

      {/* Platform logos */}
      <div className="flex items-center justify-center gap-5 px-6 mb-6 animate-in fade-in duration-500" style={{ animationDelay: '300ms' }}>
        {PLATFORMS.map(p => (
          <img key={p.name} src={p.logo} alt={p.name} className="h-5 w-auto object-contain opacity-50" />
        ))}
      </div>

      {/* Features */}
      <div className="flex gap-3 px-5 mb-8 overflow-x-auto scrollbar-hide animate-in fade-in duration-500" style={{ animationDelay: '400ms' }}>
        {[
          { icon: '📺', text: '1080p & 4K' },
          { icon: '🚫', text: 'No Ads' },
          { icon: '⬇️', text: 'Downloads' },
          { icon: '👥', text: 'Profiles' },
          { icon: '📱', text: 'Any Device' },
        ].map(f => (
          <div key={f.text} className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-white/[0.04] rounded-full border border-white/[0.06]">
            <span className="text-base">{f.icon}</span>
            <span className="text-white/60 text-xs font-medium whitespace-nowrap">{f.text}</span>
          </div>
        ))}
      </div>

      {/* Plans */}
      <div className="px-5 mb-6">
        <div className="space-y-3">
          {PLANS.filter(p => isSubscribed ? p.devices > (sub?.max_devices || 0) : true).map((plan, i) => (
            <button
              key={plan.id}
              onClick={() => handleSelect(plan)}
              disabled={processing}
              className={`w-full p-5 rounded-2xl border text-left transition-all active:scale-[0.98] disabled:opacity-50 animate-in fade-in slide-in-from-bottom-4 duration-500 ${plan.popular ? 'border-[#e50914]/50 bg-gradient-to-r from-[#e50914]/10 to-transparent' : 'border-white/[0.06] bg-white/[0.02]'}`}
              style={{ animationDelay: `${500 + i * 100}ms` }}
            >
              <div className="flex items-center justify-between">
                <div>
                  {plan.popular && <span className="text-[#e50914] text-[10px] font-bold uppercase tracking-wider block mb-1">Recommended</span>}
                  <p className="text-white font-bold text-lg mb-0.5">{plan.label}</p>
                  <p className="text-white/30 text-xs">{plan.quality} · {plan.devices} device{plan.devices > 1 ? 's' : ''} · Ad-free</p>
                </div>
                <div className="text-right">
                  <p className="text-white font-black text-3xl">₹{plan.price}</p>
                  <p className="text-white/30 text-[10px]">per month</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <p className="text-white/15 text-[10px] text-center px-8 pb-8">
        Secure UPI payment · Cancel anytime · No hidden charges
      </p>
    </div>
  )
}
