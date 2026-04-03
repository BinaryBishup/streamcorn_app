'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function AuthPage() {
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const supabase = createClient()

  const handleSendOtp = async () => {
    if (phone.length !== 10) { setError('Enter 10-digit number'); return }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({ phone: `+91${phone}` })
    if (error) { setError(error.message); setLoading(false); return }
    setStep('otp')
    setLoading(false)
  }

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) { setError('Enter 6-digit OTP'); return }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.verifyOtp({ phone: `+91${phone}`, token: otp, type: 'sms' })
    if (error) { setError(error.message); setLoading(false); return }
    window.location.href = '/profiles'
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-[#e50914] font-extrabold text-2xl uppercase tracking-tight text-center mb-2">Streamcorn</h1>
        <p className="text-white/40 text-sm text-center mb-8">Sign in to start streaming</p>

        {step === 'phone' ? (
          <>
            <div className="flex items-center bg-[#1a1a1a] rounded-xl border border-white/[0.06] overflow-hidden mb-4">
              <span className="px-3 text-white/50 text-sm border-r border-white/[0.06]">+91</span>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="Phone number"
                className="flex-1 bg-transparent text-white text-sm px-3 py-3.5 outline-none placeholder:text-white/25"
                autoFocus
              />
            </div>
            <button
              onClick={handleSendOtp}
              disabled={loading || phone.length !== 10}
              className="w-full py-3.5 bg-[#e50914] text-white font-bold text-sm rounded-xl active:bg-[#b20710] disabled:opacity-40"
            >
              {loading ? 'Sending...' : 'Get OTP'}
            </button>
          </>
        ) : (
          <>
            <p className="text-white/50 text-sm text-center mb-4">OTP sent to +91 {phone}</p>
            <input
              type="text"
              inputMode="numeric"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="Enter 6-digit OTP"
              className="w-full bg-[#1a1a1a] text-white text-center text-lg tracking-[0.5em] px-4 py-3.5 rounded-xl border border-white/[0.06] outline-none mb-4 placeholder:text-white/25 placeholder:tracking-normal"
              autoFocus
            />
            <button
              onClick={handleVerifyOtp}
              disabled={loading || otp.length !== 6}
              className="w-full py-3.5 bg-[#e50914] text-white font-bold text-sm rounded-xl active:bg-[#b20710] disabled:opacity-40 mb-3"
            >
              {loading ? 'Verifying...' : 'Verify & Sign In'}
            </button>
            <button onClick={() => { setStep('phone'); setOtp('') }} className="w-full text-white/40 text-sm py-2">
              Change number
            </button>
          </>
        )}

        {error && <p className="text-red-400 text-xs text-center mt-3">{error}</p>}
      </div>
    </div>
  )
}
