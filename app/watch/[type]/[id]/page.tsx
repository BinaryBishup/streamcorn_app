'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Hls from 'hls.js'
import {
  beaconProgress,
  buildPayload,
  getResumePosition,
  saveProgress,
} from '@/lib/watch-progress'
import type { AdaptedContent, EpisodeRow, SeasonHeader } from '@/lib/content-adapter'

/**
 * Watch page. Uses the native <video controls> surface for scrubber,
 * volume, speed, audio/subtitle pickers, fullscreen, and mobile
 * double-tap-to-seek. A thin custom overlay on top adds the product
 * flair the browser controls can't: back button, title + season/episode
 * label, Episodes drawer (series), Next Episode, and Skip Intro.
 *
 * Stream source comes from /api/video-source. AES-128 keys are fed to
 * hls.js inline via a CustomLoader that short-circuits key requests
 * with bytes from memory — same strategy the Android Media3 build uses.
 */

interface EpisodeTile {
  id: string
  episode_number: number
  name: string | null
  description: string | null
  thumbnail_image: string | null
  duration_sec: number | null
}

interface PlayerMetadata {
  skip_intro_start: number | null
  skip_intro_end: number | null
  skip_recap_end: number | null
  credits_start: number | null
  next_episode_prompt: number | null
  completion_threshold: number | null
}

function hexToKeyBytes(hex: string): Uint8Array {
  const clean = hex.trim().replace(/^0x/, '')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < clean.length; i += 2) out[i / 2] = parseInt(clean.substring(i, i + 2), 16)
  return out
}

export default function WatchPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const type = params.type as 'movie' | 'tv'
  const id = params.id as string
  const season = parseInt(searchParams.get('s') || '1', 10)
  const episode = parseInt(searchParams.get('e') || '1', 10)
  const seasonNum = type === 'tv' ? season : undefined
  const episodeNum = type === 'tv' ? episode : undefined

  // ─── refs ───────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const profileIdRef = useRef<string | null>(null)
  const resumeRef = useRef<number | null>(null)
  const lastSaveTs = useRef(0)
  const metaRef = useRef<PlayerMetadata | null>(null)
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoNextTriggered = useRef(false)

  // ─── state ──────────────────────────────────────────────────────
  const [content, setContent] = useState<AdaptedContent | null>(null)
  const [seasons, setSeasons] = useState<SeasonHeader[]>([])
  const [episodes, setEpisodes] = useState<EpisodeTile[]>([])
  const [sheetSeason, setSheetSeason] = useState(season)
  const [sheetEpisodes, setSheetEpisodes] = useState<EpisodeTile[]>([])
  const [src, setSrc] = useState<string | null>(null)
  const [keyHex, setKeyHex] = useState<string | null>(null)
  const [hasNext, setHasNext] = useState(false)
  const [ready, setReady] = useState(false)

  const [overlayVisible, setOverlayVisible] = useState(true)
  const [episodesOpen, setEpisodesOpen] = useState(false)
  const [showSkipIntro, setShowSkipIntro] = useState(false)

  // ─── Load content + stream + episodes ────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function load() {
      const pid = localStorage.getItem('streamcorn_profile_id')
      profileIdRef.current = pid

      const qp = new URLSearchParams({ content_id: id, type })
      if (type === 'tv') {
        qp.set('season_number', String(season))
        qp.set('episode_number', String(episode))
      }

      const [contentRes, srcRes, resume, episodeRes] = await Promise.all([
        fetch(`/api/content/${id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/video-source?${qp}`).then((r) => r.json()).catch(() => ({})),
        pid ? getResumePosition(pid, id, type, seasonNum, episodeNum) : null,
        type === 'tv'
          ? fetch(`/api/episodes?content_id=${id}&s=${season}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
          : Promise.resolve(null),
      ])

      if (cancelled) return

      setContent(contentRes?.content ?? null)
      setSeasons(contentRes?.seasons ?? [])
      setSrc(srcRes?.url || null)
      setKeyHex(srcRes?.encryptionKeyHex || null)
      resumeRef.current = resume
      metaRef.current = srcRes?.metadata || null

      if (type === 'tv' && episodeRes?.episodes) {
        const eps: EpisodeTile[] = (episodeRes.episodes as EpisodeRow[]).map((e) => ({
          id: e.id,
          episode_number: e.episode_number,
          name: e.name,
          description: e.description,
          thumbnail_image: e.thumbnail_image,
          duration_sec: e.duration_sec,
        }))
        setEpisodes(eps)
        setSheetEpisodes(eps)
        setSheetSeason(season)
        setHasNext(eps.findIndex((e) => e.episode_number === episode) < eps.length - 1)
      }
      setReady(true)
    }

    load()
    return () => { cancelled = true }
  }, [id, type, season, episode, seasonNum, episodeNum])

  // Swap episode list when user picks a different season in the sheet
  useEffect(() => {
    if (type !== 'tv' || sheetSeason === season) {
      setSheetEpisodes(episodes)
      return
    }
    fetch(`/api/episodes?content_id=${id}&s=${sheetSeason}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.episodes) return
        setSheetEpisodes(
          (d.episodes as EpisodeRow[]).map((e) => ({
            id: e.id,
            episode_number: e.episode_number,
            name: e.name,
            description: e.description,
            thumbnail_image: e.thumbnail_image,
            duration_sec: e.duration_sec,
          })),
        )
      })
      .catch(() => {})
  }, [sheetSeason, type, id, season, episodes])

  // ─── HLS attach ──────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current
    if (!v || !src) return

    // Prefer hls.js where supported. Chrome reports `canPlayType()` as
    // "maybe" for HLS without actually supporting MSE-backed HLS, so
    // checking Hls.isSupported() first is the reliable path.
    if (Hls.isSupported()) {
      const keyBytes = keyHex ? hexToKeyBytes(keyHex) : null

      /* eslint-disable @typescript-eslint/no-explicit-any */
      const CustomLoader = class extends Hls.DefaultConfig.loader {
        load(context: any, config: any, callbacks: any) {
          const url: string = context?.url ?? ''
          const isKey =
            !!context?.keyInfo ||
            context?.type === 'key' ||
            url.startsWith('data:application/octet-stream') ||
            url.startsWith('data:text/plain') ||
            url.includes('/stream-key/') ||
            url.includes('/api/hls-key')
          if (isKey && keyBytes) {
            const t = performance.now()
            setTimeout(() => {
              callbacks.onSuccess(
                { url, data: keyBytes.buffer.slice(0) },
                { trequest: t, tfirst: t, tload: t, loaded: 16, total: 16, aborted: false, retry: 0, chunkCount: 0, bwEstimate: 0, parsing: { start: t, end: t }, buffering: { start: t, end: t, first: t }, loading: { start: t, end: t, first: t } },
                context,
                null,
              )
            }, 0)
            return
          }
          super.load(context, config, callbacks)
        }
      }
      /* eslint-enable @typescript-eslint/no-explicit-any */

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 90,
        maxMaxBufferLength: 180,
        backBufferLength: 30,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        loader: CustomLoader as any,
      })
      hls.loadSource(src)
      hls.attachMedia(v)
      hlsRef.current = hls
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad()
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError()
      })
      return () => {
        hls.destroy()
        hlsRef.current = null
      }
    }

    // Safari / iOS — native HLS. The manifest already inlines `data:`
    // key URIs so WebKit handles decryption without our help.
    v.src = src
  }, [src, keyHex])

  // ─── Autoplay unmuted; fall back silently to muted if blocked ───
  useEffect(() => {
    const v = videoRef.current
    if (!v || !ready) return

    const onLoaded = async () => {
      const t = resumeRef.current
      if (t != null && t > 5) v.currentTime = t
      v.muted = false
      try {
        await v.play()
      } catch {
        // Autoplay policy rejected sound — keep picture by muting and
        // retrying silently. No visible affordance.
        v.muted = true
        v.play().catch(() => {})
      }
      v.removeEventListener('loadedmetadata', onLoaded)
    }
    v.addEventListener('loadedmetadata', onLoaded)
    return () => v.removeEventListener('loadedmetadata', onLoaded)
  }, [ready])

  // ─── Watch-progress events (save + skip markers + auto-advance) ─
  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const save = () => {
      const pid = profileIdRef.current
      if (!pid || !isFinite(v.duration) || v.duration < 10) return
      const now = Date.now()
      if (now - lastSaveTs.current < 10_000) return
      lastSaveTs.current = now
      saveProgress(buildPayload(pid, id, type, v.currentTime, v.duration, seasonNum, episodeNum))
    }

    const onTime = () => {
      const m = metaRef.current
      if (m?.skip_intro_start != null && m.skip_intro_end != null) {
        setShowSkipIntro(v.currentTime >= m.skip_intro_start && v.currentTime < m.skip_intro_end)
      }
      save()
    }
    const onPause = () => save()
    const onSeeked = () => save()
    const onEnded = () => {
      save()
      if (type === 'tv' && hasNext && !autoNextTriggered.current) {
        autoNextTriggered.current = true
        router.replace(`/watch/tv/${id}?s=${season}&e=${episode + 1}`)
      }
    }

    v.addEventListener('timeupdate', onTime)
    v.addEventListener('pause', onPause)
    v.addEventListener('seeked', onSeeked)
    v.addEventListener('ended', onEnded)
    return () => {
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('seeked', onSeeked)
      v.removeEventListener('ended', onEnded)
    }
  }, [id, type, season, episode, seasonNum, episodeNum, hasNext, router])

  // ─── Beacon save on hide/unload ─────────────────────────────────
  useEffect(() => {
    const beacon = () => {
      const v = videoRef.current
      const pid = profileIdRef.current
      if (!v || !pid || !isFinite(v.duration) || v.duration < 10 || v.currentTime < 5) return
      beaconProgress(buildPayload(pid, id, type, v.currentTime, v.duration, seasonNum, episodeNum))
    }
    const onVis = () => { if (document.visibilityState === 'hidden') beacon() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', beacon)
    window.addEventListener('beforeunload', beacon)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', beacon)
      window.removeEventListener('beforeunload', beacon)
    }
  }, [id, type, seasonNum, episodeNum])

  // Bump the overlay back into view, auto-hide after 3.5s.
  const bumpOverlay = useCallback(() => {
    setOverlayVisible(true)
    if (overlayTimer.current) clearTimeout(overlayTimer.current)
    overlayTimer.current = setTimeout(() => setOverlayVisible(false), 3500)
  }, [])

  useEffect(() => {
    bumpOverlay()
    return () => { if (overlayTimer.current) clearTimeout(overlayTimer.current) }
  }, [bumpOverlay])

  // Release the orientation lock when leaving the screen.
  useEffect(() => {
    return () => {
      try {
        const orient = screen.orientation as unknown as
          | { unlock?: () => void }
          | undefined
        orient?.unlock?.()
      } catch {}
    }
  }, [])

  // ─── Actions ─────────────────────────────────────────────────────
  const onSkipIntro = () => {
    const v = videoRef.current
    const end = metaRef.current?.skip_intro_end
    if (!v || end == null) return
    v.currentTime = end
    setShowSkipIntro(false)
    bumpOverlay()
  }

  const onNextEpisode = () => {
    if (!hasNext) return
    router.replace(`/watch/tv/${id}?s=${season}&e=${episode + 1}`)
  }

  // ─── Render ──────────────────────────────────────────────────────
  const title = content?.title ?? ''
  const subtitle = type === 'tv' ? `S${season} · E${episode}` : ''

  return (
    <div
      ref={stageRef}
      className="watch-stage fixed inset-0 bg-black overflow-hidden"
      onMouseMove={bumpOverlay}
      onTouchStart={bumpOverlay}
    >
      {/* Native video with native controls */}
      <video
        ref={videoRef}
        className="watch-video w-full h-full bg-black"
        playsInline
        autoPlay
        controls
        controlsList="nodownload nofullscreen"
        disablePictureInPicture={false}
      />

      {/* Back button — always visible, bypasses the auto-hide */}
      <button
        onClick={() => router.back()}
        className={`absolute left-3 z-20 w-10 h-10 rounded-full bg-black/55 backdrop-blur text-white flex items-center justify-center active:bg-black/75 transition-opacity duration-200 ${overlayVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        aria-label="Back"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round"><path d="M15 19 8 12l7-7"/></svg>
      </button>

      {/* Title + S·E label */}
      <div
        className={`absolute top-0 left-16 right-24 z-10 pt-3 pb-2 px-3 transition-opacity duration-200 pointer-events-none ${overlayVisible ? 'opacity-100' : 'opacity-0'}`}
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)' }}
      >
        <div className="text-white text-sm font-bold truncate drop-shadow">{title}</div>
        {subtitle && <div className="text-white/70 text-[11px] truncate drop-shadow">{subtitle}</div>}
      </div>

      {/* Top-right custom actions (Episodes + Next) */}
      <div
        className={`absolute right-3 z-20 flex items-center gap-2 transition-opacity duration-200 ${overlayVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        {type === 'tv' && episodes.length > 0 && (
          <button
            onClick={() => setEpisodesOpen(true)}
            className="h-10 px-3 rounded-full bg-black/55 backdrop-blur text-white text-xs font-bold flex items-center gap-1.5 active:bg-black/75"
            aria-label="Episodes"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 10h11v2H3zm0-4h11v2H3zm0 8h7v2H3zm13 0v6l5-3z"/></svg>
            Episodes
          </button>
        )}
        {hasNext && (
          <button
            onClick={onNextEpisode}
            className="h-10 px-3 rounded-full bg-black/55 backdrop-blur text-white text-xs font-bold flex items-center gap-1.5 active:bg-black/75"
            aria-label="Next episode"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z"/></svg>
            Next
          </button>
        )}
      </div>

      {/* Skip Intro — sits above the native controls */}
      {showSkipIntro && (
        <button
          onClick={onSkipIntro}
          className="absolute right-4 bottom-[76px] z-20 bg-white/[0.92] text-black font-bold text-[13px] rounded-[10px] px-4 py-2.5 flex items-center gap-1.5 active:bg-white/80"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z"/></svg>
          Skip Intro
        </button>
      )}

      {/* Episodes sheet */}
      {episodesOpen && (
        <div
          className="absolute inset-0 z-30 bg-black/60 flex justify-end"
          onClick={() => setEpisodesOpen(false)}
        >
          <div
            className="bg-[#0b0b0b] border-l border-white/[0.08] w-full sm:w-[420px] max-h-full flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-[#0b0b0b]/95 backdrop-blur px-4 py-3 border-b border-white/[0.06] flex items-center gap-3">
              <h3 className="flex-1 text-white font-bold text-base">Episodes</h3>
              <button
                onClick={() => setEpisodesOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 active:bg-white/10"
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            {seasons.length > 1 && (
              <div className="px-4 py-3 flex gap-2 overflow-x-auto scrollbar-hide border-b border-white/[0.06]">
                {seasons.map((s) => (
                  <button
                    key={s.season_number}
                    onClick={() => setSheetSeason(s.season_number)}
                    className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold ${sheetSeason === s.season_number ? 'bg-white text-black' : 'bg-white/[0.08] text-white/70 active:bg-white/[0.14]'}`}
                  >
                    {s.name || `Season ${s.season_number}`}
                  </button>
                ))}
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
              {sheetEpisodes.map((ep) => {
                const active = ep.episode_number === episode && sheetSeason === season
                const mins = ep.duration_sec ? Math.round(ep.duration_sec / 60) : null
                return (
                  <button
                    key={ep.id}
                    onClick={() => {
                      setEpisodesOpen(false)
                      router.replace(`/watch/tv/${id}?s=${sheetSeason}&e=${ep.episode_number}`)
                    }}
                    className={`w-full flex gap-3 p-2 rounded-xl text-left ${active ? 'bg-[#e50914]/15 border border-[#e50914]/30' : 'bg-white/[0.03] active:bg-white/[0.06] border border-transparent'}`}
                  >
                    <div className="relative w-[110px] aspect-video flex-shrink-0 rounded-lg overflow-hidden bg-[#1a1a1a]">
                      {ep.thumbnail_image ? (
                        <img src={ep.thumbnail_image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/25 text-sm">{ep.episode_number}</div>
                      )}
                      {active && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-7 h-7 rounded-full bg-[#e50914] flex items-center justify-center text-white">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 py-0.5">
                      <div className="flex items-baseline gap-2">
                        <span className="text-white text-[13px] font-bold truncate">
                          {ep.episode_number}. {ep.name || 'Episode'}
                        </span>
                        {mins && <span className="text-white/40 text-[11px] flex-shrink-0">{mins}m</span>}
                      </div>
                      {ep.description && (
                        <p className="text-white/55 text-[11px] line-clamp-2 mt-0.5 leading-snug">{ep.description}</p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* CSS rotate fallback for devices (iOS) that ignore
          screen.orientation.lock. Rotates the whole stage so the video
          always renders in landscape regardless of physical orientation. */}
      <style jsx>{`
        /* Fill the stage — no letterboxing. */
        .watch-video {
          object-fit: cover;
        }
        /* Suppress native fullscreen and any overflow menu that exposes
           fullscreen; our stage is already fullscreen-on-first-tap and
           the CSS rotation handles portrait devices. */
        :global(.watch-video::-webkit-media-controls-fullscreen-button),
        :global(.watch-video::-webkit-media-controls-overflow-button),
        :global(.watch-video::-webkit-media-controls-overflow-menu-button) {
          display: none !important;
        }
        /* Force-landscape for phones held in portrait. */
        @media (orientation: portrait) and (max-width: 768px) {
          .watch-stage {
            width: 100vh;
            height: 100vw;
            transform: rotate(90deg) translateY(-100vw);
            transform-origin: top left;
            position: fixed;
            top: 0;
            left: 0;
          }
        }
      `}</style>
    </div>
  )
}
