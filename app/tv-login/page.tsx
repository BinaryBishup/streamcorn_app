'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

type Mode = 'enter' | 'confirming' | 'success' | 'error'

const TOKEN_RE = /^[A-Z0-9]{4,12}$/

export default function TVLoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlToken = searchParams.get('token')
  const [mode, setMode] = useState<Mode>(urlToken ? 'confirming' : 'enter')
  const [code, setCode] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Auto-confirm when the page is deep-linked with a token (QR scan target).
  useEffect(() => {
    if (urlToken) confirm(urlToken)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlToken])

  const confirm = async (token: string) => {
    const clean = token.trim().toUpperCase()
    if (!TOKEN_RE.test(clean)) {
      setErrorMsg('That code looks off. It should be the 6–10 character code on your TV.')
      setMode('error')
      return
    }
    setMode('confirming')
    setErrorMsg(null)
    try {
      const res = await fetch('/api/tv-login', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: clean }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 401) {
        setErrorMsg('You need to sign in on your phone first, then try again.')
        setMode('error')
        return
      }
      if (!res.ok || data.error) {
        setErrorMsg(data.error || "We couldn't verify that code. It may have expired — generate a new one on your TV.")
        setMode('error')
        return
      }
      setMode('success')
    } catch {
      setErrorMsg('Network hiccup. Check your connection and try again.')
      setMode('error')
    }
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    confirm(code)
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <img src="/icons/streamcorn_full_logo.png" alt="Streamcorn" className="h-6" />
        </div>

        {mode === 'enter' && (
          <>
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-[#e50914]/15 text-[#e50914]">
                <svg width="30" height="30" viewBox="0 -960 960 960" fill="currentColor">
                  <path d="M160-160q-33 0-56.5-23.5T80-240v-440q0-33 23.5-56.5T160-760h640q33 0 56.5 23.5T880-680v440q0 33-23.5 56.5T800-160H640v80H320v-80H160Z"/>
                </svg>
              </div>
            </div>
            <h1 className="text-white text-xl font-bold text-center mb-2">Pair your TV</h1>
            <p className="text-white/50 text-[13px] text-center mb-6 leading-relaxed">
              Open Streamcorn on your TV. A pairing code appears on screen. Type it here and you're signed in.
            </p>
            <form onSubmit={onSubmit} className="space-y-3">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Pairing code"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                maxLength={12}
                className="w-full h-12 rounded-xl bg-white/[0.06] border border-white/[0.12] focus:border-white/30 text-white text-center tracking-[0.35em] text-base font-bold outline-none"
              />
              <button
                type="submit"
                disabled={code.trim().length < 4}
                className="w-full h-12 rounded-xl bg-[#e50914] text-white text-sm font-bold active:bg-[#b20710] disabled:opacity-40"
              >
                Pair TV
              </button>
            </form>
            <p className="text-white/30 text-[11px] text-center mt-6">
              Don't have Streamcorn on your TV yet? Go to Help → Android TV for install steps.
            </p>
          </>
        )}

        {mode === 'confirming' && (
          <div className="flex flex-col items-center py-8">
            <div className="w-8 h-8 rounded-full border-[3px] border-white/20 border-t-[#e50914] animate-spin" />
            <p className="text-white/50 text-sm mt-4">Signing your TV in…</p>
          </div>
        )}

        {mode === 'success' && (
          <div className="flex flex-col items-center text-center py-6">
            <div className="w-16 h-16 rounded-full flex items-center justify-center bg-[#46d369]/15 mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="#46d369"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>
            </div>
            <h2 className="text-white text-lg font-bold mb-1">TV signed in</h2>
            <p className="text-white/50 text-[13px] max-w-[260px]">Look at your TV — Streamcorn should be loading your home screen now.</p>
            <button
              onClick={() => router.push('/help')}
              className="mt-6 px-4 py-2 rounded-lg bg-white/[0.08] text-white text-xs font-bold active:bg-white/[0.14]"
            >
              Back to Help
            </button>
          </div>
        )}

        {mode === 'error' && (
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center bg-[#e50914]/15 mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="#e50914"><path d="M12 2 1 21h22zm1 14h-2v-2h2zm0-4h-2V9h2z"/></svg>
            </div>
            <h2 className="text-white text-lg font-bold mb-1">Couldn't pair</h2>
            <p className="text-white/50 text-[13px] max-w-[280px] mb-5">{errorMsg ?? 'Something went wrong.'}</p>
            <button
              onClick={() => { setMode('enter'); setCode(''); setErrorMsg(null) }}
              className="px-5 py-2.5 rounded-lg bg-[#e50914] text-white text-sm font-bold active:bg-[#b20710]"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
