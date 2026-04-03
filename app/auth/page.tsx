'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

const ONBOARDING = [
  {
    title: 'Unlimited Entertainment',
    subtitle: 'Movies, shows, and more. All in one place.',
    icon: <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>,
  },
  {
    title: 'Watch Anywhere',
    subtitle: 'Stream on your phone, tablet, or TV.',
    icon: <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="2" y="7" width="7" height="10" rx="1"/><rect x="11" y="3" width="11" height="18" rx="2"/></svg>,
  },
  {
    title: 'No Commitments',
    subtitle: 'Cancel anytime. No hidden fees.',
    icon: <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
  },
  {
    title: 'All Platforms',
    subtitle: 'Netflix, Prime, Apple TV+ and more.',
    icon: <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zM3.6 9h16.8M3.6 15h16.8"/><ellipse cx="12" cy="12" rx="4" ry="9"/></svg>,
  },
  {
    title: 'Download & Watch',
    subtitle: 'Save content for offline viewing.',
    icon: <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>,
  },
]

export default function AuthPage() {
  const [screen, setScreen] = useState<'onboarding' | 'phone' | 'otp'>('onboarding')
  const [slideIndex, setSlideIndex] = useState(0)
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [posters, setPosters] = useState<string[]>([])
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])
  const supabase = createClient()

  // Fetch posters for background
  useEffect(() => {
    fetch('/api/content?limit=56')
      .then(r => r.json())
      .then(d => setPosters((d.items || []).filter((i: any) => i.poster_path).map((i: any) => `https://image.tmdb.org/t/p/w185${i.poster_path}`)))
      .catch(() => {})
  }, [])

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
    const arr = otp.split(''); arr[index] = digit
    setOtp(arr.join('').slice(0, 6))
    if (digit && index < 5) otpRefs.current[index + 1]?.focus()
  }

  const handleOtpKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus()
  }

  // Animated poster rows
  const PosterBackground = () => {
    if (posters.length < 10) return null
    // Build as many rows as we have posters (6 posters per row, fill the screen)
    const rowSize = 8
    const rows: string[][] = []
    for (let i = 0; i < posters.length; i += rowSize) {
      rows.push(posters.slice(i, i + rowSize))
      if (rows.length >= 7) break // max 7 rows
    }

    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-40">
        {rows.map((row, idx) => {
          const direction = idx % 2 === 0 ? 'animate-scroll-left' : 'animate-scroll-right'
          const speed = idx % 3 === 0 ? '' : idx % 3 === 1 ? 'animate-scroll-slow' : ''
          const top = `${(idx / rows.length) * 100}%`
          return (
            <div key={idx} className={`flex gap-2 ${direction} ${speed} absolute`} style={{ top }}>
              {[...row, ...row].map((p, i) => (
                <img key={`${idx}-${i}`} src={p} className="w-[80px] h-[120px] rounded-lg object-cover flex-shrink-0" alt="" />
              ))}
            </div>
          )
        })}
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/50 to-black/80" />

        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes scroll-left { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
          @keyframes scroll-right { 0% { transform: translateX(-50%); } 100% { transform: translateX(0); } }
          .animate-scroll-left { animation: scroll-left 35s linear infinite; }
          .animate-scroll-right { animation: scroll-right 35s linear infinite; }
          .animate-scroll-slow { animation-duration: 50s !important; }
        `}} />
      </div>
    )
  }

  // Onboarding
  if (screen === 'onboarding') {
    const slide = ONBOARDING[slideIndex]
    return (
      <div className="min-h-screen bg-black flex flex-col relative">
        <PosterBackground />
        <div className="flex-1 flex flex-col items-center justify-center px-8 relative z-10">
          <div className="mb-12">
            <img src="/icons/streamcorn_full_logo.png" alt="Streamcorn" className="h-8 mx-auto" />
          </div>
          <div className="text-center mb-12 min-h-[130px]">
            <div className="w-16 h-16 rounded-2xl bg-[#e50914]/15 flex items-center justify-center mx-auto mb-5 text-[#e50914]" key={slideIndex}>
              {slide.icon}
            </div>
            <h2 className="text-white text-xl font-bold mb-2">{slide.title}</h2>
            <p className="text-white/50 text-sm">{slide.subtitle}</p>
          </div>
          <div className="flex gap-2 mb-12">
            {ONBOARDING.map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === slideIndex ? 'w-6 bg-[#e50914]' : 'w-1.5 bg-white/20'}`} />
            ))}
          </div>
        </div>
        <div className="px-6 pb-10 relative z-10">
          <button onClick={() => setScreen('phone')} className="w-full py-4 bg-[#e50914] text-white font-bold text-base rounded-2xl active:bg-[#b20710]">Get Started</button>
          <p className="text-white/20 text-[10px] text-center mt-4">By continuing, you agree to our Terms and Privacy Policy</p>
        </div>
      </div>
    )
  }

  // Phone
  if (screen === 'phone') {
    return (
      <div className="min-h-screen bg-black flex flex-col relative">
        <PosterBackground />
        <div className="flex-1 flex flex-col justify-center px-6 relative z-10">
          <button onClick={() => setScreen('onboarding')} className="absolute top-6 left-4 text-white/40 p-2 z-20">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 19l-7-7 7-7"/></svg>
          </button>
          <div className="mb-8">
            <img src="/icons/streamcorn_full_logo.png" alt="Streamcorn" className="h-6 mb-6" />
            <h2 className="text-white text-2xl font-bold mb-2">Sign in or create account</h2>
            <p className="text-white/40 text-sm">We'll send a verification code to your phone</p>
          </div>
          <div className="mb-6">
            <label className="text-white/50 text-xs font-medium mb-2 block">Phone Number</label>
            <div className="flex items-center bg-[#141414] rounded-2xl border border-white/[0.08] overflow-hidden focus-within:border-white/20">
              <span className="pl-4 pr-2 text-white/50 text-base font-medium">+91</span>
              <div className="w-px h-6 bg-white/[0.08]" />
              <input type="tel" value={phone} onChange={e => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setError('') }} placeholder="Enter phone number" className="flex-1 bg-transparent text-white text-base px-3 py-4 outline-none placeholder:text-white/20" autoFocus inputMode="numeric" />
              {phone.length === 10 && <div className="pr-4"><svg width="18" height="18" viewBox="0 0 24 24" fill="#46d369"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg></div>}
            </div>
          </div>
          <button onClick={handleSendOtp} disabled={loading || phone.length !== 10} className="w-full py-4 bg-[#e50914] text-white font-bold text-base rounded-2xl active:bg-[#b20710] disabled:opacity-30">
            {loading ? <span className="flex items-center justify-center gap-2"><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Sending...</span> : 'Continue'}
          </button>
          {error && <p className="text-red-400 text-sm text-center mt-4">{error}</p>}
        </div>
      </div>
    )
  }

  // OTP
  return (
    <div className="min-h-screen bg-black flex flex-col relative">
      <PosterBackground />
      <div className="flex-1 flex flex-col justify-center px-6 relative z-10">
        <button onClick={() => { setScreen('phone'); setOtp(''); setError('') }} className="absolute top-6 left-4 text-white/40 p-2 z-20">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div className="mb-8">
          <h2 className="text-white text-2xl font-bold mb-2">Enter verification code</h2>
          <p className="text-white/40 text-sm">Sent to <span className="text-white/70">+91 {phone}</span></p>
        </div>
        <div className="flex gap-3 justify-center mb-8">
          {Array.from({ length: 6 }).map((_, i) => (
            <input key={i} ref={el => { otpRefs.current[i] = el }} type="text" inputMode="numeric" maxLength={1} value={otp[i] || ''} onChange={e => handleOtpInput(e.target.value, i)} onKeyDown={e => handleOtpKeyDown(e, i)} autoFocus={i === 0}
              className={`w-12 h-14 text-center text-xl font-bold rounded-xl border outline-none transition-all ${otp[i] ? 'bg-white/[0.08] border-[#e50914] text-white' : 'bg-[#141414] border-white/[0.08] text-white focus:border-white/30'}`} />
          ))}
        </div>
        <button onClick={handleVerifyOtp} disabled={loading || otp.length !== 6} className="w-full py-4 bg-[#e50914] text-white font-bold text-base rounded-2xl active:bg-[#b20710] disabled:opacity-30">
          {loading ? <span className="flex items-center justify-center gap-2"><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Verifying...</span> : 'Verify & Sign In'}
        </button>
        {error && <p className="text-red-400 text-sm text-center mt-4">{error}</p>}
        <button onClick={() => { setOtp(''); handleSendOtp() }} className="mt-6 text-white/30 text-sm text-center">Didn't get the code? <span className="text-[#e50914] font-medium">Resend</span></button>
      </div>
    </div>
  )
}
