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
 * Watch page — native <video controls> plus a thin custom overlay.
 *
 * Native controls carry play/pause and the scrubber only; every other
 * WebKit-native button (volume, fullscreen, overflow, pip, download)
 * is hidden via CSS so the surface is consistent across browsers.
 *
 * Our overlay adds:
 *   - Top bar: back, title + S·E, single gear for audio + subtitles
 *     (combined bottom sheet), episodes sheet (series), next episode.
 *   - Side gestures: vertical swipe on the left half adjusts brightness
 *     (a CSS dim layer); on the right half it adjusts volume. Both show
 *     a transient ExoPlayer-style indicator while the gesture is active.
 *   - Skip Intro pill, episodes sheet, auto-advance on ended.
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

function langLabel(code: string | null | undefined): string {
  if (!code) return 'Unknown'
  const map: Record<string, string> = {
    en: 'English', eng: 'English',
    hi: 'हिन्दी Hindi', hin: 'हिन्दी Hindi',
    ja: 'Japanese', jpn: 'Japanese',
    ko: 'Korean', kor: 'Korean',
    es: 'Spanish', spa: 'Spanish',
    fr: 'French', fra: 'French', fre: 'French',
    de: 'German', deu: 'German', ger: 'German',
    ta: 'தமிழ் Tamil', tam: 'தமிழ் Tamil',
    te: 'తెలుగు Telugu', tel: 'తెలుగు Telugu',
    kn: 'ಕನ್ನಡ Kannada', kan: 'ಕನ್ನಡ Kannada',
    ml: 'മലയാളം Malayalam', mal: 'മലയാളം Malayalam',
    mr: 'मराठी Marathi', mar: 'मराठी Marathi',
    bn: 'বাংলা Bengali', ben: 'বাংলা Bengali',
    pa: 'ਪੰਜਾਬੀ Punjabi', pan: 'ਪੰਜਾਬੀ Punjabi',
  }
  const key = code.split(/[-_]/)[0].toLowerCase()
  return map[key] ?? code.toUpperCase()
}

const GESTURE_DECAY_MS = 900
const OVERLAY_HIDE_MS = 3500

// ── Icons ──────────────────────────────────────────────────────────
const Ic = {
  back: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round"><path d="M15 19 8 12l7-7"/></svg>,
  settings: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94a7.6 7.6 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.63l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.4 7.4 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.49-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54a7.4 7.4 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.67 8.85a.5.5 0 0 0 .12.63l2.03 1.58a7.6 7.6 0 0 0 0 1.88L2.79 14.52a.5.5 0 0 0-.12.63l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.38 1.05.7 1.63.94l.36 2.54c.05.24.25.42.49.42h3.84c.24 0 .44-.18.49-.42l.36-2.54a7.4 7.4 0 0 0 1.63-.94l2.39.96c.23.09.48-.01.6-.22l1.92-3.32a.5.5 0 0 0-.12-.63zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7"/></svg>,
  playlist: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3 10h11v2H3zm0-4h11v2H3zm0 8h7v2H3zm13 0v6l5-3z"/></svg>,
  skipNext: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z"/></svg>,
  check: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>,
  volumeUp: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.06A4.5 4.5 0 0 0 16.5 12M14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54"/></svg>,
  volumeMute: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63M4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9zM12 4 9.91 6.09 12 8.18z"/></svg>,
  sun: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10m-7 5H2v0h3zm17 0h-3v0h3zM11 2h2v3h-2zm0 17h2v3h-2zM5.64 6.35 7.05 7.76l-1.41 1.41L4.23 7.76zm12.73 12.73-1.41-1.41 1.41-1.41 1.41 1.41zM17 7.05l1.41-1.41 1.41 1.41-1.41 1.41zM5.64 17.66l1.41-1.41 1.41 1.41L7.05 19z"/></svg>,
  close: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12"/></svg>,
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

  // ── refs
  const videoRef = useRef<HTMLVideoElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const profileIdRef = useRef<string | null>(null)
  const resumeRef = useRef<number | null>(null)
  const lastSaveTs = useRef(0)
  const metaRef = useRef<PlayerMetadata | null>(null)
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gestureTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoNextTriggered = useRef(false)
  const dragStateRef = useRef<{
    kind: 'vol' | 'bright' | 'pending'
    startX: number
    startY: number
    startVol: number
    startBright: number
  } | null>(null)

  // ── data state
  const [content, setContent] = useState<AdaptedContent | null>(null)
  const [seasons, setSeasons] = useState<SeasonHeader[]>([])
  const [episodes, setEpisodes] = useState<EpisodeTile[]>([])
  const [sheetSeason, setSheetSeason] = useState(season)
  const [sheetEpisodes, setSheetEpisodes] = useState<EpisodeTile[]>([])
  const [src, setSrc] = useState<string | null>(null)
  const [keyHex, setKeyHex] = useState<string | null>(null)
  const [hasNext, setHasNext] = useState(false)
  const [ready, setReady] = useState(false)

  // ── UI state
  const [overlayVisible, setOverlayVisible] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [episodesOpen, setEpisodesOpen] = useState(false)
  const [showSkipIntro, setShowSkipIntro] = useState(false)

  // ── audio / subs (driven by hls.js events)
  const [audioLangs, setAudioLangs] = useState<string[]>([])
  const [activeAudio, setActiveAudio] = useState<string | null>(null)
  const [subLangs, setSubLangs] = useState<string[]>([])
  const [activeSub, setActiveSub] = useState<string | null>(null)

  // ── transient gesture overlay
  const [gesture, setGesture] = useState<{ kind: 'vol' | 'bright'; value: number } | null>(null)

  // Brightness is a CSS dim; volume applies to the element directly.
  const brightnessRef = useRef(1) // 0.4 .. 1
  const [dim, setDim] = useState(0) // 1 - brightness

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

  useEffect(() => {
    if (type !== 'tv' || sheetSeason === season) { setSheetEpisodes(episodes); return }
    fetch(`/api/episodes?content_id=${id}&s=${sheetSeason}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.episodes) return
        setSheetEpisodes((d.episodes as EpisodeRow[]).map((e) => ({
          id: e.id,
          episode_number: e.episode_number,
          name: e.name,
          description: e.description,
          thumbnail_image: e.thumbnail_image,
          duration_sec: e.duration_sec,
        })))
      })
      .catch(() => {})
  }, [sheetSeason, type, id, season, episodes])

  // ─── HLS attach ──────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current
    if (!v || !src) return

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

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
        const tracks = hls.audioTracks || []
        const langs: string[] = []
        for (const t of tracks) if (t.lang && !langs.includes(t.lang)) langs.push(t.lang)
        setAudioLangs(langs)
        const cur = hls.audioTrack >= 0 ? tracks[hls.audioTrack]?.lang ?? null : null
        setActiveAudio(cur)
      })
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
        const tracks = hls.subtitleTracks || []
        const langs: string[] = []
        for (const t of tracks) if (t.lang && !langs.includes(t.lang)) langs.push(t.lang)
        setSubLangs(langs)
      })
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad()
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError()
      })

      return () => { hls.destroy(); hlsRef.current = null }
    }

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
        v.muted = true
        v.play().catch(() => {})
      }
      v.removeEventListener('loadedmetadata', onLoaded)
    }
    v.addEventListener('loadedmetadata', onLoaded)
    return () => v.removeEventListener('loadedmetadata', onLoaded)
  }, [ready])

  // ─── Progress save / skip markers / auto-advance ────────────────
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
      const v = videoRef.current; const pid = profileIdRef.current
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

  // ─── Overlay auto-hide ─────────────────────────────────────────
  const bumpOverlay = useCallback(() => {
    setOverlayVisible(true)
    if (overlayTimer.current) clearTimeout(overlayTimer.current)
    overlayTimer.current = setTimeout(() => setOverlayVisible(false), OVERLAY_HIDE_MS)
  }, [])
  useEffect(() => { bumpOverlay(); return () => { if (overlayTimer.current) clearTimeout(overlayTimer.current) } }, [bumpOverlay])

  // ─── Release orientation lock when leaving the screen ──────────
  useEffect(() => {
    return () => {
      try {
        const orient = screen.orientation as unknown as { unlock?: () => void } | undefined
        orient?.unlock?.()
      } catch {}
    }
  }, [])

  // ─── Actions ────────────────────────────────────────────────────
  const onSkipIntro = () => {
    const v = videoRef.current; const end = metaRef.current?.skip_intro_end
    if (!v || end == null) return
    v.currentTime = end
    setShowSkipIntro(false)
  }

  const onNextEpisode = () => {
    if (hasNext) router.replace(`/watch/tv/${id}?s=${season}&e=${episode + 1}`)
  }

  const pickAudio = (lang: string) => {
    const hls = hlsRef.current
    if (!hls) return
    const idx = (hls.audioTracks || []).findIndex((t) => t.lang === lang)
    if (idx >= 0) { hls.audioTrack = idx; setActiveAudio(lang) }
  }

  const pickSubtitle = (lang: string | null) => {
    const v = videoRef.current
    const hls = hlsRef.current
    setActiveSub(lang)
    if (hls) {
      if (lang == null) {
        hls.subtitleDisplay = false
        hls.subtitleTrack = -1
      } else {
        const idx = (hls.subtitleTracks || []).findIndex((t) => t.lang === lang)
        if (idx >= 0) {
          hls.subtitleDisplay = true
          hls.subtitleTrack = idx
        }
      }
    }
    if (v?.textTracks) {
      for (let i = 0; i < v.textTracks.length; i++) {
        const tt = v.textTracks[i]
        tt.mode = lang && tt.language === lang ? 'showing' : 'disabled'
      }
    }
  }

  // ─── Gesture handlers (vertical swipe on left/right halves) ────
  const flashGesture = (kind: 'vol' | 'bright', value: number) => {
    setGesture({ kind, value })
    if (gestureTimer.current) clearTimeout(gestureTimer.current)
    gestureTimer.current = setTimeout(() => setGesture(null), GESTURE_DECAY_MS)
  }

  const onStageTouchStart = (e: React.TouchEvent) => {
    // Don't swallow touches on the native controls (bottom of video).
    const tgt = e.target as HTMLElement
    if (tgt.tagName === 'VIDEO') {
      // Only start tracking if the touch is above the native-control
      // strip. WebKit draws controls in roughly the bottom 60px.
      const v = videoRef.current!
      const rect = v.getBoundingClientRect()
      const touch = e.touches[0]
      if (touch.clientY > rect.bottom - 60) return
    } else if (tgt.closest('[data-ui]')) {
      return
    }

    const t = e.touches[0]
    dragStateRef.current = {
      kind: 'pending',
      startX: t.clientX,
      startY: t.clientY,
      startVol: videoRef.current?.volume ?? 1,
      startBright: brightnessRef.current,
    }
  }

  const onStageTouchMove = (e: React.TouchEvent) => {
    const drag = dragStateRef.current
    if (!drag || !stageRef.current) return
    const t = e.touches[0]
    const dx = t.clientX - drag.startX
    const dy = t.clientY - drag.startY

    if (drag.kind === 'pending') {
      if (Math.hypot(dx, dy) < 14) return
      if (Math.abs(dy) <= Math.abs(dx)) {
        // Horizontal drag — leave to native (or ignore). Cancel.
        dragStateRef.current = null
        return
      }
      const w = stageRef.current.clientWidth
      drag.kind = drag.startX < w / 2 ? 'bright' : 'vol'
    }

    const stageH = stageRef.current.clientHeight
    if (drag.kind === 'vol') {
      const next = Math.max(0, Math.min(1, drag.startVol - dy / stageH))
      if (videoRef.current) {
        videoRef.current.volume = next
        if (next > 0 && videoRef.current.muted) videoRef.current.muted = false
      }
      flashGesture('vol', next)
    } else if (drag.kind === 'bright') {
      const next = Math.max(0.4, Math.min(1, drag.startBright - dy / stageH))
      brightnessRef.current = next
      setDim(1 - next)
      flashGesture('bright', (next - 0.4) / 0.6)
    }
  }

  const onStageTouchEnd = () => { dragStateRef.current = null }

  const title = content?.title ?? ''
  const subtitle = type === 'tv' ? `S${season} · E${episode}` : ''

  return (
    <div
      ref={stageRef}
      className="watch-stage fixed inset-0 bg-black overflow-hidden"
      onMouseMove={bumpOverlay}
      onTouchStartCapture={(e) => { bumpOverlay(); onStageTouchStart(e) }}
      onTouchMove={onStageTouchMove}
      onTouchEnd={onStageTouchEnd}
      onTouchCancel={onStageTouchEnd}
    >
      {/* Native video with native controls; everything but play/pause +
          scrubber is hidden via CSS. */}
      <video
        ref={videoRef}
        className="watch-video w-full h-full bg-black"
        playsInline
        autoPlay
        controls
        controlsList="nodownload nofullscreen noplaybackrate noremoteplayback"
        disablePictureInPicture
      />

      {/* CSS brightness dim */}
      {dim > 0 && (
        <div className="pointer-events-none absolute inset-0" style={{ background: `rgba(0,0,0,${dim.toFixed(3)})` }} />
      )}

      {/* Back button — always present while overlay is visible. */}
      <button
        onClick={() => router.back()}
        data-ui
        className={`absolute left-3 z-20 w-10 h-10 rounded-full bg-black/55 backdrop-blur text-white flex items-center justify-center active:bg-black/75 transition-opacity duration-200 ${overlayVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
        aria-label="Back"
      >
        <Ic.back />
      </button>

      {/* Title + S·E */}
      <div
        data-ui
        className={`absolute left-16 right-[260px] z-10 pt-3 pb-2 px-3 pointer-events-none transition-opacity duration-200 ${overlayVisible ? 'opacity-100' : 'opacity-0'}`}
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 4px)' }}
      >
        <div className="text-white text-sm font-bold truncate drop-shadow">{title}</div>
        {subtitle && <div className="text-white/70 text-[11px] truncate drop-shadow">{subtitle}</div>}
      </div>

      {/* Top-right actions: audio/subs gear, episodes, next */}
      <div
        data-ui
        className={`absolute right-3 z-20 flex items-center gap-2 transition-opacity duration-200 ${overlayVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        {(audioLangs.length > 0 || subLangs.length > 0) && (
          <button
            onClick={() => setSettingsOpen(true)}
            className="w-10 h-10 rounded-full bg-black/55 backdrop-blur text-white flex items-center justify-center active:bg-black/75"
            aria-label="Audio & subtitles"
          >
            <Ic.settings />
          </button>
        )}
        {type === 'tv' && episodes.length > 0 && (
          <button
            onClick={() => setEpisodesOpen(true)}
            className="h-10 px-3 rounded-full bg-black/55 backdrop-blur text-white text-xs font-bold flex items-center gap-1.5 active:bg-black/75"
            aria-label="Episodes"
          >
            <Ic.playlist />
            Episodes
          </button>
        )}
        {hasNext && (
          <button
            onClick={onNextEpisode}
            className="h-10 px-3 rounded-full bg-black/55 backdrop-blur text-white text-xs font-bold flex items-center gap-1.5 active:bg-black/75"
            aria-label="Next episode"
          >
            <Ic.skipNext />
            Next
          </button>
        )}
      </div>

      {/* Gesture indicator (ExoPlayer-style, only while active) */}
      {gesture && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-black/70">
          <div className="text-white">
            {gesture.kind === 'vol'
              ? (gesture.value === 0 ? <Ic.volumeMute /> : <Ic.volumeUp />)
              : <Ic.sun />}
          </div>
          <div className="h-[4px] w-[140px] rounded-full bg-white/25 overflow-hidden">
            <div className="h-full bg-white" style={{ width: `${Math.round(gesture.value * 100)}%` }} />
          </div>
          <span className="text-white text-xs font-bold w-8 text-right">{Math.round(gesture.value * 100)}%</span>
        </div>
      )}

      {/* Skip intro pill */}
      {showSkipIntro && (
        <button
          onClick={onSkipIntro}
          data-ui
          className="absolute right-4 bottom-[80px] z-20 bg-white/[0.92] text-black font-bold text-[13px] rounded-[10px] px-4 py-2.5 flex items-center gap-1.5 active:bg-white/80"
        >
          <Ic.skipNext />
          Skip Intro
        </button>
      )}

      {/* Audio + subtitles sheet */}
      {settingsOpen && (
        <div
          className="absolute inset-0 z-40 bg-black/60 flex items-end sm:items-center justify-center"
          data-ui
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="w-full max-w-md bg-[#0b0b0b] border border-white/[0.08] sm:rounded-2xl rounded-t-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="px-5 pt-4 pb-3 flex items-center gap-3 border-b border-white/[0.06]">
              <h3 className="flex-1 text-white font-bold text-sm">Audio & subtitles</h3>
              <button onClick={() => setSettingsOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 active:bg-white/10" aria-label="Close">
                <Ic.close />
              </button>
            </div>
            {audioLangs.length > 0 && (
              <div className="px-5 py-4 border-b border-white/[0.06]">
                <p className="text-white/50 text-[11px] font-bold tracking-wider uppercase mb-2">Audio</p>
                <div className="space-y-1">
                  {audioLangs.map((lang) => (
                    <button
                      key={lang}
                      onClick={() => pickAudio(lang)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm ${activeAudio === lang ? 'bg-white/[0.08] text-white' : 'text-white/70 active:bg-white/[0.06]'}`}
                    >
                      <span className="flex-1">{langLabel(lang)}</span>
                      {activeAudio === lang && <span className="text-[#e50914]"><Ic.check /></span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="px-5 py-4">
              <p className="text-white/50 text-[11px] font-bold tracking-wider uppercase mb-2">Subtitles</p>
              <div className="space-y-1">
                <button
                  onClick={() => pickSubtitle(null)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm ${activeSub == null ? 'bg-white/[0.08] text-white' : 'text-white/70 active:bg-white/[0.06]'}`}
                >
                  <span className="flex-1">Off</span>
                  {activeSub == null && <span className="text-[#e50914]"><Ic.check /></span>}
                </button>
                {subLangs.map((lang) => (
                  <button
                    key={lang}
                    onClick={() => pickSubtitle(lang)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm ${activeSub === lang ? 'bg-white/[0.08] text-white' : 'text-white/70 active:bg-white/[0.06]'}`}
                  >
                    <span className="flex-1">{langLabel(lang)}</span>
                    {activeSub === lang && <span className="text-[#e50914]"><Ic.check /></span>}
                  </button>
                ))}
                {subLangs.length === 0 && (
                  <p className="text-white/40 text-[11px] px-3 py-1">No subtitle tracks available</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Episodes sheet */}
      {episodesOpen && (
        <div
          className="absolute inset-0 z-40 bg-black/60 flex justify-end"
          data-ui
          onClick={() => setEpisodesOpen(false)}
        >
          <div
            className="bg-[#0b0b0b] border-l border-white/[0.08] w-full sm:w-[420px] max-h-full flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-[#0b0b0b]/95 backdrop-blur px-4 py-3 border-b border-white/[0.06] flex items-center gap-3">
              <h3 className="flex-1 text-white font-bold text-base">Episodes</h3>
              <button onClick={() => setEpisodesOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 active:bg-white/10" aria-label="Close"><Ic.close /></button>
            </div>
            {seasons.length > 1 && (
              <div className="px-4 py-3 flex gap-2 overflow-x-auto scrollbar-hide border-b border-white/[0.06]">
                {seasons.map((s) => (
                  <button key={s.season_number} onClick={() => setSheetSeason(s.season_number)} className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold ${sheetSeason === s.season_number ? 'bg-white text-black' : 'bg-white/[0.08] text-white/70 active:bg-white/[0.14]'}`}>
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
                  <button key={ep.id} onClick={() => { setEpisodesOpen(false); router.replace(`/watch/tv/${id}?s=${sheetSeason}&e=${ep.episode_number}`) }} className={`w-full flex gap-3 p-2 rounded-xl text-left ${active ? 'bg-[#e50914]/15 border border-[#e50914]/30' : 'bg-white/[0.03] active:bg-white/[0.06] border border-transparent'}`}>
                    <div className="relative w-[110px] aspect-video flex-shrink-0 rounded-lg overflow-hidden bg-[#1a1a1a]">
                      {ep.thumbnail_image ? (
                        <img src={ep.thumbnail_image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/25 text-sm">{ep.episode_number}</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 py-0.5">
                      <div className="flex items-baseline gap-2">
                        <span className="text-white text-[13px] font-bold truncate">{ep.episode_number}. {ep.name || 'Episode'}</span>
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
        .watch-video { object-fit: cover; }
        /* Hide every native control except play/pause + the timeline. */
        :global(.watch-video::-webkit-media-controls-volume-slider),
        :global(.watch-video::-webkit-media-controls-volume-slider-container),
        :global(.watch-video::-webkit-media-controls-mute-button),
        :global(.watch-video::-webkit-media-controls-fullscreen-button),
        :global(.watch-video::-webkit-media-controls-overflow-button),
        :global(.watch-video::-webkit-media-controls-overflow-menu-button),
        :global(.watch-video::-webkit-media-controls-picture-in-picture-button),
        :global(.watch-video::-webkit-media-controls-download-button),
        :global(.watch-video::-webkit-media-controls-closed-captions-button),
        :global(.watch-video::-webkit-media-controls-toggle-closed-captions-button),
        :global(.watch-video::-webkit-media-controls-rewind-button),
        :global(.watch-video::-webkit-media-controls-seek-forward-button),
        :global(.watch-video::-webkit-media-controls-seek-back-button),
        :global(.watch-video::-webkit-media-controls-status-display) {
          display: none !important;
        }
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
