'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
 * Web port of the Android Media3 ExoPlayer screen. Matches the native
 * phone player's layout, auto-hide, pill overlays, and transport stack
 * verbatim — only the underlying decoder differs (HLS.js / native HLS).
 * Stream URLs come from /api/video-source; the /api/stream/* proxy has
 * already rewritten #EXT-X-KEY to an inline `data:` URI so no custom
 * key loader is needed here.
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

// ─── utility helpers ──────────────────────────────────────────────────

function hexToKeyBytes(hex: string): Uint8Array {
  const clean = hex.trim().replace(/^0x/, '')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < clean.length; i += 2) out[i / 2] = parseInt(clean.substring(i, i + 2), 16)
  return out
}

function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0
  const total = Math.floor(sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

// Language codes come back from HLS as ISO-639-1/2 or BCP-47. Reduce
// to a two-letter badge (EN/HI/JA/…) like the Android top bar uses.
function badgeFromLang(lang: string | undefined | null): string {
  if (!lang) return '—'
  const clean = lang.split(/[-_]/)[0].toUpperCase()
  return clean.slice(0, 2)
}

// ─── icons (SVG inline, sized to match Android density) ──────────────

const I = {
  back: (p: React.SVGProps<SVGSVGElement>) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M15 19 8 12l7-7"/></svg>
  ),
  play: (p: React.SVGProps<SVGSVGElement>) => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M8 5v14l11-7z"/></svg>
  ),
  pause: (p: React.SVGProps<SVGSVGElement>) => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>
  ),
  replay10: (p: React.SVGProps<SVGSVGElement>) => (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/>
      <text x="12" y="16" fontSize="7" fontWeight="700" fill="currentColor" textAnchor="middle">10</text>
    </svg>
  ),
  forward10: (p: React.SVGProps<SVGSVGElement>) => (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M12 5V1l5 5-5 5V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z"/>
      <text x="12" y="16" fontSize="7" fontWeight="700" fill="currentColor" textAnchor="middle">10</text>
    </svg>
  ),
  skipNext: (p: React.SVGProps<SVGSVGElement>) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z"/></svg>
  ),
  playlist: (p: React.SVGProps<SVGSVGElement>) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M3 10h11v2H3zm0-4h11v2H3zm0 8h7v2H3zm13 0v6l5-3z"/></svg>
  ),
  cc: (p: React.SVGProps<SVGSVGElement>) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2m-8 7H9.5v-.5h-2v3h2V13H11v1a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1zm7 0h-1.5v-.5h-2v3h2V13H18v1a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1z"/></svg>
  ),
  speed: (p: React.SVGProps<SVGSVGElement>) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M20.4 7.6 18 10l-1.4-1.4L19 6.2A9 9 0 1 0 21 12h-2a7 7 0 1 1-1.4-4.2l-2.8 2.8L16 12l6-6zM11 8h2v6h-2z"/></svg>
  ),
  pip: (p: React.SVGProps<SVGSVGElement>) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M19 7h-8v6h8zm2-4H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2m0 16H3V5h18z"/></svg>
  ),
  lockOpen: (p: React.SVGProps<SVGSVGElement>) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M12 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4m6-7h-1V8a5 5 0 0 0-9.8-1.3l1.9.6A3 3 0 0 1 15 8v2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2m0 10H6v-8h12z"/></svg>
  ),
  lockClosed: (p: React.SVGProps<SVGSVGElement>) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2m-6 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4M9 8V6a3 3 0 0 1 6 0v2z"/></svg>
  ),
  close: (p: React.SVGProps<SVGSVGElement>) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...p}><path d="M18 6 6 18M6 6l12 12"/></svg>
  ),
  volume: (p: React.SVGProps<SVGSVGElement>) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.06A4.5 4.5 0 0 0 16.5 12M14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54"/></svg>
  ),
  sun: (p: React.SVGProps<SVGSVGElement>) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10m-7 5H2v0h3zm17 0h-3v0h3zM11 2h2v3h-2zm0 17h2v3h-2zM5.64 6.35 7.05 7.76l-1.41 1.41L4.23 7.76zm12.73 12.73-1.41-1.41 1.41-1.41 1.41 1.41zM17 7.05l1.41-1.41 1.41 1.41-1.41 1.41zM5.64 17.66l1.41-1.41 1.41 1.41L7.05 19z"/></svg>
  ),
}

// ─── Page ────────────────────────────────────────────────────────────

const AUTOHIDE_MS = 4000
const GESTURE_INDICATOR_MS = 900
const SEEK_STEP = 10 // seconds

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

  // ── refs
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const profileIdRef = useRef<string | null>(null)
  const resumeRef = useRef<number | null>(null)
  const autoHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gestureTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaveTs = useRef(0)
  const metaRef = useRef<PlayerMetadata | null>(null)
  const lastTapRef = useRef<{ t: number; x: number } | null>(null)
  const pinchStateRef = useRef<{ startDist: number; startScale: number } | null>(null)
  const autoNextTriggered = useRef(false)

  // ── state
  const [content, setContent] = useState<AdaptedContent | null>(null)
  const [seasons, setSeasons] = useState<SeasonHeader[]>([])
  const [episodes, setEpisodes] = useState<EpisodeTile[]>([])
  const [sheetSeason, setSheetSeason] = useState(season)
  const [sheetEpisodes, setSheetEpisodes] = useState<EpisodeTile[]>([])
  const [src, setSrc] = useState<string | null>(null)

  const [ready, setReady] = useState(false)
  const [keyHex, setKeyHex] = useState<string | null>(null)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffering, setBuffering] = useState(false)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [scrubTarget, setScrubTarget] = useState(0)

  const [playbackRate, setPlaybackRate] = useState(1)
  const [scale, setScale] = useState(1)
  const [locked, setLocked] = useState(false)
  const [audioLangs, setAudioLangs] = useState<string[]>([])
  const [activeAudio, setActiveAudio] = useState<string | null>(null)
  const [subsEnabled, setSubsEnabled] = useState(true)
  const [hasSubs, setHasSubs] = useState(false)
  const [episodesOpen, setEpisodesOpen] = useState(false)
  const [speedOpen, setSpeedOpen] = useState(false)

  const [gesture, setGesture] = useState<{ kind: 'volume' | 'brightness'; value: number } | null>(null)
  const [dimOverlay, setDimOverlay] = useState(0) // 0-0.6 — simulated brightness dim (CSS only)
  const brightnessRef = useRef(1) // 0.4–1.0 band; 1 == no dim
  const [showSkipIntro, setShowSkipIntro] = useState(false)
  const [showNextPrompt, setShowNextPrompt] = useState(false)
  const [hasNext, setHasNext] = useState(false)

  // ─── Load content + stream + episodes in parallel ────────────────
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
    return () => {
      cancelled = true
    }
  }, [id, type, season, episode, seasonNum, episodeNum])

  // Swap episodes list when user navigates the sheet to a different season.
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

    // Prefer hls.js everywhere it's supported. Chrome reports
    // `canPlayType('application/vnd.apple.mpegurl') === 'maybe'` even
    // though it can't actually play MSE-backed HLS natively — letting
    // that path through causes MEDIA_ERR_SRC_NOT_SUPPORTED.
    if (Hls.isSupported()) {
      // hls.js fetches key URIs via its loader chain. Our manifest
      // already inlines keys as `data:application/octet-stream;base64,…`
      // so the default loader works — but older hls.js builds choke on
      // that MIME type. A CustomLoader short-circuits those requests and
      // returns the raw key bytes from memory, matching how the Android
      // KeyRewritingDataSource feeds them to Media3.
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
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
        const tracks = hls.audioTracks || []
        const langs: string[] = []
        for (const t of tracks) if (t.lang && !langs.includes(t.lang)) langs.push(t.lang)
        setAudioLangs(langs)
        const cur = hls.audioTrack >= 0 ? tracks[hls.audioTrack]?.lang ?? null : null
        setActiveAudio(cur)
      })
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
        setHasSubs((hls.subtitleTracks || []).length > 0)
      })
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad()
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError()
        }
      })
      return () => {
        hls.destroy()
        hlsRef.current = null
      }
    }

    v.src = src
  }, [src, keyHex])

  // ─── Video event wiring ──────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const onPlay = () => setPlaying(true)
    const onPause = () => {
      setPlaying(false)
      save()
    }
    const onTime = () => {
      setCurrentTime(v.currentTime)
      // Skip markers
      const m = metaRef.current
      if (m?.skip_intro_start != null && m.skip_intro_end != null) {
        setShowSkipIntro(v.currentTime >= m.skip_intro_start && v.currentTime < m.skip_intro_end)
      }
      if (type === 'tv' && hasNext && isFinite(v.duration) && v.duration > 60) {
        const threshold = m?.credits_start ?? v.duration - 30
        setShowNextPrompt(v.currentTime >= threshold)
      }
      save()
    }
    const onDur = () => setDuration(v.duration || 0)
    const onWait = () => setBuffering(true)
    const onCanPlay = () => setBuffering(false)
    const onEnded = () => {
      save()
      if (type === 'tv' && hasNext && !autoNextTriggered.current) {
        autoNextTriggered.current = true
        router.replace(`/watch/tv/${id}?s=${season}&e=${episode + 1}`)
      }
    }

    const save = () => {
      const pid = profileIdRef.current
      if (!pid || !isFinite(v.duration) || v.duration < 10) return
      const now = Date.now()
      if (now - lastSaveTs.current < 10_000) return
      lastSaveTs.current = now
      saveProgress(buildPayload(pid, id, type, v.currentTime, v.duration, seasonNum, episodeNum))
    }

    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('durationchange', onDur)
    v.addEventListener('waiting', onWait)
    v.addEventListener('canplay', onCanPlay)
    v.addEventListener('playing', onCanPlay)
    v.addEventListener('ended', onEnded)
    return () => {
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('durationchange', onDur)
      v.removeEventListener('waiting', onWait)
      v.removeEventListener('canplay', onCanPlay)
      v.removeEventListener('playing', onCanPlay)
      v.removeEventListener('ended', onEnded)
    }
  }, [id, type, season, episode, seasonNum, episodeNum, hasNext, router])

  // ─── Apply resume once metadata loads ────────────────────────────
  useEffect(() => {
    const v = videoRef.current
    if (!v || !ready) return
    const onLoaded = () => {
      const t = resumeRef.current
      if (t != null && t > 5) v.currentTime = t
      v.play().catch(() => {})
      v.removeEventListener('loadedmetadata', onLoaded)
    }
    v.addEventListener('loadedmetadata', onLoaded)
    return () => v.removeEventListener('loadedmetadata', onLoaded)
  }, [ready])

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

  // ─── Auto-hide controls ──────────────────────────────────────────
  const bumpControls = useCallback(() => {
    setControlsVisible(true)
    if (autoHideTimer.current) clearTimeout(autoHideTimer.current)
    autoHideTimer.current = setTimeout(() => {
      // Keep visible while paused, scrubbing, or any sheet is open.
      if (!videoRef.current?.paused && !isScrubbing && !episodesOpen && !speedOpen) {
        setControlsVisible(false)
      }
    }, AUTOHIDE_MS)
  }, [isScrubbing, episodesOpen, speedOpen])

  useEffect(() => {
    bumpControls()
    return () => { if (autoHideTimer.current) clearTimeout(autoHideTimer.current) }
  }, [bumpControls])

  // ─── Orientation + fullscreen request on entry ───────────────────
  useEffect(() => {
    const orient = screen.orientation as unknown as
      | { lock?: (o: string) => Promise<void>; unlock?: () => void }
      | undefined
    orient?.lock?.('landscape').catch(() => {})
    // Fullscreen on first user gesture handled via the play button below;
    // browsers reject programmatic requestFullscreen without a gesture.
    return () => {
      orient?.unlock?.()
    }
  }, [])

  // ─── Transport actions ───────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      v.play().catch(() => {})
      // Try fullscreen + landscape on the first user gesture.
      const el = stageRef.current
      if (el && !document.fullscreenElement) el.requestFullscreen().catch(() => {})
    } else v.pause()
    bumpControls()
  }, [bumpControls])

  const seekBy = useCallback((delta: number) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = Math.max(0, Math.min((v.duration || 0) - 0.5, v.currentTime + delta))
    bumpControls()
  }, [bumpControls])

  const onSkipIntro = () => {
    const v = videoRef.current
    const end = metaRef.current?.skip_intro_end
    if (!v || end == null) return
    v.currentTime = end
    setShowSkipIntro(false)
  }

  const onNextEpisode = () => {
    if (!hasNext) return
    router.replace(`/watch/tv/${id}?s=${season}&e=${episode + 1}`)
  }

  const cycleAudio = () => {
    const hls = hlsRef.current
    if (!hls || audioLangs.length < 2) return
    const curIdx = audioLangs.findIndex((l) => l === activeAudio)
    const nextLang = audioLangs[(curIdx + 1) % audioLangs.length]
    const trackIdx = (hls.audioTracks || []).findIndex((t) => t.lang === nextLang)
    if (trackIdx >= 0) {
      hls.audioTrack = trackIdx
      setActiveAudio(nextLang)
    }
  }

  const toggleSubs = () => {
    const v = videoRef.current
    const hls = hlsRef.current
    const next = !subsEnabled
    setSubsEnabled(next)
    if (hls) {
      hls.subtitleDisplay = next
      if (next && hls.subtitleTrack < 0 && (hls.subtitleTracks || []).length > 0) hls.subtitleTrack = 0
      else if (!next) hls.subtitleTrack = -1
    }
    // Safari native path — toggle TextTrack mode.
    if (v?.textTracks) {
      for (let i = 0; i < v.textTracks.length; i++) v.textTracks[i].mode = next ? 'showing' : 'disabled'
    }
  }

  const togglePip = async () => {
    const v = videoRef.current
    if (!v) return
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else await v.requestPictureInPicture()
    } catch {}
  }

  const setSpeed = (rate: number) => {
    setPlaybackRate(rate)
    if (videoRef.current) videoRef.current.playbackRate = rate
    setSpeedOpen(false)
    bumpControls()
  }

  // ─── Gestures ────────────────────────────────────────────────────
  const flashGesture = (kind: 'volume' | 'brightness', value: number) => {
    setGesture({ kind, value })
    if (gestureTimer.current) clearTimeout(gestureTimer.current)
    gestureTimer.current = setTimeout(() => setGesture(null), GESTURE_INDICATOR_MS)
  }

  const dragStateRef = useRef<{
    kind: 'none' | 'vswipe-left' | 'vswipe-right' | 'pinch' | 'tap'
    startX: number
    startY: number
    startVol: number
    startBright: number
    moved: boolean
  } | null>(null)

  const onStageTouchStart = (e: React.TouchEvent) => {
    if (locked) return
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]]
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      pinchStateRef.current = { startDist: dist, startScale: scale }
      dragStateRef.current = { kind: 'pinch', startX: 0, startY: 0, startVol: 0, startBright: 0, moved: true }
      return
    }
    const t = e.touches[0]
    dragStateRef.current = {
      kind: 'tap',
      startX: t.clientX,
      startY: t.clientY,
      startVol: videoRef.current?.volume ?? 1,
      startBright: brightnessRef.current,
      moved: false,
    }
  }

  const onStageTouchMove = (e: React.TouchEvent) => {
    if (locked) return
    const drag = dragStateRef.current
    if (!drag) return

    if (drag.kind === 'pinch' && e.touches.length === 2 && pinchStateRef.current) {
      const [a, b] = [e.touches[0], e.touches[1]]
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      const next = Math.max(1, Math.min(2.5, (pinchStateRef.current.startScale * dist) / pinchStateRef.current.startDist))
      setScale(next)
      return
    }

    const t = e.touches[0]
    const dx = t.clientX - drag.startX
    const dy = t.clientY - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) > 12) {
      drag.moved = true
      if (Math.abs(dy) > Math.abs(dx)) {
        const w = stageRef.current?.clientWidth ?? window.innerWidth
        const isLeft = drag.startX < w / 2
        drag.kind = isLeft ? 'vswipe-left' : 'vswipe-right'
      }
    }
    if (drag.kind === 'vswipe-right') {
      const stageH = stageRef.current?.clientHeight ?? window.innerHeight
      const next = Math.max(0, Math.min(1, drag.startVol - dy / stageH))
      if (videoRef.current) videoRef.current.volume = next
      flashGesture('volume', next)
    } else if (drag.kind === 'vswipe-left') {
      const stageH = stageRef.current?.clientHeight ?? window.innerHeight
      const next = Math.max(0.4, Math.min(1, drag.startBright - dy / stageH))
      brightnessRef.current = next
      setDimOverlay(1 - next)
      flashGesture('brightness', (next - 0.4) / 0.6)
    }
  }

  const onStageTouchEnd = (e: React.TouchEvent) => {
    if (locked) return
    const drag = dragStateRef.current
    if (!drag) return

    if (!drag.moved && e.changedTouches.length === 1) {
      // Double-tap detection: if a second tap lands within 260ms and close
      // horizontally to the first, apply a ±10s seek; else treat as single
      // tap → toggle controls.
      const t = e.changedTouches[0]
      const now = Date.now()
      const prev = lastTapRef.current
      const w = stageRef.current?.clientWidth ?? window.innerWidth
      const leftHalf = t.clientX < w / 2
      if (prev && now - prev.t < 260) {
        seekBy(leftHalf ? -SEEK_STEP : SEEK_STEP)
        lastTapRef.current = null
      } else {
        lastTapRef.current = { t: now, x: t.clientX }
        setTimeout(() => {
          if (lastTapRef.current && lastTapRef.current.t === now) {
            // It was a single tap
            lastTapRef.current = null
            if (controlsVisible) setControlsVisible(false)
            else bumpControls()
          }
        }, 260)
      }
    }
    pinchStateRef.current = null
    dragStateRef.current = null
  }

  // Mouse (desktop) — single click toggles controls.
  const onStageClick = (e: React.MouseEvent) => {
    if (locked) return
    // Ignore clicks that bubble from control buttons or sheets.
    if ((e.target as HTMLElement).closest('[data-ui]')) return
    if (controlsVisible) setControlsVisible(false)
    else bumpControls()
  }

  // ─── Scrub bar ───────────────────────────────────────────────────
  const onScrubChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = parseFloat(e.target.value)
    setScrubTarget(n)
    setIsScrubbing(true)
    bumpControls()
  }

  const onScrubCommit = () => {
    const v = videoRef.current
    if (v) v.currentTime = scrubTarget
    setIsScrubbing(false)
    bumpControls()
  }

  // ─── Derived ─────────────────────────────────────────────────────
  const title = content?.title ?? ''
  const subtitle = type === 'tv' ? `S${season} · E${episode}` : ''
  const displayTime = isScrubbing ? scrubTarget : currentTime
  const progressPct = duration > 0 ? (displayTime / duration) * 100 : 0
  const remaining = Math.max(0, duration - displayTime)
  const audioBadge = badgeFromLang(activeAudio ?? audioLangs[0])

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <div
      ref={stageRef}
      className="fixed inset-0 bg-black overflow-hidden select-none"
      onClick={onStageClick}
      onTouchStart={onStageTouchStart}
      onTouchMove={onStageTouchMove}
      onTouchEnd={onStageTouchEnd}
      style={{ touchAction: 'none' }}
    >
      {/* Video */}
      <video
        ref={videoRef}
        className="w-full h-full bg-black"
        playsInline
        autoPlay
        controls={false}
        style={{ transform: `scale(${scale})`, transformOrigin: 'center center', transition: 'transform 120ms linear' }}
      />
      {/* Simulated brightness dim */}
      {dimOverlay > 0 && (
        <div className="pointer-events-none absolute inset-0" style={{ background: `rgba(0,0,0,${dimOverlay.toFixed(3)})` }} />
      )}

      {/* Buffering spinner */}
      {buffering && !isScrubbing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-10 h-10 rounded-full border-[3px] border-white/20 border-t-[#e50914] animate-spin" />
        </div>
      )}

      {/* Gesture indicator */}
      {gesture && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-black/65">
          <div className="text-white">
            {gesture.kind === 'volume' ? <I.volume /> : <I.sun />}
          </div>
          <div className="h-[4px] w-[120px] rounded-full bg-white/20 overflow-hidden">
            <div className="h-full bg-white" style={{ width: `${Math.round(gesture.value * 100)}%` }} />
          </div>
          <span className="text-white text-xs font-bold w-8 text-right">{Math.round(gesture.value * 100)}%</span>
        </div>
      )}

      {/* Scrim while controls visible */}
      {controlsVisible && !locked && (
        <div className="pointer-events-none absolute inset-0 bg-black/35 transition-opacity duration-200" data-ui />
      )}

      {/* ────────── Top bar ────────── */}
      {!locked && (
        <div
          className={`absolute top-0 left-0 right-0 transition-opacity duration-200 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          data-ui
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 px-4 pt-3 pb-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
            <button
              onClick={() => router.back()}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white active:bg-white/10"
              aria-label="Back"
            >
              <I.back />
            </button>
            <div className="flex-1 min-w-0 ml-1">
              <div className="text-white text-sm font-bold truncate">{title}</div>
              {subtitle && <div className="text-white/70 text-[11px] truncate">{subtitle}</div>}
            </div>
            {/* Right-side controls */}
            {type === 'tv' && episodes.length > 0 && (
              <button
                onClick={() => setEpisodesOpen(true)}
                className="w-10 h-10 rounded-full flex items-center justify-center text-white active:bg-white/10"
                aria-label="Episodes"
              >
                <I.playlist />
              </button>
            )}
            {hasNext && (
              <button
                onClick={onNextEpisode}
                className="w-10 h-10 rounded-full flex items-center justify-center text-white active:bg-white/10"
                aria-label="Next episode"
              >
                <I.skipNext />
              </button>
            )}
            {audioLangs.length > 1 && (
              <button
                onClick={cycleAudio}
                className="h-9 min-w-9 px-2.5 rounded-full flex items-center justify-center text-white text-[11px] font-bold tracking-wider active:bg-white/10"
                aria-label="Change audio"
              >
                {audioBadge}
              </button>
            )}
            {hasSubs && (
              <button
                onClick={toggleSubs}
                className={`relative w-10 h-10 rounded-full flex items-center justify-center active:bg-white/10 ${subsEnabled ? 'text-[#e50914]' : 'text-white'}`}
                aria-label="Subtitles"
              >
                <I.cc />
                {subsEnabled && <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-4 h-[2px] bg-[#e50914] rounded-full" />}
              </button>
            )}
            <button
              onClick={() => setSpeedOpen(true)}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white active:bg-white/10"
              aria-label="Speed"
            >
              <I.speed />
            </button>
            {typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && (
              <button
                onClick={togglePip}
                className="w-10 h-10 rounded-full flex items-center justify-center text-white active:bg-white/10"
                aria-label="Picture in picture"
              >
                <I.pip />
              </button>
            )}
            <button
              onClick={() => setLocked(true)}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white active:bg-white/10"
              aria-label="Lock controls"
            >
              <I.lockOpen />
            </button>
          </div>
        </div>
      )}

      {/* ────────── Bottom bar ────────── */}
      {!locked && (
        <div
          className={`absolute bottom-0 left-0 right-0 transition-opacity duration-200 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          data-ui
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-5 pt-2 pb-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)' }}>
            {/* Scrubber row */}
            <div className="flex items-center gap-3 mb-2">
              <span className="text-white text-[11px] font-bold tabular-nums w-12 text-left">{fmtTime(displayTime)}</span>
              <div className="relative flex-1 h-[14px] flex items-center">
                {/* Track background */}
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-white/25" />
                {/* Progress fill */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-[#e50914]"
                  style={{ left: 0, width: `${progressPct}%` }}
                />
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, duration)}
                  step={0.1}
                  value={displayTime}
                  onChange={onScrubChange}
                  onMouseUp={onScrubCommit}
                  onTouchEnd={onScrubCommit}
                  onKeyUp={onScrubCommit}
                  className="scrubber absolute inset-0 w-full appearance-none bg-transparent"
                />
              </div>
              <span className="text-white text-[11px] font-bold tabular-nums w-12 text-right">-{fmtTime(remaining)}</span>
            </div>

            {/* Transport row */}
            <div className="flex items-center justify-center gap-9">
              <TransportButton label="" onClick={() => seekBy(-SEEK_STEP)} ariaLabel="Back 10 seconds">
                <I.replay10 />
              </TransportButton>
              <button
                onClick={togglePlay}
                aria-label={playing ? 'Pause' : 'Play'}
                className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center active:bg-white/80"
              >
                {playing ? <I.pause /> : <I.play />}
              </button>
              <TransportButton label="" onClick={() => seekBy(SEEK_STEP)} ariaLabel="Forward 10 seconds">
                <I.forward10 />
              </TransportButton>
              {hasNext && (
                <TransportButton label="" onClick={onNextEpisode} ariaLabel="Next episode">
                  <I.skipNext />
                </TransportButton>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ────────── Skip intro pill ────────── */}
      {showSkipIntro && !locked && (
        <button
          onClick={onSkipIntro}
          className="absolute right-6 bottom-[96px] bg-white/[0.92] text-black font-bold text-[13px] rounded-[10px] px-5 py-[11px] flex items-center gap-1.5 active:bg-white/80"
          data-ui
          onClickCapture={(e) => e.stopPropagation()}
        >
          <I.skipNext />
          Skip Intro
        </button>
      )}

      {/* ────────── Next episode pill ────────── */}
      {showNextPrompt && hasNext && !showSkipIntro && !locked && (
        <button
          onClick={onNextEpisode}
          className="absolute right-6 bottom-[96px] bg-white/[0.92] text-black font-bold text-[13px] rounded-[10px] px-5 py-[11px] flex items-center gap-1.5 active:bg-white/80"
          data-ui
          onClickCapture={(e) => e.stopPropagation()}
        >
          <I.skipNext />
          Next Episode
        </button>
      )}

      {/* ────────── Lock-only unlock button ────────── */}
      {locked && (
        <button
          onClick={() => { setLocked(false); bumpControls() }}
          className="absolute top-4 left-4 w-12 h-12 rounded-full bg-black/60 backdrop-blur text-white flex items-center justify-center"
          aria-label="Unlock controls"
          data-ui
          onClickCapture={(e) => e.stopPropagation()}
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
        >
          <I.lockClosed />
        </button>
      )}

      {/* ────────── Speed sheet ────────── */}
      {speedOpen && (
        <div
          className="absolute inset-0 z-20 bg-black/60 flex items-end justify-center"
          data-ui
          onClick={() => setSpeedOpen(false)}
        >
          <div
            className="w-full max-w-md bg-[#0b0b0b] border-t border-white/[0.08] rounded-t-2xl p-4 pb-6"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-bold text-sm">Playback speed</h3>
              <button onClick={() => setSpeedOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 active:bg-white/10"><I.close /></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                <button
                  key={r}
                  onClick={() => setSpeed(r)}
                  className={`py-3 rounded-xl text-sm font-bold ${playbackRate === r ? 'bg-[#e50914] text-white' : 'bg-white/[0.06] text-white/80 active:bg-white/[0.12]'}`}
                >
                  {r}x
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ────────── Episodes sheet (right drawer on wide, bottom sheet on mobile) ────────── */}
      {episodesOpen && (
        <div
          className="absolute inset-0 z-20 bg-black/60 flex justify-end"
          data-ui
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
              >
                <I.close />
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
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center ${active ? 'bg-[#e50914] text-white' : 'bg-black/55 text-white'}`}>
                          {active && playing ? <I.pause width={14} height={14}/> : <I.play width={14} height={14}/>}
                        </div>
                      </div>
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

      <style jsx>{`
        .scrubber {
          margin: 0;
          padding: 0;
          height: 14px;
          cursor: pointer;
        }
        .scrubber::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          height: 14px;
          width: 14px;
          border-radius: 999px;
          background: #e50914;
          border: 0;
          box-shadow: 0 0 0 3px rgba(229, 9, 20, 0.25);
        }
        .scrubber::-moz-range-thumb {
          height: 14px;
          width: 14px;
          border-radius: 999px;
          background: #e50914;
          border: 0;
          box-shadow: 0 0 0 3px rgba(229, 9, 20, 0.25);
        }
        .scrubber::-webkit-slider-runnable-track {
          background: transparent;
          height: 14px;
        }
        .scrubber::-moz-range-track {
          background: transparent;
          height: 14px;
        }
      `}</style>
    </div>
  )
}

function TransportButton({
  label,
  onClick,
  ariaLabel,
  children,
}: {
  label?: string
  onClick: () => void
  ariaLabel: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className="w-12 h-12 rounded-full flex flex-col items-center justify-center text-white active:bg-white/10"
    >
      {children}
      {label && <span className="text-[10px] font-bold mt-0.5">{label}</span>}
    </button>
  )
}
