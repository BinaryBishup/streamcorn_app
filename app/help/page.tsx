'use client'

import Link from 'next/link'
import { useState } from 'react'

// ─────────────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────────────

const SUPPORT_EMAIL = 'hello@streamcorn.app'
const PRIVACY_URL = 'https://streamcorn-app.vercel.app/privacy'
const TERMS_URL = 'https://streamcorn-app.vercel.app/terms'

type Platform = 'tv' | 'windows' | 'mac' | 'ios'

const PLATFORM_META: Record<
  Platform,
  { label: string; tagline: string; accent: string; icon: React.ReactNode; steps: string[] }
> = {
  tv: {
    label: 'Android TV',
    tagline: 'Smart TV / Fire TV / NVIDIA Shield',
    accent: '#3ddc84',
    icon: (
      <svg width="22" height="22" viewBox="0 -960 960 960" fill="currentColor">
        <path d="M160-160q-33 0-56.5-23.5T80-240v-440q0-33 23.5-56.5T160-760h240L320-840l56-56 160 160h224q33 0 56.5 23.5T840-680v440q0 33-23.5 56.5T760-160H160Z"/>
      </svg>
    ),
    steps: [
      "On your TV, open Settings → Apps → Security & restrictions and turn ON 'Unknown sources' for your browser or file-manager app.",
      'Open a browser on the TV (or use Send Files to TV from your phone) and download the Streamcorn TV APK from streamcorn-app.vercel.app.',
      'Install the APK. When asked, allow Streamcorn permission to keep running in the background.',
      'Open Streamcorn TV. A pairing code appears on screen.',
      "Back on this phone, tap 'Watch on your TV' above and scan the code — you're signed in.",
    ],
  },
  windows: {
    label: 'Windows',
    tagline: 'Windows 10 & 11',
    accent: '#38b6ff',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 5.3 10.5 4.2v7.3H3zM11.5 4l9.5-1.4v9H11.5zM3 12.5h7.5v7.3L3 18.7zm8.5 0H21v9.4L11.5 20.5z"/>
      </svg>
    ),
    steps: [
      "On your PC, open streamcorn-app.vercel.app and click 'Download for Windows'. The installer (.exe) is ~80 MB.",
      "Open the downloaded file. Windows SmartScreen may warn that the publisher is unverified — click 'More info → Run anyway'.",
      'Follow the installer prompts (default options are fine).',
      'Launch Streamcorn from the Start menu. Sign in with the same phone number you used here.',
      'Your watchlist, profiles, and Continue Watching sync automatically.',
    ],
  },
  mac: {
    label: 'macOS',
    tagline: 'Apple Silicon & Intel',
    accent: '#bbbbbb',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.04 12.86c-.02-2.23 1.82-3.3 1.9-3.35-1.04-1.51-2.65-1.72-3.23-1.74-1.37-.14-2.69.81-3.39.81-.7 0-1.78-.79-2.93-.77-1.5.02-2.9.88-3.68 2.23-1.57 2.72-.4 6.75 1.13 8.96.75 1.08 1.64 2.3 2.81 2.26 1.13-.05 1.56-.73 2.93-.73 1.37 0 1.75.73 2.94.71 1.22-.02 1.99-1.1 2.73-2.19.87-1.26 1.22-2.5 1.24-2.57-.03-.01-2.38-.91-2.4-3.62zM14.7 6.22c.61-.74 1.03-1.77.91-2.8-.88.04-1.95.59-2.58 1.33-.57.66-1.07 1.71-.94 2.72.98.08 1.98-.5 2.61-1.25z"/>
      </svg>
    ),
    steps: [
      "Open streamcorn-app.vercel.app on your Mac and click 'Download for Mac' (you'll get a .dmg file).",
      'Open the .dmg and drag the Streamcorn icon into your Applications folder.',
      "First launch: right-click → 'Open' → 'Open' in the security prompt. macOS only asks once.",
      'Sign in with your phone number. Profiles, watchlist, and downloads all sync.',
    ],
  },
  ios: {
    label: 'iOS / iPad',
    tagline: 'TestFlight beta',
    accent: '#e5e5e7',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M7 2h10a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3m5 17a1 1 0 1 0 1 1 1 1 0 0 0-1-1M6 4v14h12V4z"/>
      </svg>
    ),
    steps: [
      "Install Apple's TestFlight app from the App Store if you don't already have it.",
      "On your iPhone or iPad, open streamcorn-app.vercel.app and tap 'Open TestFlight invite' — TestFlight launches automatically.",
      "Tap 'Accept' → 'Install'. The Streamcorn app downloads next to your other apps.",
      'Open Streamcorn and sign in with your phone number.',
      "We're working on a public App Store release — beta seats are first-come, first-served.",
    ],
  },
}

const FAQ: { q: string; a: string }[] = [
  {
    q: 'How do I install Streamcorn on my TV?',
    a: "Tap 'Android TV' above for step-by-step instructions, or use the Watch on your TV pairing flow if you've already installed the app.",
  },
  {
    q: "Why does a title say 'not available yet'?",
    a: "We're still preparing it. Tap Missing a title? above to request it and we'll notify you the moment it's live.",
  },
  {
    q: 'How do I switch profiles?',
    a: 'Open Account → tap a different profile avatar in the Switch Profile row.',
  },
  {
    q: "I paid but playback won't start",
    a: 'UPI Autopay can take a few minutes to settle on some banks. Pull to refresh on Home — the subscription state syncs every 30 seconds.',
  },
]

// ─────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────

export default function HelpPage() {
  const [openPlatform, setOpenPlatform] = useState<Platform | null>(null)
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(null)

  return (
    <div className="min-h-screen bg-black pb-10">
      <div
        className="max-w-lg mx-auto px-4"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 72px)' }}
      >
        <h1 className="text-[22px] font-bold text-white mb-1">Help & Devices</h1>
        <p className="text-white/45 text-xs mb-6">Install Streamcorn everywhere, pair your TV, and answers to common questions.</p>

        {/* ── Watch on TV pairing card ──────────────────────────── */}
        <Link
          href="/tv-login"
          className="relative block overflow-hidden rounded-2xl mb-6 p-4 active:brightness-95"
          style={{ background: 'linear-gradient(135deg, #e50914 0%, #b20710 100%)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <svg width="22" height="22" viewBox="0 -960 960 960" fill="white">
                <path d="M160-160q-33 0-56.5-23.5T80-240v-440q0-33 23.5-56.5T160-760h640q33 0 56.5 23.5T880-680v440q0 33-23.5 56.5T800-160H640v80H320v-80H160Z"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-[15px]">Watch on your TV</p>
              <p className="text-white/80 text-xs mt-0.5">Already installed? Pair your TV in seconds.</p>
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.2} strokeLinecap="round">
              <path d="m9 6 6 6-6 6"/>
            </svg>
          </div>
        </Link>

        {/* ── Device install grid ──────────────────────────────── */}
        <h2 className="text-white text-[15px] font-bold mb-1">Get Streamcorn on every device</h2>
        <p className="text-white/45 text-xs mb-3">Tap a device to see step-by-step install instructions.</p>
        <div className="grid grid-cols-2 gap-2 mb-7">
          {(Object.keys(PLATFORM_META) as Platform[]).map((key) => {
            const p = PLATFORM_META[key]
            return (
              <button
                key={key}
                onClick={() => setOpenPlatform(key)}
                className="flex flex-col items-start gap-2 p-3.5 rounded-xl bg-white/[0.05] border border-white/[0.08] active:bg-white/[0.1] text-left"
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${p.accent}1f`, color: p.accent }}
                >
                  {p.icon}
                </div>
                <div>
                  <p className="text-white text-[13px] font-bold">{p.label}</p>
                  <p className="text-white/40 text-[11px] mt-0.5">{p.tagline}</p>
                </div>
              </button>
            )
          })}
        </div>

        {/* ── FAQ accordion ─────────────────────────────────────── */}
        <h2 className="text-white text-[15px] font-bold mb-3">Common questions</h2>
        <div className="space-y-2 mb-7">
          {FAQ.map((item, idx) => {
            const open = openFaqIdx === idx
            return (
              <div
                key={idx}
                className="rounded-xl bg-white/[0.04] border border-white/[0.06] overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaqIdx(open ? null : idx)}
                  className="w-full flex items-center gap-3 text-left px-4 py-3.5 active:bg-white/[0.03]"
                >
                  <span className="flex-1 text-white text-[13px] font-semibold">{item.q}</span>
                  <svg
                    width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}
                    className={`text-white/50 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                  >
                    <path d="m6 9 6 6 6-6"/>
                  </svg>
                </button>
                {open && (
                  <div className="px-4 pb-4 -mt-1">
                    <p className="text-white/60 text-[13px] leading-relaxed">{item.a}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Contact & legal ───────────────────────────────────── */}
        <h2 className="text-white text-[15px] font-bold mb-3">Contact & legal</h2>
        <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] overflow-hidden">
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="flex items-center gap-3 px-4 py-3.5 active:bg-white/[0.03] border-b border-white/[0.06]"
          >
            <div className="w-9 h-9 rounded-lg bg-[#e50914]/15 text-[#e50914] flex items-center justify-center flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/></svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold">Email support</p>
              <p className="text-white/40 text-[11px] truncate">{SUPPORT_EMAIL}</p>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-white/30"><path d="m9 6 6 6-6 6"/></svg>
          </a>
          <a
            href={PRIVACY_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 px-4 py-3.5 active:bg-white/[0.03] border-b border-white/[0.06]"
          >
            <div className="w-9 h-9 rounded-lg bg-white/[0.08] text-white/70 flex items-center justify-center flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6z"/></svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold">Privacy policy</p>
              <p className="text-white/40 text-[11px] truncate">How your data is handled</p>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-white/30"><path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v7h-7"/><path d="M3 10v11h11"/></svg>
          </a>
          <a
            href={TERMS_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 px-4 py-3.5 active:bg-white/[0.03]"
          >
            <div className="w-9 h-9 rounded-lg bg-white/[0.08] text-white/70 flex items-center justify-center flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold">Terms of service</p>
              <p className="text-white/40 text-[11px] truncate">Account rules & usage</p>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-white/30"><path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v7h-7"/><path d="M3 10v11h11"/></svg>
          </a>
        </div>
      </div>

      {/* ── Platform-specific steps modal ──────────────────────── */}
      {openPlatform && (
        <div
          className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center"
          onClick={() => setOpenPlatform(null)}
        >
          <div
            className="w-full max-w-lg bg-[#0b0b0b] border border-white/[0.08] rounded-t-2xl sm:rounded-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
          >
            <div className="sticky top-0 bg-[#0b0b0b]/95 backdrop-blur-sm px-5 pt-5 pb-3 flex items-center gap-3 border-b border-white/[0.06]">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${PLATFORM_META[openPlatform].accent}26`, color: PLATFORM_META[openPlatform].accent }}
              >
                {PLATFORM_META[openPlatform].icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-[15px]">{PLATFORM_META[openPlatform].label}</p>
                <p className="text-white/40 text-[11px]">{PLATFORM_META[openPlatform].tagline}</p>
              </div>
              <button
                onClick={() => setOpenPlatform(null)}
                className="w-9 h-9 rounded-full flex items-center justify-center bg-white/[0.06] text-white/60 active:bg-white/10"
                aria-label="Close"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <ol className="px-5 py-4 space-y-3">
              {PLATFORM_META[openPlatform].steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span
                    className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
                    style={{ backgroundColor: `${PLATFORM_META[openPlatform].accent}33`, color: PLATFORM_META[openPlatform].accent }}
                  >
                    {i + 1}
                  </span>
                  <p className="text-white/75 text-[13px] leading-relaxed pt-[2px]">{step}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}
