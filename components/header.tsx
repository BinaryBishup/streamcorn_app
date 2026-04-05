'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

export function Header() {
  const pathname = usePathname()

  if (pathname !== '/') return null

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-gradient-to-b from-black/90 to-transparent">
      <div className="flex items-center justify-between px-4 h-11">
        <Link href="/"><img src="/icons/streamcorn_full_logo.png" alt="Streamcorn" className="h-5 drop-shadow-lg" /></Link>
        <Link href="/search" className="w-9 h-9 flex items-center justify-center">
          <svg width="22" height="22" viewBox="0 -960 960 960" fill="white"><path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z"/></svg>
        </Link>
      </div>
    </header>
  )
}
