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
  const [posters, setPosters] = useState<string[]>([])
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])
  const supabase = createClient()

  // Fetch posters for background
  useEffect(() => {
    fetch('/api/content?limit=30')
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
    const row1 = posters.slice(0, 10)
    const row2 = posters.slice(10, 20)
    const row3 = posters.slice(20, 30)
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="flex gap-2 animate-scroll-left absolute top-[5%]">
          {[...row1, ...row1].map((p, i) => (
            <img key={`a-${i}`} src={p} className="w-[90px] h-[135px] rounded-lg object-cover flex-shrink-0" alt="" />
          ))}
        </div>
        <div className="flex gap-2 animate-scroll-right absolute top-[35%]">
          {[...row2, ...row2].map((p, i) => (
            <img key={`b-${i}`} src={p} className="w-[90px] h-[135px] rounded-lg object-cover flex-shrink-0" alt="" />
          ))}
        </div>
        <div className="flex gap-2 animate-scroll-left-slow absolute top-[65%]">
          {[...row3, ...row3].map((p, i) => (
            <img key={`c-${i}`} src={p} className="w-[90px] h-[135px] rounded-lg object-cover flex-shrink-0" alt="" />
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-black via-black/70 to-black" />

        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes scroll-left { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
          @keyframes scroll-right { 0% { transform: translateX(-50%); } 100% { transform: translateX(0); } }
          .animate-scroll-left { animation: scroll-left 40s linear infinite; }
          .animate-scroll-right { animation: scroll-right 40s linear infinite; }
          .animate-scroll-left-slow { animation: scroll-left 55s linear infinite; }
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
            <h1 className="text-[#e50914] font-black text-3xl uppercase tracking-tight">Streamcorn</h1>
          </div>
          <div className="text-center mb-12 min-h-[120px]">
            <div className="text-5xl mb-4" key={slideIndex}>{slide.emoji}</div>
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
            <h1 className="text-[#e50914] font-black text-xl uppercase tracking-tight mb-6">Streamcorn</h1>
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
