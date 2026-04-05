'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

export default function TVLoginPage() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<'loading' | 'confirming' | 'success' | 'error'>('loading')

  useEffect(() => {
    if (!token) { setStatus('error'); return }
    confirmLogin()
  }, [token])

  const confirmLogin = async () => {
    setStatus('confirming')
    try {
      const res = await fetch('/api/tv-login', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (data.ok) setStatus('success')
      else setStatus('error')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: 24 }}>
      <img src="/icons/streamcorn_full_logo.png" alt="Streamcorn" style={{ height: 24, marginBottom: 32 }} />

      {status === 'loading' && <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Loading...</p>}

      {status === 'confirming' && (
        <>
          <div style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#e50914', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 16 }}>Confirming TV login...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </>
      )}

      {status === 'success' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: 'rgba(70,211,105,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="#46d369"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>
          </div>
          <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>TV Login Confirmed!</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Your TV should now be logged in. You can close this page.</p>
        </div>
      )}

      {status === 'error' && (
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Login Failed</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>The token may have expired. Please try again on your TV.</p>
          <button onClick={confirmLogin} style={{ marginTop: 16, padding: '10px 24px', background: '#e50914', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700 }}>
            Try Again
          </button>
        </div>
      )}
    </div>
  )
}
