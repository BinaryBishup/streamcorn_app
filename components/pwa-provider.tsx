'use client'

import { useEffect, useState, createContext, useContext } from 'react'

interface PWAContextValue {
  canInstall: boolean
  isInstalled: boolean
  install: () => Promise<void>
}

const PWAContext = createContext<PWAContextValue>({
  canInstall: false,
  isInstalled: false,
  install: async () => {},
})

export const usePWA = () => useContext(PWAContext)

export function PWAProvider({ children }: { children?: React.ReactNode }) {
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
    }

    // Listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e)
      if (!localStorage.getItem('streamcorn_pwa_dismissed')) {
        setShowBanner(true)
      }
    }
    window.addEventListener('beforeinstallprompt', handler)

    // Detect install
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true)
      setShowBanner(false)
      setInstallPrompt(null)
    })

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const install = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    const result = await installPrompt.userChoice
    if (result.outcome === 'accepted') {
      setShowBanner(false)
      setInstallPrompt(null)
      setIsInstalled(true)
    }
  }

  const handleDismiss = () => {
    setShowBanner(false)
    localStorage.setItem('streamcorn_pwa_dismissed', '1')
  }

  return (
    <PWAContext.Provider value={{ canInstall: !!installPrompt, isInstalled, install }}>
      {children}

      {/* Install banner */}
      {showBanner && (
        <div className="fixed top-0 left-0 right-0 z-[100] p-3 animate-slideDown">
          <div className="max-w-lg mx-auto bg-[#1a1a1a] border border-white/[0.08] rounded-2xl p-4 flex items-center gap-3 shadow-2xl">
            <img src="/icons/icon-192.png" alt="Streamcorn" className="w-11 h-11 rounded-xl flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold">Install Streamcorn</p>
              <p className="text-white/40 text-xs">Faster loads, offline browsing, home screen access</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={handleDismiss} className="text-white/30 text-xs px-2 py-1.5">Later</button>
              <button onClick={install} className="bg-[#e50914] text-white text-xs font-bold px-4 py-2 rounded-lg active:bg-[#b20710]">Install</button>
            </div>
          </div>
        </div>
      )}
    </PWAContext.Provider>
  )
}
