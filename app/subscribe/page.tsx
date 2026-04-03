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
  { logo: '/platforms/netflix.webp' }, { logo: '/platforms/prime_video.png' },
  { logo: '/platforms/appletv.png' }, { logo: '/platforms/hulu.svg' }, { logo: '/platforms/crunchyroll.png' },
]

const FEATURES = [
  { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>, text: '1080p & 4K' },
  { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zM3.6 9h16.8M3.6 15h16.8"/><ellipse cx="12" cy="12" rx="4" ry="9"/></svg>, text: 'All Platforms' },
  { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="12" r="10"/><path d="M4.93 4.93l14.14 14.14"/></svg>, text: 'No Ads' },
  { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>, text: 'Theatre Releases' },
  { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>, text: 'Live Sports' },
  { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>, text: 'Request Content' },
  { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="2" y="7" width="7" height="10" rx="1"/><rect x="11" y="3" width="11" height="18" rx="2"/></svg>, text: 'Multiple Devices' },
]

const UPI_APPS = [
  { name: 'Google Pay', scheme: 'tez://upi/pay', icon: '/icons/gpay.svg', color: '#4285f4' },
  { name: 'PhonePe', scheme: 'phonepe://pay', icon: '/icons/phonepe.svg', color: '#5f259f' },
  { name: 'Paytm', scheme: 'paytmmp://pay', icon: '/icons/paytm.svg', color: '#00baf2' },
  { name: 'Other UPI App', scheme: 'upi://pay', icon: '/icons/upi.svg', color: '#3d8168' },
]

export default function SubscribePage() {
  const router = useRouter()
  const [sub, setSub] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<typeof PLANS[0] | null>(null)
  const [screen, setScreen] = useState<'plans' | 'payment' | 'pending'>('plans')
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
      setScreen('payment')
    } catch {}
    setProcessing(false)
  }

  const buildUpiUrl = (scheme: string) => {
    if (!selectedPlan) return '#'
    return `${scheme}?pa=${UPI_ID}&pn=Streamcorn&am=${selectedPlan.price}&tn=${encodeURIComponent(txnId || 'Streamcorn')}&cu=INR`
  }

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center"><div className="w-8 h-8 border-2 border-[#e50914] border-t-transparent rounded-full animate-spin" /></div>

  // Pending screen — light mode
  if (screen === 'pending' && selectedPlan) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 mb-5 rounded-full bg-amber-100 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
        </div>
        <h1 className="text-gray-900 text-xl font-bold mb-2">Payment Pending</h1>
        <p className="text-gray-500 text-sm mb-2">Your {selectedPlan.label} plan will be activated once payment is confirmed.</p>
        {txnId && <p className="text-gray-300 text-[10px] font-mono mb-6">{txnId}</p>}
        <button onClick={() => router.push('/')} className="w-full max-w-xs py-3.5 bg-[#e50914] text-white font-bold text-sm rounded-2xl active:bg-[#b20710] mb-3">Go to Home</button>
        <button onClick={() => setScreen('payment')} className="text-gray-400 text-sm active:text-gray-600">Try payment again</button>
      </div>
    )
  }

  // Payment screen — light mode, UPI apps
  if (screen === 'payment' && selectedPlan) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] animate-in fade-in duration-300">
        {/* Header */}
        <div className="bg-white px-5 py-4 flex items-center gap-3 border-b border-gray-200">
          <button onClick={() => setScreen('plans')} className="text-gray-500 active:text-gray-800">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 19l-7-7 7-7"/></svg>
          </button>
          <div className="flex-1">
            <p className="text-gray-900 font-semibold text-sm">Complete Payment</p>
            <p className="text-gray-400 text-xs">Streamcorn Subscription</p>
          </div>
          <div className="flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={2.5}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            <span className="text-green-600 text-[10px] font-medium">Secure</span>
          </div>
        </div>

        {/* Order summary */}
        <div className="bg-white mx-4 mt-4 rounded-2xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-gray-900 font-bold">{selectedPlan.label}</p>
              <p className="text-gray-400 text-xs">{selectedPlan.quality} · Monthly</p>
            </div>
            <p className="text-gray-900 font-black text-2xl">₹{selectedPlan.price}</p>
          </div>
          <div className="flex items-center gap-2 text-gray-400 text-[10px]">
            <span>Auto-renews monthly</span>
            <span>·</span>
            <span>Cancel anytime</span>
          </div>
        </div>

        {/* UPI Apps */}
        <div className="mx-4 mt-5">
          <p className="text-gray-500 text-xs font-medium mb-3 uppercase tracking-wider">Pay with UPI</p>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {UPI_APPS.map((app, i) => (
              <a
                key={app.name}
                href={buildUpiUrl(app.scheme)}
                className={`flex items-center gap-4 px-4 py-3.5 active:bg-gray-50 ${i < UPI_APPS.length - 1 ? 'border-b border-gray-100' : ''}`}
              >
                <img src={app.icon} alt={app.name} className="w-10 h-10 rounded-xl" />
                <span className="text-gray-800 font-medium text-sm flex-1">{app.name}</span>
                <span className="text-gray-900 font-bold text-sm">₹{selectedPlan.price}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth={2}><path d="M9 5l7 7-7 7"/></svg>
              </a>
            ))}
          </div>
        </div>

        {/* Mark as done */}
        <div className="mx-4 mt-6">
          <button
            onClick={() => setScreen('pending')}
            className="w-full py-3.5 bg-gray-900 text-white font-bold text-sm rounded-2xl active:bg-gray-800"
          >
            I've Completed Payment
          </button>
          <p className="text-gray-400 text-[10px] text-center mt-3">
            Payment will be verified automatically. If not, contact support.
          </p>
        </div>

        {/* Trust badges */}
        <div className="flex items-center justify-center gap-4 mt-6 pb-8">
          <div className="flex items-center gap-1 text-gray-400 text-[10px]">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            256-bit encrypted
          </div>
          <div className="flex items-center gap-1 text-gray-400 text-[10px]">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Verified by UPI
          </div>
        </div>
      </div>
    )
  }

  // Plans screen — light mode
  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      {/* Hero */}
      <div className="bg-[#e50914] px-5 pt-10 pb-8 text-center">
        <h1 className="text-white font-black text-3xl uppercase tracking-tight mb-2">Streamcorn</h1>
        <p className="text-white/90 text-lg font-bold mb-1">{isSubscribed ? 'Upgrade Your Plan' : 'Every Platform. One Price.'}</p>
        <p className="text-white/60 text-sm">{isSubscribed ? `You're on ${sub.plan_name}` : 'Start watching today'}</p>
      </div>

      {/* Platforms */}
      <div className="flex items-center justify-center gap-4 px-6 py-5 bg-white flex-wrap">
        {PLATFORMS.map((p, i) => (
          <img key={i} src={p.logo} alt="" className="h-5 w-auto object-contain opacity-70" />
        ))}
      </div>

      {/* Features */}
      <div className="flex flex-wrap gap-2 px-5 py-5 justify-center">
        {FEATURES.map(f => (
          <div key={f.text} className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-gray-100 shadow-sm">
            <span className="text-[#e50914]">{f.icon}</span>
            <span className="text-gray-600 text-[11px] font-medium">{f.text}</span>
          </div>
        ))}
      </div>

      {/* Plans */}
      <div className="px-5 pb-8">
        <div className="space-y-3">
          {PLANS.filter(p => isSubscribed ? p.devices > (sub?.max_devices || 0) : true).map((plan) => (
            <button
              key={plan.id}
              onClick={() => handleSelect(plan)}
              disabled={processing}
              className={`w-full rounded-2xl border text-left active:scale-[0.98] transition-all disabled:opacity-50 overflow-hidden bg-white shadow-sm ${plan.popular ? 'border-[#e50914] ring-1 ring-[#e50914]/20' : 'border-gray-200'}`}
            >
              {plan.popular && (
                <div className="bg-[#e50914] py-1.5 text-center">
                  <span className="text-white text-[10px] font-bold uppercase tracking-widest">Most Popular</span>
                </div>
              )}
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-900 font-bold text-lg">{plan.label}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-gray-400 text-[11px]">{plan.quality}</span>
                      <span className="w-1 h-1 rounded-full bg-gray-300" />
                      <span className="text-gray-400 text-[11px]">{plan.devices} device{plan.devices > 1 ? 's' : ''}</span>
                      <span className="w-1 h-1 rounded-full bg-gray-300" />
                      <span className="text-gray-400 text-[11px]">Ad-free</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-900 font-black text-3xl leading-none">₹{plan.price}</p>
                    <p className="text-gray-400 text-[10px] mt-0.5">/month</p>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
        <p className="text-gray-400 text-[10px] text-center mt-5">Secure UPI payment · Cancel anytime · No hidden charges</p>
      </div>
    </div>
  )
}
