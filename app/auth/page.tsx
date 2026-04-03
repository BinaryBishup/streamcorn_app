'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

const ONBOARDING = [
  { title: 'Unlimited Entertainment', subtitle: 'Movies, shows, and more. All in one place.', emoji: '🎬' },
  { title: 'Watch Anywhere', subtitle: 'Stream on your phone, tablet, or TV.', emoji: '📱' },
  { title: 'No Commitments', subtitle: 'Cancel anytime. No hidden fees.', emoji: '✨' },
]

export default function AuthPage() {
  const [screen, setScreen] = useState<'onboarding' | 'phone' | 'otp'>('onboarding')
  const [slideIndex, setSlideIndex] = useState(0)
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  const supabase = createClient()

  // Auto-slide onboarding
  useEffect(() => {
    if (screen !== 'onboarding') return
    const timer = setInterval(() => setSlideIndex(i => (i + 1) % ONBOARDING.length), 3000)
    return () => clearInterval(timer)
  }, [screen])

  const handleSendOtp = async () => {
    if (phone.length !== 10) { setError('Enter 10-digit number'); return }
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithOtp({ phone: `+91${phone}` })
    if (error) { setError(error.message); setLoading(false); return }
    setScreen('otp'); setLoading(false)
  }

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) { setError('Enter 6-digit code'); return }
    setLoading(true); setError('')
    const { error } = await supabase.auth.verifyOtp({ phone: `+91${phone}`, token: otp, type: 'sms' })
    if (error) { setError(error.message); setLoading(false); return }
    window.location.href = '/profiles'
  }

  const handleOtpInput = (value: string, index: number) => {
    const digit = value.replace(/\D/g, '').slice(-1)
    const newOtp = otp.split('')
    newOtp[index] = digit
    const joined = newOtp.join('').slice(0, 6)
    setOtp(joined)
    if (digit && index < 5) otpRefs.current[index + 1]?.focus()
  }

  const handleOtpKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus()
  }

  // Onboarding screen
  if (screen === 'onboarding') {
    const slide = ONBOARDING[slideIndex]
    return (
      <div className="min-h-screen bg-black flex flex-col">
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[300px] h-[300px] rounded-full bg-[#e50914]/10 blur-[100px]" />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-8 relative z-10">
          {/* Logo */}
          <div className="mb-12">
            <h1 className="text-[#e50914] font-black text-3xl uppercase tracking-tight">Streamcorn</h1>
          </div>

          {/* Slide */}
          <div className="text-center mb-12 min-h-[120px]">
            <div className="text-5xl mb-4 animate-in fade-in duration-500" key={slideIndex}>{slide.emoji}</div>
            <h2 className="text-white text-xl font-bold mb-2 animate-in fade-in slide-in-from-bottom-2 duration-500" key={`t-${slideIndex}`}>{slide.title}</h2>
            <p className="text-white/40 text-sm animate-in fade-in slide-in-from-bottom-2 duration-500" key={`s-${slideIndex}`}>{slide.subtitle}</p>
          </div>

          {/* Dots */}
          <div className="flex gap-2 mb-12">
            {ONBOARDING.map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === slideIndex ? 'w-6 bg-[#e50914]' : 'w-1.5 bg-white/20'}`} />
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="px-6 pb-10 relative z-10">
          <button
            onClick={() => setScreen('phone')}
            className="w-full py-4 bg-[#e50914] text-white font-bold text-base rounded-2xl active:bg-[#b20710] transition-colors"
          >
            Get Started
          </button>
          <p className="text-white/20 text-[10px] text-center mt-4">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    )
  }

  // Phone input screen
  if (screen === 'phone') {
    return (
      <div className="min-h-screen bg-black flex flex-col">
        <div className="flex-1 flex flex-col justify-center px-6">
          {/* Back */}
          <button onClick={() => setScreen('onboarding')} className="absolute top-6 left-4 text-white/40 p-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 19l-7-7 7-7"/></svg>
          </button>

          <div className="mb-8">
            <h1 className="text-[#e50914] font-black text-xl uppercase tracking-tight mb-6">Streamcorn</h1>
            <h2 className="text-white text-2xl font-bold mb-2">Sign in or create account</h2>
            <p className="text-white/40 text-sm">We'll send a verification code to your phone</p>
          </div>

          {/* Phone input */}
          <div className="mb-6">
            <label className="text-white/50 text-xs font-medium mb-2 block">Phone Number</label>
            <div className="flex items-center bg-[#141414] rounded-2xl border border-white/[0.08] overflow-hidden focus-within:border-white/20 transition-colors">
              <span className="pl-4 pr-2 text-white/50 text-base font-medium">+91</span>
              <div className="w-px h-6 bg-white/[0.08]" />
              <input
                type="tel"
                value={phone}
                onChange={e => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setError('') }}
                placeholder="Enter phone number"
                className="flex-1 bg-transparent text-white text-base px-3 py-4 outline-none placeholder:text-white/20"
                autoFocus
                inputMode="numeric"
              />
              {phone.length === 10 && (
                <div className="pr-4">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#46d369"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleSendOtp}
            disabled={loading || phone.length !== 10}
            className="w-full py-4 bg-[#e50914] text-white font-bold text-base rounded-2xl active:bg-[#b20710] disabled:opacity-30 disabled:active:bg-[#e50914] transition-all"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Sending code...
              </span>
            ) : 'Continue'}
          </button>

          {error && <p className="text-red-400 text-sm text-center mt-4">{error}</p>}
        </div>
      </div>
    )
  }

  // OTP verification screen
  return (
    <div className="min-h-screen bg-black flex flex-col">
      <div className="flex-1 flex flex-col justify-center px-6">
        {/* Back */}
        <button onClick={() => { setScreen('phone'); setOtp(''); setError('') }} className="absolute top-6 left-4 text-white/40 p-2">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 19l-7-7 7-7"/></svg>
        </button>

        <div className="mb-8">
          <h2 className="text-white text-2xl font-bold mb-2">Enter verification code</h2>
          <p className="text-white/40 text-sm">Sent to <span className="text-white/70">+91 {phone}</span></p>
        </div>

        {/* OTP boxes */}
        <div className="flex gap-3 justify-center mb-8">
          {Array.from({ length: 6 }).map((_, i) => (
            <input
              key={i}
              ref={el => { otpRefs.current[i] = el }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={otp[i] || ''}
              onChange={e => handleOtpInput(e.target.value, i)}
              onKeyDown={e => handleOtpKeyDown(e, i)}
              autoFocus={i === 0}
              className={`w-12 h-14 text-center text-xl font-bold rounded-xl border outline-none transition-all ${
                otp[i]
                  ? 'bg-white/[0.08] border-[#e50914] text-white'
                  : 'bg-[#141414] border-white/[0.08] text-white focus:border-white/30'
              }`}
            />
          ))}
        </div>

        <button
          onClick={handleVerifyOtp}
          disabled={loading || otp.length !== 6}
          className="w-full py-4 bg-[#e50914] text-white font-bold text-base rounded-2xl active:bg-[#b20710] disabled:opacity-30 transition-all"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Verifying...
            </span>
          ) : 'Verify & Sign In'}
        </button>

        {error && <p className="text-red-400 text-sm text-center mt-4">{error}</p>}

        {/* Resend */}
        <button onClick={() => { setOtp(''); handleSendOtp() }} className="mt-6 text-white/30 text-sm text-center active:text-white/50">
          Didn't get the code? <span className="text-[#e50914] font-medium">Resend</span>
        </button>
      </div>
    </div>
  )
}
