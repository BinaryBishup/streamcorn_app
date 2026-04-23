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
 * Custom-controls player. Native <video controls> is disabled so every
 * affordance comes from our overlay — matching the Android Media3
 * PlayerScreen more closely and letting us expose volume + brightness
 * as visible sliders instead of swipe-only gestures.
 *
 * Top bar houses language (audio track cycle), subtitles toggle,
 * volume + brightness sliders, episodes / next / speed / lock.
 * Bottom bar has a scrubber and play/pause/±10s transport. A tap on
 * the video toggles overlay visibility; auto-hides after 4s idle.
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

function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0
  const total = Math.floor(sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function langBadge(lang: string | null | undefined): string {
  if (!lang) return '—'
  return lang.split(/[-_]/)[0].toUpperCase().slice(0, 2)
}

// ── small icon set ─────────────────────────────────────────────────
const Ic = {
  back: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round"><path d="M15 19 8 12l7-7"/></svg>,
  play: (p?: { size?: number }) => <svg width={p?.size ?? 28} height={p?.size ?? 28} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>,
  pause: (p?: { size?: number }) => <svg width={p?.size ?? 28} height={p?.size ?? 28} viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>,
  replay10: () => <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/><text x="12" y="16" fontSize="7" fontWeight="700" fill="currentColor" textAnchor="middle">10</text></svg>,
  forward10: () => <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1l5 5-5 5V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z"/><text x="12" y="16" fontSize="7" fontWeight="700" fill="currentColor" textAnchor="middle">10</text></svg>,
  skipNext: (p?: { size?: number }) => <svg width={p?.size ?? 22} height={p?.size ?? 22} viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z"/></svg>,
  playlist: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3 10h11v2H3zm0-4h11v2H3zm0 8h7v2H3zm13 0v6l5-3z"/></svg>,
  cc: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2m-8 7H9.5v-.5h-2v3h2V13H11v1a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1zm7 0h-1.5v-.5h-2v3h2V13H18v1a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1z"/></svg>,
  speed: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M20.4 7.6 18 10l-1.4-1.4L19 6.2A9 9 0 1 0 21 12h-2a7 7 0 1 1-1.4-4.2l-2.8 2.8L16 12l6-6zM11 8h2v6h-2z"/></svg>,
  lockOpen: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4m6-7h-1V8a5 5 0 0 0-9.8-1.3l1.9.6A3 3 0 0 1 15 8v2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2m0 10H6v-8h12z"/></svg>,
  lockClosed: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2m-6 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4M9 8V6a3 3 0 0 1 6 0v2z"/></svg>,
  close: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12"/></svg>,
  volume: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.06A4.5 4.5 0 0 0 16.5 12M14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54"/></svg>,
  mute: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63M4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9zM12 4 9.91 6.09 12 8.18z"/></svg>,
  sun: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10m-7 5H2v0h3zm17 0h-3v0h3zM11 2h2v3h-2zm0 17h2v3h-2zM5.64 6.35 7.05 7.76l-1.41 1.41L4.23 7.76zm12.73 12.73-1.41-1.41 1.41-1.41 1.41 1.41zM17 7.05l1.41-1.41 1.41 1.41-1.41 1.41zM5.64 17.66l1.41-1.41 1.41 1.41L7.05 19z"/></svg>,
}

const AUTOHIDE_MS = 4000
const SEEK_STEP = 10

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
  const autoHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoNextTriggered = useRef(false)

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

  // ── playback state
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffering, setBuffering] = useState(false)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [scrubTarget, setScrubTarget] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [locked, setLocked] = useState(false)

  // ── controls state
  const [controlsVisible, setControlsVisible] = useState(true)
  const [episodesOpen, setEpisodesOpen] = useState(false)
  const [speedOpen, setSpeedOpen] = useState(false)
  const [showSkipIntro, setShowSkipIntro] = useState(false)

  // ── audio / subs
  const [audioLangs, setAudioLangs] = useState<string[]>([])
  const [activeAudio, setActiveAudio] = useState<string | null>(null)
  const [hasSubs, setHasSubs] = useState(false)
  const [subsEnabled, setSubsEnabled] = useState(true)

  // ── volume / brightness (state drives the sliders + video.volume / CSS dim)
  const [volume, setVolume] = useState(1) // 0–1
  const [brightness, setBrightness] = useState(1) // 0.4–1.0

  // ─── Load content + stream + episodes ───────────────────────────
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
        setHasSubs((hls.subtitleTracks || []).length > 0)
      })
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad()
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError()
      })
      return () => { hls.destroy(); hlsRef.current = null }
    }

    // Safari / iOS native HLS path
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
      v.volume = volume
      try {
        await v.play()
      } catch {
        // Autoplay policy blocked sound — retry muted so picture still shows.
        v.muted = true
        v.play().catch(() => {})
      }
      v.removeEventListener('loadedmetadata', onLoaded)
    }
    v.addEventListener('loadedmetadata', onLoaded)
    return () => v.removeEventListener('loadedmetadata', onLoaded)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  // ─── Video event wiring ─────────────────────────────────────────
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

    const onPlay = () => setPlaying(true)
    const onPause = () => { setPlaying(false); save() }
    const onTime = () => {
      setCurrentTime(v.currentTime)
      const m = metaRef.current
      if (m?.skip_intro_start != null && m.skip_intro_end != null) {
        setShowSkipIntro(v.currentTime >= m.skip_intro_start && v.currentTime < m.skip_intro_end)
      }
      save()
    }
    const onDur = () => setDuration(v.duration || 0)
    const onWait = () => setBuffering(true)
    const onCan = () => setBuffering(false)
    const onSeeked = () => save()
    const onEnded = () => {
      save()
      if (type === 'tv' && hasNext && !autoNextTriggered.current) {
        autoNextTriggered.current = true
        router.replace(`/watch/tv/${id}?s=${season}&e=${episode + 1}`)
      }
    }

    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('durationchange', onDur)
    v.addEventListener('waiting', onWait)
    v.addEventListener('canplay', onCan)
    v.addEventListener('playing', onCan)
    v.addEventListener('seeked', onSeeked)
    v.addEventListener('ended', onEnded)
    return () => {
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('durationchange', onDur)
      v.removeEventListener('waiting', onWait)
      v.removeEventListener('canplay', onCan)
      v.removeEventListener('playing', onCan)
      v.removeEventListener('seeked', onSeeked)
      v.removeEventListener('ended', onEnded)
    }
  }, [id, type, season, episode, seasonNum, episodeNum, hasNext, router])

  // ─── Beacon save on unload ──────────────────────────────────────
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

  // ─── Auto-hide controls ─────────────────────────────────────────
  const bumpControls = useCallback(() => {
    setControlsVisible(true)
    if (autoHideTimer.current) clearTimeout(autoHideTimer.current)
    autoHideTimer.current = setTimeout(() => {
      if (!videoRef.current?.paused && !isScrubbing && !episodesOpen && !speedOpen) {
        setControlsVisible(false)
      }
    }, AUTOHIDE_MS)
  }, [isScrubbing, episodesOpen, speedOpen])

  useEffect(() => {
    bumpControls()
    return () => { if (autoHideTimer.current) clearTimeout(autoHideTimer.current) }
  }, [bumpControls])

  // ─── Apply volume state to the element ──────────────────────────
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.volume = volume
    if (volume > 0 && v.muted) v.muted = false
  }, [volume])

  // ─── Release orientation lock when leaving the screen ──────────
  useEffect(() => {
    return () => {
      try {
        const orient = screen.orientation as unknown as { unlock?: () => void } | undefined
        orient?.unlock?.()
      } catch {}
    }
  }, [])

  // ─── Transport actions ──────────────────────────────────────────
  const togglePlay = useCallback(async () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      try {
        // First-user-gesture chain for landscape + fullscreen.
        if (!document.fullscreenElement && stageRef.current) {
          await stageRef.current.requestFullscreen().catch(() => {})
        }
        const orient = screen.orientation as unknown as { lock?: (o: string) => Promise<void> } | undefined
        orient?.lock?.('landscape').catch(() => {})
        v.muted = false
        await v.play()
      } catch {
        v.play().catch(() => {})
      }
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
    const v = videoRef.current; const end = metaRef.current?.skip_intro_end
    if (!v || end == null) return
    v.currentTime = end
    setShowSkipIntro(false)
  }
  const onNextEpisode = () => { if (hasNext) router.replace(`/watch/tv/${id}?s=${season}&e=${episode + 1}`) }
  const cycleAudio = () => {
    const hls = hlsRef.current
    if (!hls || audioLangs.length < 2) return
    const cur = audioLangs.findIndex((l) => l === activeAudio)
    const next = audioLangs[(cur + 1) % audioLangs.length]
    const idx = (hls.audioTracks || []).findIndex((t) => t.lang === next)
    if (idx >= 0) { hls.audioTrack = idx; setActiveAudio(next) }
  }
  const toggleSubs = () => {
    const v = videoRef.current; const hls = hlsRef.current
    const next = !subsEnabled
    setSubsEnabled(next)
    if (hls) {
      hls.subtitleDisplay = next
      if (next && hls.subtitleTrack < 0 && (hls.subtitleTracks || []).length > 0) hls.subtitleTrack = 0
      else if (!next) hls.subtitleTrack = -1
    }
    if (v?.textTracks) for (let i = 0; i < v.textTracks.length; i++) v.textTracks[i].mode = next ? 'showing' : 'disabled'
  }
  const setSpeed = (rate: number) => {
    setPlaybackRate(rate)
    if (videoRef.current) videoRef.current.playbackRate = rate
    setSpeedOpen(false)
    bumpControls()
  }

  // ─── Scrub bar ──────────────────────────────────────────────────
  const onScrubChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setScrubTarget(parseFloat(e.target.value))
    setIsScrubbing(true)
    bumpControls()
  }
  const onScrubCommit = () => {
    const v = videoRef.current; if (v) v.currentTime = scrubTarget
    setIsScrubbing(false)
    bumpControls()
  }

  // ─── Stage tap → play/pause + toggle overlay ────────────────────
  const onStageClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (locked) return
    if ((e.target as HTMLElement).closest('[data-ui]')) return
    if (!controlsVisible) { bumpControls(); return }
    togglePlay()
  }

  // ─── Derived ────────────────────────────────────────────────────
  const title = content?.title ?? ''
  const subtitle = type === 'tv' ? `S${season} · E${episode}` : ''
  const displayTime = isScrubbing ? scrubTarget : currentTime
  const progressPct = duration > 0 ? (displayTime / duration) * 100 : 0
  const remaining = Math.max(0, duration - displayTime)
  const dimOverlay = 1 - brightness

  return (
    <div
      ref={stageRef}
      className="watch-stage fixed inset-0 bg-black overflow-hidden select-none"
      onClick={onStageClick}
      onTouchStart={bumpControls}
      onMouseMove={bumpControls}
    >
      <video
        ref={videoRef}
        className="watch-video w-full h-full bg-black"
        playsInline
        autoPlay
        controls={false}
      />
      {dimOverlay > 0 && (
        <div className="pointer-events-none absolute inset-0" style={{ background: `rgba(0,0,0,${dimOverlay.toFixed(3)})` }} />
      )}

      {/* Buffering spinner */}
      {buffering && !isScrubbing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-10 h-10 rounded-full border-[3px] border-white/20 border-t-[#e50914] animate-spin" />
        </div>
      )}

      {/* Scrim */}
      {controlsVisible && !locked && (
        <div className="pointer-events-none absolute inset-0 bg-black/35 transition-opacity duration-200" data-ui />
      )}

      {/* ── TOP BAR ── */}
      {!locked && (
        <div
          className={`absolute top-0 left-0 right-0 z-20 transition-opacity duration-200 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          data-ui
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex items-center gap-2 px-3 pb-3 flex-wrap"
            style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)' }}
          >
            <button
              onClick={() => router.back()}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white active:bg-white/10"
              aria-label="Back"
            >
              <Ic.back />
            </button>
            <div className="flex-1 min-w-0 ml-1">
              <div className="text-white text-sm font-bold truncate">{title}</div>
              {subtitle && <div className="text-white/70 text-[11px] truncate">{subtitle}</div>}
            </div>

            {/* Volume slider */}
            <div className="flex items-center gap-1.5 h-10 px-2.5 rounded-full bg-white/[0.08]">
              <button
                onClick={() => setVolume(volume > 0 ? 0 : 1)}
                className="text-white flex items-center justify-center"
                aria-label="Toggle volume"
              >
                {volume === 0 ? <Ic.mute /> : <Ic.volume />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="mini-slider w-[80px] accent-white"
                aria-label="Volume"
              />
            </div>

            {/* Brightness slider */}
            <div className="flex items-center gap-1.5 h-10 px-2.5 rounded-full bg-white/[0.08]">
              <div className="text-white flex items-center justify-center" aria-hidden>
                <Ic.sun />
              </div>
              <input
                type="range"
                min={0.4}
                max={1}
                step={0.02}
                value={brightness}
                onChange={(e) => setBrightness(parseFloat(e.target.value))}
                className="mini-slider w-[80px] accent-white"
                aria-label="Brightness"
              />
            </div>

            {/* Audio language cycle */}
            {audioLangs.length > 1 && (
              <button
                onClick={cycleAudio}
                className="h-10 px-3 rounded-full bg-white/[0.08] text-white text-[11px] font-bold tracking-wider active:bg-white/[0.14]"
                aria-label="Change audio language"
              >
                {langBadge(activeAudio ?? audioLangs[0])}
              </button>
            )}

            {/* Subtitles */}
            {hasSubs && (
              <button
                onClick={toggleSubs}
                className={`relative w-10 h-10 rounded-full flex items-center justify-center active:bg-white/10 ${subsEnabled ? 'text-[#e50914]' : 'text-white'}`}
                aria-label="Subtitles"
              >
                <Ic.cc />
                {subsEnabled && <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-4 h-[2px] bg-[#e50914] rounded-full" />}
              </button>
            )}

            {/* Episodes */}
            {type === 'tv' && episodes.length > 0 && (
              <button
                onClick={() => setEpisodesOpen(true)}
                className="w-10 h-10 rounded-full flex items-center justify-center text-white active:bg-white/10"
                aria-label="Episodes"
              >
                <Ic.playlist />
              </button>
            )}

            {/* Next */}
            {hasNext && (
              <button
                onClick={onNextEpisode}
                className="w-10 h-10 rounded-full flex items-center justify-center text-white active:bg-white/10"
                aria-label="Next episode"
              >
                <Ic.skipNext />
              </button>
            )}

            {/* Speed */}
            <button
              onClick={() => setSpeedOpen(true)}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white active:bg-white/10"
              aria-label="Playback speed"
            >
              <Ic.speed />
            </button>

            {/* Lock */}
            <button
              onClick={() => setLocked(true)}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white active:bg-white/10"
              aria-label="Lock controls"
            >
              <Ic.lockOpen />
            </button>
          </div>
        </div>
      )}

      {/* ── BOTTOM BAR ── */}
      {!locked && (
        <div
          className={`absolute bottom-0 left-0 right-0 z-20 transition-opacity duration-200 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          data-ui
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-5 pt-2 pb-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)' }}>
            {/* Scrubber */}
            <div className="flex items-center gap-3 mb-2">
              <span className="text-white text-[11px] font-bold tabular-nums w-12 text-left">{fmtTime(displayTime)}</span>
              <div className="relative flex-1 h-[14px] flex items-center">
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-white/25" />
                <div className="absolute top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-[#e50914]" style={{ left: 0, width: `${progressPct}%` }} />
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
                  aria-label="Seek"
                />
              </div>
              <span className="text-white text-[11px] font-bold tabular-nums w-12 text-right">-{fmtTime(remaining)}</span>
            </div>

            {/* Transport */}
            <div className="flex items-center justify-center gap-9">
              <button onClick={() => seekBy(-SEEK_STEP)} className="w-12 h-12 rounded-full flex items-center justify-center text-white active:bg-white/10" aria-label="Back 10 seconds">
                <Ic.replay10 />
              </button>
              <button onClick={togglePlay} className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center active:bg-white/80" aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? <Ic.pause /> : <Ic.play />}
              </button>
              <button onClick={() => seekBy(SEEK_STEP)} className="w-12 h-12 rounded-full flex items-center justify-center text-white active:bg-white/10" aria-label="Forward 10 seconds">
                <Ic.forward10 />
              </button>
              {hasNext && (
                <button onClick={onNextEpisode} className="w-12 h-12 rounded-full flex items-center justify-center text-white active:bg-white/10" aria-label="Next episode">
                  <Ic.skipNext />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Skip intro ── */}
      {showSkipIntro && !locked && (
        <button
          onClick={onSkipIntro}
          data-ui
          onClickCapture={(e) => e.stopPropagation()}
          className="absolute right-6 bottom-[96px] z-20 bg-white/[0.92] text-black font-bold text-[13px] rounded-[10px] px-5 py-[11px] flex items-center gap-1.5 active:bg-white/80"
        >
          <Ic.skipNext size={16} />
          Skip Intro
        </button>
      )}

      {/* ── Locked overlay (unlock-only) ── */}
      {locked && (
        <button
          onClick={() => { setLocked(false); bumpControls() }}
          data-ui
          onClickCapture={(e) => e.stopPropagation()}
          className="absolute left-4 z-30 w-12 h-12 rounded-full bg-black/60 backdrop-blur text-white flex items-center justify-center"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
          aria-label="Unlock"
        >
          <Ic.lockClosed />
        </button>
      )}

      {/* ── Speed sheet ── */}
      {speedOpen && (
        <div className="absolute inset-0 z-30 bg-black/60 flex items-end justify-center" data-ui onClick={() => setSpeedOpen(false)}>
          <div className="w-full max-w-md bg-[#0b0b0b] border-t border-white/[0.08] rounded-t-2xl p-4 pb-6" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-bold text-sm">Playback speed</h3>
              <button onClick={() => setSpeedOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 active:bg-white/10"><Ic.close/></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                <button key={r} onClick={() => setSpeed(r)} className={`py-3 rounded-xl text-sm font-bold ${playbackRate === r ? 'bg-[#e50914] text-white' : 'bg-white/[0.06] text-white/80 active:bg-white/[0.12]'}`}>
                  {r}x
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Episodes sheet ── */}
      {episodesOpen && (
        <div className="absolute inset-0 z-30 bg-black/60 flex justify-end" data-ui onClick={() => setEpisodesOpen(false)}>
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
                      {active && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-7 h-7 rounded-full bg-[#e50914] flex items-center justify-center text-white">
                            {playing ? <Ic.pause size={14}/> : <Ic.play size={14}/>}
                          </div>
                        </div>
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
        .mini-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 3px;
          background: rgba(255,255,255,0.25);
          border-radius: 999px;
          cursor: pointer;
        }
        .mini-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 999px;
          background: white;
          border: 0;
        }
        .mini-slider::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 999px;
          background: white;
          border: 0;
        }
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
