'use client'

import { useEffect, useState } from 'react'
import { usePWA } from './pwa-provider'

export function BrowserGate({ children }: { children: React.ReactNode }) {
  const { isInstalled, canInstall, install } = usePWA()
  const [checked, setChecked] = useState(false)
  const [isBrowser, setIsBrowser] = useState(false)

  useEffect(() => {
    // Check if running as standalone PWA
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    setIsBrowser(!standalone)
    setChecked(true)
  }, [])

  // Don't render anything until we've checked
  if (!checked) return null

  // Running as PWA — show the app
  if (!isBrowser) return <>{children}</>

  // Running in browser — show install instructions
  const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad/i.test(navigator.userAgent)

  // App was previously installed on this device — guide user to open it
  if (isInstalled && !canInstall) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center px-8 text-center z-[9999]">
        <img src="/icons/icon-192.png" alt="Streamcorn" className="w-20 h-20 rounded-2xl mb-6 shadow-lg" />
        <img src="/icons/streamcorn_full_logo.png" alt="Streamcorn" className="h-6 mb-8 opacity-90" />

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-4">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth={3}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="text-emerald-400 text-[11px] font-semibold">Already Installed</span>
        </div>
        <h1 className="text-white text-xl font-bold mb-2">Open Streamcorn</h1>
        <p className="text-white/40 text-sm mb-8 max-w-[280px]">
          Streamcorn is installed on this device. Open it from your home screen for the full experience.
        </p>

        <button
          onClick={() => {
            // Try to launch the installed PWA via its manifest start_url
            window.location.href = '/'
          }}
          className="w-full max-w-[280px] py-3.5 bg-[#e50914] text-white text-sm font-bold rounded-xl active:bg-[#b20710] mb-3 flex items-center justify-center gap-2 shadow-lg shadow-red-900/30"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <rect x="3" y="3" width="18" height="18" rx="4" />
            <path d="M9 12h6M12 9v6" />
          </svg>
          Open App
        </button>

        <button
          onClick={() => {
            localStorage.removeItem('streamcorn_pwa_installed')
            window.location.reload()
          }}
          className="text-white/40 text-xs underline underline-offset-4 py-2"
        >
          Not installed? Reinstall
        </button>

        <p className="text-white/20 text-[10px] mt-8">Streamcorn is a Progressive Web App</p>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center px-8 text-center z-[9999]">
      {/* Logo */}
      <img src="/icons/icon-192.png" alt="Streamcorn" className="w-20 h-20 rounded-2xl mb-6 shadow-lg" />
      <img src="/icons/streamcorn_full_logo.png" alt="Streamcorn" className="h-6 mb-8 opacity-90" />

      <h1 className="text-white text-xl font-bold mb-2">Install Streamcorn</h1>
      <p className="text-white/40 text-sm mb-8 max-w-[280px]">
        For the best experience, add Streamcorn to your home screen
      </p>

      {/* Native install button — shown for Android (with native prompt) or any platform where browser exposed the prompt */}
      {(canInstall || isAndroid) && (
        <button
          onClick={() => {
            if (canInstall) {
              install()
            } else {
              // Prompt not yet fired — nudge the user to the manual steps below
              const el = document.getElementById('install-instructions')
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              el?.animate(
                [{ boxShadow: '0 0 0 0 rgba(229,9,20,0.6)' }, { boxShadow: '0 0 0 12px rgba(229,9,20,0)' }],
                { duration: 900, iterations: 2 }
              )
            }
          }}
          className="w-full max-w-[280px] py-3.5 bg-[#e50914] text-white text-sm font-bold rounded-xl active:bg-[#b20710] mb-6 flex items-center justify-center gap-2 shadow-lg shadow-red-900/30"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Install Streamcorn
        </button>
      )}

      {/* Platform-specific instructions */}
      <div id="install-instructions" className="w-full max-w-[320px] bg-[#111] rounded-2xl p-5 text-left">
        {isAndroid ? (
          <>
            <p className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 -960 960 960" fill="#3ddc84"><path d="M40-200v-80h200v-320l-80-80-80 80v-200l80-80 80 80 80-80 80 80-80 80v320h200v80H40Zm280-400h320L480-760 320-600Z"/></svg>
              Android
            </p>
            <div className="space-y-3 text-sm text-white/60">
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-white/10 rounded-full flex items-center justify-center text-white text-xs font-bold">1</span>
                <p>Tap the <span className="text-white font-medium">⋮ menu</span> (3 dots) at the top right</p>
              </div>
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-white/10 rounded-full flex items-center justify-center text-white text-xs font-bold">2</span>
                <p>Tap <span className="text-white font-medium">"Install app"</span> or <span className="text-white font-medium">"Add to Home screen"</span></p>
              </div>
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-white/10 rounded-full flex items-center justify-center text-white text-xs font-bold">3</span>
                <p>Tap <span className="text-white font-medium">Install</span> to confirm</p>
              </div>
            </div>
          </>
        ) : isIOS ? (
          <>
            <p className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 -960 960 960" fill="white"><path d="M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm-40-360v240h80v-240h-80Zm0-160v80h80v-80h-80Z"/></svg>
              iPhone / iPad
            </p>
            <div className="space-y-3 text-sm text-white/60">
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-white/10 rounded-full flex items-center justify-center text-white text-xs font-bold">1</span>
                <p>Open this page in <span className="text-white font-medium">Safari</span></p>
              </div>
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-white/10 rounded-full flex items-center justify-center text-white text-xs font-bold">2</span>
                <p>Tap the <span className="text-white font-medium">Share button</span> (square with arrow ↑)</p>
              </div>
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-white/10 rounded-full flex items-center justify-center text-white text-xs font-bold">3</span>
                <p>Tap <span className="text-white font-medium">"Add to Home Screen"</span></p>
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="text-white font-semibold text-sm mb-4">Desktop</p>
            <div className="space-y-3 text-sm text-white/60">
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-white/10 rounded-full flex items-center justify-center text-white text-xs font-bold">1</span>
                <p>Click the <span className="text-white font-medium">install icon</span> (⊕) in your browser's address bar</p>
              </div>
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-white/10 rounded-full flex items-center justify-center text-white text-xs font-bold">2</span>
                <p>Click <span className="text-white font-medium">Install</span></p>
              </div>
            </div>
          </>
        )}
      </div>

      <p className="text-white/20 text-[10px] mt-8">Streamcorn is a Progressive Web App</p>
    </div>
  )
}
