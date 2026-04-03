'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'

const UPI_ID = process.env.NEXT_PUBLIC_UPI_ID || ''

const PLANS = [
  { id: '1dev-1m', devices: 1, price: 299, label: '1 Screen', quality: 'Full HD' },
  { id: '2dev-1m', devices: 2, price: 499, label: '2 Screens', quality: 'Full HD', popular: true },
  { id: '4dev-1m', devices: 4, price: 799, label: '4 Screens', quality: '4K + HDR' },
]

const PLATFORMS = [
  { name: 'Netflix', logo: '/platforms/netflix.webp' },
  { name: 'Prime Video', logo: '/platforms/prime_video.png' },
  { name: 'Apple TV+', logo: '/platforms/appletv.png' },
  { name: 'Hulu', logo: '/platforms/hulu.svg' },
  { name: 'Crunchyroll', logo: '/platforms/crunchyroll.png' },
]

const FEATURES = [
  { icon: '📺', text: 'Full HD & 4K streaming' },
  { icon: '📱', text: 'Watch on any device' },
  { icon: '🚫', text: 'Zero ads, ever' },
  { icon: '⬇️', text: 'Download & watch offline' },
  { icon: '👨‍👩‍👧‍👦', text: 'Multiple profiles' },
  { icon: '🔄', text: 'Cancel anytime' },
]

export default function SubscribePage() {
  const router = useRouter()
  const [sub, setSub] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [txnId, setTxnId] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    fetch('/api/auth/subscription').then(r => r.json()).then(d => { setSub(d.subscription); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const isSubscribed = sub && sub.status === 'active' && new Date(sub.ends_at) > new Date()

  const handleSelect = async (plan: typeof PLANS[0]) => {
    setSelectedPlan(plan.id); setProcessing(true)
    try {
      if (isSubscribed) {
        const res = await fetch('/api/subscribe/upgrade', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan_id: plan.id }) })
        const data = await res.json(); setTxnId(data.id || null)
        const tn = `Streamcorn Upgrade ${data.id || ''}`
        const url = `upi://pay?pa=${UPI_ID}&pn=Streamcorn&am=${plan.price}&tn=${encodeURIComponent(tn)}&cu=INR`
        setQr(await QRCode.toDataURL(url, { width: 240, margin: 2, color: { dark: '#000', light: '#fff' } }))
      } else {
        const res = await fetch('/api/subscribe/initiate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan_id: plan.id }) })
        const data = await res.json(); setTxnId(data.transaction_id || null)
        const url = `upi://pay?pa=${UPI_ID}&pn=Streamcorn&am=${plan.price}&tn=${encodeURIComponent(data.transaction_id || '')}&cu=INR`
        setQr(await QRCode.toDataURL(url, { width: 240, margin: 2, color: { dark: '#000', light: '#fff' } }))
      }
    } catch {}
    setProcessing(false)
  }

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center"><div className="w-8 h-8 border-2 border-[#e50914] border-t-transparent rounded-full animate-spin" /></div>

  // QR Payment
  if (qr && selectedPlan) {
    const plan = PLANS.find(p => p.id === selectedPlan)!
    return (
      <div className="min-h-screen bg-black px-5 pt-6">
        <button onClick={() => { setQr(null); setSelectedPlan(null) }} className="text-white/40 text-sm mb-5 flex items-center gap-1 active:text-white/60">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 19l-7-7 7-7"/></svg>
          Change plan
        </button>
        <div className="bg-[#141414] rounded-2xl p-5 border border-white/[0.06]">
          <div className="flex items-center justify-between mb-5 pb-4 border-b border-white/[0.06]">
            <div>
              <p className="text-white font-bold text-lg">{plan.label}</p>
              <p className="text-white/40 text-xs">{isSubscribed ? 'Upgrade' : 'New subscription'}</p>
            </div>
            <span className="text-white font-bold text-2xl">₹{plan.price}<span className="text-white/30 text-xs font-normal">/mo</span></span>
          </div>
          <p className="text-white/50 text-sm text-center mb-4">Scan with any UPI app to pay</p>
          <div className="flex justify-center mb-4">
            <div className="bg-white p-3 rounded-2xl"><img src={qr} alt="QR" className="w-[240px] h-[240px]" /></div>
          </div>
          {txnId && <p className="text-white/15 text-[9px] text-center font-mono mb-4">{txnId}</p>}
          <a href={`upi://pay?pa=${UPI_ID}&pn=Streamcorn&am=${plan.price}&cu=INR`} className="block w-full py-3.5 bg-[#e50914] text-white font-bold text-sm rounded-xl text-center active:bg-[#b20710]">
            Open UPI App — ₹{plan.price}
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Hero section */}
      <div className="px-5 pt-8 pb-6 text-center">
        <h1 className="text-[#e50914] font-black text-2xl uppercase tracking-tight mb-2">Streamcorn</h1>
        <p className="text-white text-lg font-bold mb-1">{isSubscribed ? 'Upgrade Your Plan' : 'All Your Entertainment'}</p>
        <p className="text-white/40 text-sm">{isSubscribed ? `Current: ${sub.plan_name}` : 'One subscription. Every platform.'}</p>
      </div>

      {/* Platform logos */}
      <div className="flex items-center justify-center gap-5 px-4 mb-8">
        {PLATFORMS.map(p => (
          <img key={p.name} src={p.logo} alt={p.name} className="h-5 w-auto object-contain opacity-60" />
        ))}
      </div>

      {/* Features grid */}
      <div className="grid grid-cols-2 gap-2 px-5 mb-8">
        {FEATURES.map(f => (
          <div key={f.text} className="flex items-center gap-2.5 p-3 bg-white/[0.03] rounded-xl border border-white/[0.04]">
            <span className="text-lg">{f.icon}</span>
            <span className="text-white/60 text-xs font-medium">{f.text}</span>
          </div>
        ))}
      </div>

      {/* Plan cards */}
      <div className="px-5 mb-6">
        <h2 className="text-white font-bold text-base mb-3">{isSubscribed ? 'Available Upgrades' : 'Choose Your Plan'}</h2>
        <div className="space-y-3">
          {PLANS.filter(p => isSubscribed ? p.devices > (sub?.max_devices || 0) : true).map(plan => (
            <button
              key={plan.id}
              onClick={() => handleSelect(plan)}
              disabled={processing}
              className={`w-full p-4 rounded-2xl border text-left active:scale-[0.98] transition-transform disabled:opacity-50 ${plan.popular ? 'border-[#e50914]/40 bg-[#e50914]/[0.04]' : 'border-white/[0.06] bg-white/[0.02]'}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  {plan.popular && <span className="text-[#e50914] text-[10px] font-bold uppercase block mb-1">Most Popular</span>}
                  <p className="text-white font-bold text-lg">{plan.label}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-white/30 text-xs">{plan.quality}</span>
                    <span className="text-white/20">·</span>
                    <span className="text-white/30 text-xs">{plan.devices} device{plan.devices > 1 ? 's' : ''}</span>
                    <span className="text-white/20">·</span>
                    <span className="text-white/30 text-xs">Ad-free</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-white font-bold text-2xl">₹{plan.price}</p>
                  <p className="text-white/30 text-xs">/month</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <p className="text-white/15 text-[10px] text-center px-8 pb-8">
        Pay securely via UPI. Cancel anytime from your account settings.
      </p>
    </div>
  )
}
