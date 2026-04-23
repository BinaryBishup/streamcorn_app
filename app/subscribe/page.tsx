'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from '@/lib/sign-out'

/**
 * Subscribe page — Razorpay autopay flow, same shape as Android.
 *
 *   1. Fetch the user's current state from `/api/auth/subscription`.
 *   2. User picks a plan + optional coupon. We POST to
 *      `/api/subscribe/start` which calls the `razorpay-subscribe` edge
 *      function and returns the Razorpay subscription id.
 *   3. We load Razorpay's Checkout.js and open it with the sub id.
 *   4. On close we poll `/api/subscribe/verify` (calls the
 *      `razorpay-verify` edge function) every 2s up to ~30s — when it
 *      returns `verified=true` the user is redirected home.
 */

interface Plan {
  id: string
  devices: number
  price: number
  label: string
  quality: string
  popular?: boolean
  tagline: string
  perks: string[]
}

const PLANS: Plan[] = [
  {
    id: '1dev-1m',
    devices: 1,
    price: 199,
    label: 'Basic',
    quality: 'Full HD 1080p',
    tagline: 'Just for you',
    perks: ['Watch on 1 device', 'Full HD 1080p quality', 'Ad-free streaming', 'All platforms · all content'],
  },
  {
    id: '2dev-1m',
    devices: 2,
    price: 299,
    label: 'Standard',
    quality: 'Full HD 1080p',
    popular: true,
    tagline: 'For couples & roommates',
    perks: ['Watch on 2 devices at once', 'Full HD 1080p quality', 'Ad-free streaming', 'Profiles for each viewer'],
  },
  {
    id: '4dev-1m',
    devices: 4,
    price: 499,
    label: 'Premium',
    quality: '4K + HDR',
    tagline: 'For the whole family',
    perks: ['Watch on 4 devices at once', 'Stunning 4K + HDR quality', 'Ad-free streaming', 'Spatial audio support'],
  },
]

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Window { Razorpay?: any }
}

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true)
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve(true)
    s.onerror = () => resolve(false)
    document.body.appendChild(s)
  })
}

export default function SubscribePage() {
  const router = useRouter()
  const [current, setCurrent] = useState<{ plan_name: string; status: string; ends_at: string } | null>(null)
  const [selected, setSelected] = useState<string>(PLANS.find(p => p.popular)!.id)
  const [coupon, setCoupon] = useState('')
  const [couponInfo, setCouponInfo] = useState<{ valid: boolean; effective_price?: number; original_price?: number; message?: string } | null>(null)
  const [validating, setValidating] = useState(false)
  const [startingCheckout, setStartingCheckout] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<{ id: string; email?: string; phone?: string } | null>(null)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setUser(d.user)).catch(() => {})
    fetch('/api/auth/subscription').then(r => r.json()).then(d => setCurrent(d.subscription ?? null)).catch(() => {})
  }, [])

  const plan = PLANS.find(p => p.id === selected)!
  const alreadyActive =
    current?.status === 'active' &&
    current.plan_name === plan.label &&
    new Date(current.ends_at).getTime() > Date.now()

  const validateCoupon = async () => {
    if (!coupon.trim()) { setCouponInfo(null); return }
    setValidating(true); setError(null)
    try {
      const res = await fetch('/api/subscribe/validate-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: coupon.trim().toUpperCase(), plan_id: plan.id }),
      })
      const data = await res.json()
      setCouponInfo(data)
      if (!data.valid) setError(data.message || 'Invalid coupon')
    } catch {
      setCouponInfo({ valid: false })
      setError('Could not validate coupon')
    }
    setValidating(false)
  }

  const startCheckout = async () => {
    if (startingCheckout) return
    setStartingCheckout(true)
    setError(null)
    try {
      const ok = await loadRazorpay()
      if (!ok) throw new Error('Could not load Razorpay')

      const res = await fetch('/api/subscribe/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: plan.id, coupon_code: coupon.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not start subscription')
      const subId: string = data.subscription_id

      const rzp = new window.Razorpay({
        subscription_id: subId,
        name: 'Streamcorn',
        description: `${plan.label} — ${plan.quality}`,
        prefill: {
          email: user?.email || '',
          contact: user?.phone ? user.phone.replace(/^\+?/, '') : '',
        },
        theme: { color: '#e50914' },
        handler: () => pollVerify(),
        modal: { ondismiss: () => pollVerify() },
      })
      rzp.on('payment.failed', () => {
        setError('Payment failed. Try again?')
        setStartingCheckout(false)
      })
      rzp.open()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setStartingCheckout(false)
    }
  }

  const pollVerify = async () => {
    setStartingCheckout(false)
    setVerifying(true)
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      try {
        const res = await fetch('/api/subscribe/verify', { method: 'POST' })
        const data = await res.json()
        if (data.verified) {
          router.push('/')
          return
        }
      } catch {}
      await new Promise(r => setTimeout(r, 2000))
    }
    setVerifying(false)
    setError('Could not confirm payment. If you were charged, it will activate shortly — pull to refresh.')
  }

  const priceToShow = couponInfo?.valid ? couponInfo.effective_price ?? plan.price : plan.price
  const originalPrice = couponInfo?.valid ? couponInfo.original_price ?? plan.price : null

  return (
    <div className="min-h-screen bg-black text-white pt-6 pb-24 px-5">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black">Join Streamcorn</h1>
        <button onClick={() => signOut()} className="text-xs font-medium text-white/40 active:text-white/70">Sign out</button>
      </div>

      <p className="text-sm text-white/60 mb-6">
        14-day free trial. Cancel anytime. No ads, ever.
      </p>

      <div className="space-y-3 mb-6">
        {PLANS.map(p => {
          const active = selected === p.id
          return (
            <button
              key={p.id}
              onClick={() => { setSelected(p.id); setCouponInfo(null) }}
              className={`w-full text-left rounded-2xl p-4 ring-1 transition-all ${
                active ? 'bg-[#1a1a1a] ring-[#e50914]' : 'bg-[#141414] ring-white/[0.08]'
              }`}
            >
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold">{p.label}</span>
                    {p.popular && (
                      <span className="rounded-full bg-[#e50914] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                        Popular
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-white/40">{p.tagline}</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-extrabold">₹{p.price}</div>
                  <div className="text-[10px] uppercase text-white/40">/ month</div>
                </div>
              </div>
              {active && (
                <ul className="mt-3 space-y-1 text-sm text-white/70">
                  {p.perks.map(perk => (
                    <li key={perk} className="flex gap-2">
                      <span className="text-[#e50914]">·</span>
                      {perk}
                    </li>
                  ))}
                </ul>
              )}
            </button>
          )
        })}
      </div>

      <div className="rounded-xl bg-[#141414] ring-1 ring-white/[0.08] p-4 mb-6">
        <label className="block text-xs uppercase tracking-wider text-white/50 mb-2">
          Coupon code
        </label>
        <div className="flex gap-2">
          <input
            value={coupon}
            onChange={(e) => { setCoupon(e.target.value); setCouponInfo(null) }}
            placeholder="Optional"
            className="flex-1 h-10 rounded-lg bg-black/50 px-3 text-sm text-white ring-1 ring-white/[0.08] outline-none focus:ring-[#e50914] uppercase"
          />
          <button
            disabled={!coupon.trim() || validating}
            onClick={validateCoupon}
            className="h-10 rounded-lg bg-white/10 px-4 text-sm font-semibold disabled:opacity-40"
          >
            {validating ? '…' : 'Apply'}
          </button>
        </div>
        {couponInfo && (
          <p className={`mt-2 text-xs ${couponInfo.valid ? 'text-[#46d369]' : 'text-[#e50914]'}`}>
            {couponInfo.valid
              ? `Applied — now ₹${couponInfo.effective_price} (was ₹${couponInfo.original_price})`
              : (couponInfo.message || 'Invalid coupon')}
          </p>
        )}
      </div>

      {error && (
        <p className="text-[#e50914] text-sm mb-3">{error}</p>
      )}

      <div className="mb-4 text-center text-xs text-white/40">
        {originalPrice && originalPrice !== priceToShow ? (
          <>
            <span className="line-through mr-1">₹{originalPrice}</span>
            <span className="text-white">₹{priceToShow} / month after trial</span>
          </>
        ) : (
          <span>₹{priceToShow} / month after trial</span>
        )}
        <br />
        A ₹1 NPCI debit authorizes the UPI autopay mandate — auto-refunded within minutes.
      </div>

      <button
        onClick={startCheckout}
        disabled={startingCheckout || verifying || alreadyActive}
        className="w-full h-14 rounded-full bg-[#e50914] text-base font-bold text-white active:bg-[#b20710] disabled:opacity-60"
      >
        {verifying ? 'Confirming payment…'
          : startingCheckout ? 'Opening checkout…'
          : alreadyActive ? 'Already subscribed'
          : 'Start Free Trial'}
      </button>
    </div>
  )
}
