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
 * Watch page — native <video controls> kept to just play/pause + the
 * scrubber (everything else is hidden via CSS in globals.css). A slim
 * custom overlay on top adds only what the native bar lacks:
 *
 *   Top bar:  back · title · ⚙ settings · Episodes · Next
 *   Settings sheet: Audio / Subtitles / Speed / Volume / Brightness
 *   Bottom-right pill: Skip Intro
 *
 * Autoplay attempts unmuted; falls back to muted silently if the
 * browser rejects. Landscape lock + CSS rotation fallback retained.
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

const LANG_LABELS: Record<string, string> = {
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

function langLabel(code: string | null | undefined): string {
  if (!code) return 'Unknown'
  return LANG_LABELS[code.split(/[-_]/)[0].toLowerCase()] ?? code.toUpperCase()
}

const OVERLAY_HIDE_MS = 3500
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const

// ── icons ──────────────────────────────────────────────────────────
const Ic = {
  back: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round"><path d="M15 19 8 12l7-7"/></svg>,
  settings: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94a7.6 7.6 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.63l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.4 7.4 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.49-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54a7.4 7.4 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.67 8.85a.5.5 0 0 0 .12.63l2.03 1.58a7.6 7.6 0 0 0 0 1.88L2.79 14.52a.5.5 0 0 0-.12.63l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.38 1.05.7 1.63.94l.36 2.54c.05.24.25.42.49.42h3.84c.24 0 .44-.18.49-.42l.36-2.54a7.4 7.4 0 0 0 1.63-.94l2.39.96c.23.09.48-.01.6-.22l1.92-3.32a.5.5 0 0 0-.12-.63zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7"/></svg>,
  playlist: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3 10h11v2H3zm0-4h11v2H3zm0 8h7v2H3zm13 0v6l5-3z"/></svg>,
  skipNext: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z"/></svg>,
  check: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>,
  close: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12"/></svg>,
  volume: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.06A4.5 4.5 0 0 0 16.5 12M14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54"/></svg>,
  sun: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10m-7 5H2v0h3zm17 0h-3v0h3zM11 2h2v3h-2zm0 17h2v3h-2zM5.64 6.35 7.05 7.76l-1.41 1.41L4.23 7.76zm12.73 12.73-1.41-1.41 1.41-1.41 1.41 1.41zM17 7.05l1.41-1.41 1.41 1.41-1.41 1.41zM5.64 17.66l1.41-1.41 1.41 1.41L7.05 19z"/></svg>,
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

  // refs
  const videoRef = useRef<HTMLVideoElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const profileIdRef = useRef<string | null>(null)
  const resumeRef = useRef<number | null>(null)
  const lastSaveTs = useRef(0)
  const metaRef = useRef<PlayerMetadata | null>(null)
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoNextTriggered = useRef(false)

  // data state
  const [content, setContent] = useState<AdaptedContent | null>(null)
  const [seasons, setSeasons] = useState<SeasonHeader[]>([])
  const [episodes, setEpisodes] = useState<EpisodeTile[]>([])
  const [sheetSeason, setSheetSeason] = useState(season)
  const [sheetEpisodes, setSheetEpisodes] = useState<EpisodeTile[]>([])
  const [src, setSrc] = useState<string | null>(null)
  const [keyHex, setKeyHex] = useState<string | null>(null)
  const [hasNext, setHasNext] = useState(false)
  const [ready, setReady] = useState(false)

  // UI state
  const [overlayVisible, setOverlayVisible] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [episodesOpen, setEpisodesOpen] = useState(false)
  const [showSkipIntro, setShowSkipIntro] = useState(false)

  // audio / subs
  const [audioLangs, setAudioLangs] = useState<string[]>([])
  const [activeAudio, setActiveAudio] = useState<string | null>(null)
  const [subLangs, setSubLangs] = useState<string[]>([])
  const [activeSub, setActiveSub] = useState<string | null>(null)

  // controls
  const [volume, setVolume] = useState(1)
  const [brightness, setBrightness] = useState(1) // 0.4–1
  const [playbackRate, setPlaybackRate] = useState(1)

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

  // ─── HLS ────────────────────────────────────────────────────────
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

  // ─── Autoplay unmuted (silent muted fallback) ──────────────────
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

  // ─── Volume / speed / brightness → element ─────────────────────
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.volume = volume
    if (volume > 0 && v.muted) v.muted = false
  }, [volume])
  useEffect(() => {
    const v = videoRef.current
    if (v) v.playbackRate = playbackRate
  }, [playbackRate])

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

  // ─── Beacon on hide/unload ─────────────────────────────────────
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
    overlayTimer.current = setTimeout(() => {
      if (!settingsOpen && !episodesOpen) setOverlayVisible(false)
    }, OVERLAY_HIDE_MS)
  }, [settingsOpen, episodesOpen])
  useEffect(() => { bumpOverlay(); return () => { if (overlayTimer.current) clearTimeout(overlayTimer.current) } }, [bumpOverlay])

  // Release orientation lock on unmount
  useEffect(() => {
    return () => {
      try {
        const orient = screen.orientation as unknown as { unlock?: () => void } | undefined
        orient?.unlock?.()
      } catch {}
    }
  }, [])

  // ─── Track actions ──────────────────────────────────────────────
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
    if (v?.textTracks) for (let i = 0; i < v.textTracks.length; i++) {
      const tt = v.textTracks[i]
      tt.mode = lang && tt.language === lang ? 'showing' : 'disabled'
    }
  }
  const onSkipIntro = () => {
    const v = videoRef.current; const end = metaRef.current?.skip_intro_end
    if (!v || end == null) return
    v.currentTime = end
    setShowSkipIntro(false)
  }
  const onNextEpisode = () => { if (hasNext) router.replace(`/watch/tv/${id}?s=${season}&e=${episode + 1}`) }

  const title = content?.title ?? ''
  const subtitle = type === 'tv' ? `S${season} · E${episode}` : ''
  const dim = 1 - brightness

  return (
    <div
      ref={stageRef}
      className="watch-stage fixed inset-0 bg-black overflow-hidden"
      onMouseMove={bumpOverlay}
      onTouchStart={bumpOverlay}
    >
      <video
        ref={videoRef}
        className="watch-video w-full h-full bg-black"
        playsInline
        autoPlay
        controls
        controlsList="nodownload nofullscreen noplaybackrate noremoteplayback"
        disablePictureInPicture
      />
      {dim > 0 && (
        <div className="pointer-events-none absolute inset-0" style={{ background: `rgba(0,0,0,${dim.toFixed(3)})` }} />
      )}

      {/* Back */}
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

      {/* Top-right actions */}
      <div
        data-ui
        className={`absolute right-3 z-20 flex items-center gap-2 transition-opacity duration-200 ${overlayVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        <button
          onClick={() => setSettingsOpen(true)}
          className="w-10 h-10 rounded-full bg-black/55 backdrop-blur text-white flex items-center justify-center active:bg-black/75"
          aria-label="Settings"
        >
          <Ic.settings />
        </button>
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

      {/* Skip intro */}
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

      {/* Settings — single sheet for everything */}
      {settingsOpen && (
        <div
          className="absolute inset-0 z-40 bg-black/60 flex items-end sm:items-center justify-center"
          data-ui
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="w-full max-w-md bg-[#0b0b0b] border border-white/[0.08] sm:rounded-2xl rounded-t-2xl overflow-hidden max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="px-5 pt-4 pb-3 flex items-center gap-3 border-b border-white/[0.06]">
              <h3 className="flex-1 text-white font-bold text-sm">Settings</h3>
              <button onClick={() => setSettingsOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 active:bg-white/10" aria-label="Close">
                <Ic.close />
              </button>
            </div>
            <div className="overflow-y-auto">
              {/* Audio */}
              {audioLangs.length > 0 && (
                <section className="px-5 py-4 border-b border-white/[0.06]">
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
                </section>
              )}

              {/* Subtitles */}
              <section className="px-5 py-4 border-b border-white/[0.06]">
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
              </section>

              {/* Speed */}
              <section className="px-5 py-4 border-b border-white/[0.06]">
                <p className="text-white/50 text-[11px] font-bold tracking-wider uppercase mb-2">Playback speed</p>
                <div className="grid grid-cols-3 gap-2">
                  {SPEEDS.map((r) => (
                    <button
                      key={r}
                      onClick={() => setPlaybackRate(r)}
                      className={`py-2.5 rounded-lg text-sm font-bold ${playbackRate === r ? 'bg-[#e50914] text-white' : 'bg-white/[0.06] text-white/80 active:bg-white/[0.12]'}`}
                    >
                      {r === 1 ? 'Normal' : `${r}x`}
                    </button>
                  ))}
                </div>
              </section>

              {/* Volume */}
              <section className="px-5 py-4 border-b border-white/[0.06]">
                <p className="text-white/50 text-[11px] font-bold tracking-wider uppercase mb-2">Volume</p>
                <div className="flex items-center gap-3 px-1">
                  <div className="text-white/70"><Ic.volume /></div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    className="sheet-slider flex-1"
                    aria-label="Volume"
                  />
                  <span className="text-white text-xs font-bold tabular-nums w-10 text-right">{Math.round(volume * 100)}%</span>
                </div>
              </section>

              {/* Brightness */}
              <section className="px-5 py-4">
                <p className="text-white/50 text-[11px] font-bold tracking-wider uppercase mb-2">Brightness</p>
                <div className="flex items-center gap-3 px-1">
                  <div className="text-white/70"><Ic.sun /></div>
                  <input
                    type="range"
                    min={0.4}
                    max={1}
                    step={0.02}
                    value={brightness}
                    onChange={(e) => setBrightness(parseFloat(e.target.value))}
                    className="sheet-slider flex-1"
                    aria-label="Brightness"
                  />
                  <span className="text-white text-xs font-bold tabular-nums w-10 text-right">{Math.round(((brightness - 0.4) / 0.6) * 100)}%</span>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* Episodes */}
      {episodesOpen && (
        <div className="absolute inset-0 z-40 bg-black/60 flex justify-end" data-ui onClick={() => setEpisodesOpen(false)}>
          <div className="bg-[#0b0b0b] border-l border-white/[0.08] w-full sm:w-[420px] max-h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-[#0b0b0b]/95 backdrop-blur px-4 py-3 border-b border-white/[0.06] flex items-center gap-3">
              <h3 className="flex-1 text-white font-bold text-base">Episodes</h3>
              <button onClick={() => setEpisodesOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 active:bg-white/10" aria-label="Close"><Ic.close/></button>
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
        .sheet-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 4px;
          background: rgba(255,255,255,0.18);
          border-radius: 999px;
          cursor: pointer;
          accent-color: #e50914;
        }
        .sheet-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 999px;
          background: white;
          border: 0;
        }
        .sheet-slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 999px;
          background: white;
          border: 0;
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
