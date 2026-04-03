'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'

const UPI_ID = process.env.NEXT_PUBLIC_UPI_ID || ''

const PLANS = [
  { id: '1dev-1m', devices: 1, price: 299, label: '1 Screen' },
  { id: '2dev-1m', devices: 2, price: 499, label: '2 Screens', popular: true },
  { id: '4dev-1m', devices: 799, price: 799, label: '4 Screens' },
]

export default function SubscribePage() {
  const router = useRouter()
  const [sub, setSub] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [upgradeId, setUpgradeId] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    fetch('/api/auth/subscription').then(r => r.json()).then(d => { setSub(d.subscription); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const isSubscribed = sub && sub.status === 'active' && new Date(sub.ends_at) > new Date()

  const handleSelect = async (plan: typeof PLANS[0]) => {
    setSelectedPlan(plan.id)
    setProcessing(true)

    try {
      if (isSubscribed) {
        // Upgrade
        const res = await fetch('/api/subscribe/upgrade', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan_id: plan.id }) })
        const data = await res.json()
        setUpgradeId(data.id || null)
        const tn = `Streamcorn Upgrade ${data.id || ''}`
        const upiUrl = `upi://pay?pa=${UPI_ID}&pn=Streamcorn&am=${plan.price}&tn=${encodeURIComponent(tn)}&cu=INR`
        const qrData = await QRCode.toDataURL(upiUrl, { width: 220, margin: 2, color: { dark: '#000', light: '#fff' } })
        setQr(qrData)
      } else {
        // New subscription
        const res = await fetch('/api/subscribe/initiate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan_id: plan.id }) })
        const data = await res.json()
        const upiUrl = `upi://pay?pa=${UPI_ID}&pn=Streamcorn&am=${plan.price}&tn=${encodeURIComponent(data.transaction_id || '')}&cu=INR`
        const qrData = await QRCode.toDataURL(upiUrl, { width: 220, margin: 2, color: { dark: '#000', light: '#fff' } })
        setQr(qrData)
      }
    } catch {}
    setProcessing(false)
  }

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center"><div className="w-8 h-8 border-2 border-[#e50914] border-t-transparent rounded-full animate-spin" /></div>

  // QR payment screen
  if (qr && selectedPlan) {
    const plan = PLANS.find(p => p.id === selectedPlan)!
    return (
      <div className="min-h-screen bg-black px-4 pt-6">
        <button onClick={() => { setQr(null); setSelectedPlan(null) }} className="text-white/40 text-sm mb-4 flex items-center gap-1">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 19l-7-7 7-7"/></svg>
          Back
        </button>
        <div className="bg-[#1a1a1a] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-white font-bold">{plan.label}</p>
              <p className="text-white/40 text-xs">{isSubscribed ? 'Upgrade' : 'Subscribe'}</p>
            </div>
            <span className="text-white font-bold text-xl">₹{plan.price}</span>
          </div>
          <p className="text-white/40 text-xs text-center mb-3">Scan with any UPI app</p>
          <div className="flex justify-center mb-3">
            <div className="bg-white p-2.5 rounded-xl"><img src={qr} alt="QR" className="w-[220px] h-[220px]" /></div>
          </div>
          {upgradeId && <p className="text-white/20 text-[9px] text-center font-mono mb-3">{upgradeId}</p>}
          <a href={`upi://pay?pa=${UPI_ID}&pn=Streamcorn&am=${plan.price}&cu=INR`} className="block w-full py-3 bg-[#e50914] text-white font-bold text-sm rounded-xl text-center active:bg-[#b20710]">
            Open UPI App
          </a>
        </div>
        <button onClick={() => router.push('/')} className="w-full mt-4 text-white/40 text-sm py-2">Go to Home</button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black px-4 pt-6">
      <h1 className="text-xl font-bold text-white mb-1">{isSubscribed ? 'Upgrade Plan' : 'Choose Plan'}</h1>
      <p className="text-white/40 text-sm mb-6">{isSubscribed ? `Current: ${sub.plan_name}` : 'Pick a plan to start streaming'}</p>

      <div className="space-y-3">
        {PLANS.filter(p => isSubscribed ? p.devices > (sub?.max_devices || 0) : true).map(plan => (
          <button
            key={plan.id}
            onClick={() => handleSelect(plan)}
            disabled={processing}
            className={`w-full p-4 rounded-2xl border text-left active:scale-[0.98] transition-transform ${plan.popular ? 'border-[#e50914]/40 bg-[#e50914]/[0.04]' : 'border-white/[0.06] bg-white/[0.02]'}`}
          >
            {plan.popular && <span className="text-[#e50914] text-[10px] font-bold uppercase mb-1 block">Most Popular</span>}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-bold text-lg">{plan.label}</p>
                <p className="text-white/40 text-xs">Stream on {plan.devices} device{plan.devices > 1 ? 's' : ''}</p>
              </div>
              <p className="text-white font-bold text-2xl">₹{plan.price}<span className="text-white/30 text-xs font-normal">/mo</span></p>
            </div>
          </button>
        ))}
      </div>

      {isSubscribed && <button onClick={() => router.back()} className="w-full mt-6 text-white/40 text-sm py-2">Go Back</button>}
    </div>
  )
}
