'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Top app bar — mirrors the Android `MainTopBar`: streamcorn wordmark
 * on the left, a "Request" pill on the right. Background is a vertical
 * gradient that darkens as the user scrolls so it doesn't bleed into
 * hero art on Home.
 */
// Keep the header to routes whose layouts already account for it so we
// don't hide content on existing pages. Home places a hero under the
// bar; Help is designed below with matching top padding.
const HEADER_ROUTES = ['/', '/help']

export function Header() {
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      // Fade fraction maxes out after ~120px of scroll.
      setScrolled(window.scrollY > 8)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [pathname])

  const shouldRender = HEADER_ROUTES.includes(pathname)
  if (!shouldRender) return null

  // On Home we overlay the hero art, so keep the background mostly
  // transparent at rest. On other routes we use a solid backdrop so
  // text underneath doesn't leak through.
  const isHome = pathname === '/'

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-40 transition-colors duration-200 ${
        isHome
          ? scrolled
            ? 'bg-black/80 backdrop-blur-sm'
            : 'bg-gradient-to-b from-black/70 via-black/20 to-transparent'
          : scrolled
            ? 'bg-black/90 backdrop-blur-sm'
            : 'bg-black/80'
      }`}
    >
      <div
        className="flex items-center justify-between px-4 pb-3"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)' }}
      >
        <Link href="/" className="flex items-center" aria-label="Streamcorn home">
          <img
            src="/icons/streamcorn_full_logo.png"
            alt="Streamcorn"
            className="h-5 drop-shadow-lg"
          />
        </Link>

        <Link
          href="/request"
          prefetch={false}
          className="flex items-center gap-1.5 pl-2.5 pr-3.5 py-[7px] rounded-full bg-white/[0.08] border border-white/[0.2] active:bg-white/[0.14]"
          aria-label="Request new title"
        >
          <svg width="16" height="16" viewBox="0 -960 960 960" fill="#e50914">
            <path d="M440-280h80v-160h160v-80H520v-160h-80v160H280v80h160v160ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Z" />
          </svg>
          <span className="text-white text-xs font-bold">Request</span>
        </Link>
      </div>
    </header>
  )
}
