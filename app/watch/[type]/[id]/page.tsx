'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Hls from 'hls.js'
import { getResumePosition, saveProgress, beaconProgress, buildPayload } from '@/lib/watch-progress'
import type { AdaptedContent, EpisodeRow, SeasonHeader } from '@/lib/content-adapter'

/**
 * HLS player. Streams come from Bunny via `/api/stream/*` which rewrites
 * every `#EXT-X-KEY` URI to an inline `data:application/octet-stream;base64,…`
 * carrying the AES-128 key bytes. That's the same decryption path the
 * native Android app uses (see KeyRewritingDataSource.kt), so the player
 * only has to hand the manifest to hls.js / native HLS — no extra key
 * round-trip, no custom loader.
 *
 * Episode/title metadata comes from our DB (`/api/content/[id]`,
 * `/api/episodes`) — no more TMDB round-trip. The URL path still exposes
 * a `/watch/[type]/[id]` shape where `[id]` is the content uuid.
 */

interface EpisodeTile {
  id: string
  episode_number: number
  name: string | null
  thumbnail_image: string | null
  duration_sec: number | null
}

export default function WatchPage() {
  const params = useParams(); const searchParams = useSearchParams(); const router = useRouter()
  const type = params.type as 'movie' | 'tv'
  const id = params.id as string
  const season = parseInt(searchParams.get('s') || '1')
  const episode = parseInt(searchParams.get('e') || '1')
  const seasonNum = type === 'tv' ? season : undefined
  const episodeNum = type === 'tv' ? episode : undefined

  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const profileIdRef = useRef<string | null>(null)
  const resumeRef = useRef<number | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaveTs = useRef(0)

  const [content, setContent] = useState<AdaptedContent | null>(null)
  const [seasons, setSeasons] = useState<SeasonHeader[]>([])
  const [src, setSrc] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [showTopBar, setShowTopBar] = useState(true)
  const [episodes, setEpisodes] = useState<EpisodeTile[]>([])
  const [showEpisodeSheet, setShowEpisodeSheet] = useState(false)
  const [sheetSeason, setSheetSeason] = useState(season)
  const [sheetEpisodes, setSheetEpisodes] = useState<EpisodeTile[]>([])
  const [hasNext, setHasNext] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [fit, setFit] = useState<'cover' | 'contain'>('cover')
  const [isLandscape, setIsLandscape] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showSkipIntro, setShowSkipIntro] = useState(false)
  const [showNextPrompt, setShowNextPrompt] = useState(false)
  const autoNextTriggered = useRef(false)
  const metadataRef = useRef<{
    skip_intro_start: number | null
    skip_intro_end: number | null
    skip_recap_end: number | null
    credits_start: number | null
    next_episode_prompt: number | null
    completion_threshold: number | null
  } | null>(null)

  useEffect(() => {
    profileIdRef.current = localStorage.getItem('streamcorn_profile_id')
  }, [])

  // Fetch content + resume + stream + episodes (for TV) in parallel.
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
        fetch(`/api/content/${id}`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/video-source?${qp}`).then(r => r.json()).catch(() => ({})),
        pid ? getResumePosition(pid, id, type, seasonNum, episodeNum) : null,
        type === 'tv'
          ? fetch(`/api/episodes?content_id=${id}&s=${season}`).then(r => r.ok ? r.json() : null).catch(() => null)
          : Promise.resolve(null),
      ])

      if (cancelled) return

      setContent(contentRes?.content ?? null)
      setSeasons(contentRes?.seasons ?? [])
      setSrc(srcRes?.url || null)
      resumeRef.current = resume
      metadataRef.current = srcRes?.metadata || null

      if (type === 'tv' && episodeRes?.episodes) {
        const eps: EpisodeTile[] = (episodeRes.episodes as EpisodeRow[]).map((e) => ({
          id: e.id,
          episode_number: e.episode_number,
          name: e.name,
          thumbnail_image: e.thumbnail_image,
          duration_sec: e.duration_sec,
        }))
        setEpisodes(eps)
        setSheetEpisodes(eps)
        setSheetSeason(season)
        setHasNext(eps.findIndex(e => e.episode_number === episode) < eps.length - 1)
      }
      setReady(true)
    }
    load()
    return () => { cancelled = true }
  }, [id, type, season, episode, seasonNum, episodeNum])

  // Sheet: swap episodes when the user browses a different season.
  useEffect(() => {
    if (type !== 'tv' || sheetSeason === season) { setSheetEpisodes(episodes); return }
    fetch(`/api/episodes?content_id=${id}&s=${sheetSeason}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.episodes) return
        setSheetEpisodes((d.episodes as EpisodeRow[]).map(e => ({
          id: e.id,
          episode_number: e.episode_number,
          name: e.name,
          thumbnail_image: e.thumbnail_image,
          duration_sec: e.duration_sec,
        })))
      })
      .catch(() => {})
  }, [sheetSeason, type, id, season, episodes])

  // Beacon save on hide/unload
  const doBeacon = useCallback(() => {
    const v = videoRef.current; const pid = profileIdRef.current
    if (!v || !pid || !isFinite(v.duration) || v.duration < 10 || v.currentTime < 5) return
    beaconProgress(buildPayload(pid, id, type, v.currentTime, v.duration, seasonNum, episodeNum))
  }, [id, type, seasonNum, episodeNum])

  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'hidden') doBeacon() }
    const onHide = () => doBeacon()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', onHide)
    window.addEventListener('beforeunload', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', onHide)
      window.removeEventListener('beforeunload', onHide)
    }
  }, [doBeacon])

  // HLS attach. The manifest we fetch comes from `/api/stream/*` which has
  // already inlined the AES key as a `data:` URI — no custom loader needed.
  useEffect(() => {
    const v = videoRef.current
    if (!v || !src) return

    // Try native HLS first (Safari / iOS)
    if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = src
      v.play().catch(() => {})
      return
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
      })
      hls.loadSource(src)
      hls.attachMedia(v)
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) console.error('[hls] fatal', data)
      })
      hlsRef.current = hls
      return () => { hls.destroy(); hlsRef.current = null }
    }

    // Last-resort: assign directly and hope for the best
    v.src = src
  }, [src])

  // Apply resume position once metadata loads
  useEffect(() => {
    const v = videoRef.current
    if (!v || !ready) return
    const onLoaded = () => {
      const t = resumeRef.current
      if (t != null && t > 5) v.currentTime = t
      v.removeEventListener('loadedmetadata', onLoaded)
    }
    v.addEventListener('loadedmetadata', onLoaded)
    return () => v.removeEventListener('loadedmetadata', onLoaded)
  }, [ready])

  // Progress save + skip-intro / next-episode prompts
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
      const m = metadataRef.current
      if (m?.skip_intro_start != null && m.skip_intro_end != null) {
        const inIntro = v.currentTime >= m.skip_intro_start && v.currentTime < m.skip_intro_end
        setShowSkipIntro(inIntro)
      }
      const threshold = m?.credits_start ?? (v.duration > 60 ? v.duration - 60 : null)
      if (type === 'tv' && hasNext && threshold != null && v.currentTime >= threshold) {
        setShowNextPrompt(true)
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

  // Auto-hide the top bar after 3s of inactivity
  useEffect(() => {
    if (!showTopBar) return
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setShowTopBar(false), 3000)
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current) }
  }, [showTopBar])

  // Orientation / fullscreen helpers
  useEffect(() => {
    const update = () => setIsLandscape(window.matchMedia('(orientation: landscape)').matches)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const toggleFullscreen = () => {
    const el = document.documentElement
    if (!document.fullscreenElement) el.requestFullscreen().catch(() => {})
    else document.exitFullscreen().catch(() => {})
  }

  const skipIntro = () => {
    const v = videoRef.current; const m = metadataRef.current
    if (!v || m?.skip_intro_end == null) return
    v.currentTime = m.skip_intro_end
    setShowSkipIntro(false)
  }

  const nextEpisode = () => {
    router.replace(`/watch/tv/${id}?s=${season}&e=${episode + 1}`)
  }

  const changeRate = (r: number) => {
    setPlaybackRate(r)
    if (videoRef.current) videoRef.current.playbackRate = r
  }

  const title = content?.title ?? ''
  const epLabel = type === 'tv' ? `S${season}:E${episode}` : ''

  return (
    <div
      className="fixed inset-0 bg-black overflow-hidden"
      onClick={() => setShowTopBar(true)}
      onMouseMove={() => setShowTopBar(true)}
    >
      <video
        ref={videoRef}
        className={`w-full h-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`}
        playsInline autoPlay controls={false}
      />

      {/* Top bar */}
      <div
        className={`absolute top-0 left-0 right-0 px-4 py-3 bg-gradient-to-b from-black/70 to-transparent flex items-center gap-3 transition-opacity ${showTopBar ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center"
          aria-label="Back"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-white font-semibold truncate">{title}</div>
          {epLabel && <div className="text-xs text-white/60">{epLabel}</div>}
        </div>
        {type === 'tv' && (
          <button
            onClick={() => setShowEpisodeSheet(true)}
            className="text-white/80 text-sm font-semibold px-3 py-2"
          >
            Episodes
          </button>
        )}
        <button
          onClick={() => setFit(f => f === 'cover' ? 'contain' : 'cover')}
          className="w-10 h-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white/70 text-[10px]"
          aria-label="Toggle fit"
        >
          {fit === 'cover' ? 'FIT' : 'FILL'}
        </button>
        {isLandscape && (
          <button
            onClick={toggleFullscreen}
            className="w-10 h-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center"
            aria-label="Fullscreen"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}>
              {isFullscreen
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M9 4H4v5m11-5h5v5M4 15v5h5m11 0h-5v-5"/>
                : <path strokeLinecap="round" strokeLinejoin="round" d="M4 9V4h5M20 9V4h-5M4 15v5h5m11 0h-5v-5"/>}
            </svg>
          </button>
        )}
      </div>

      {/* Skip intro */}
      {showSkipIntro && (
        <button
          onClick={skipIntro}
          className="absolute bottom-20 right-4 bg-white text-black font-semibold px-4 py-2 rounded-full text-sm"
        >
          Skip Intro
        </button>
      )}

      {/* Next episode prompt */}
      {showNextPrompt && hasNext && (
        <button
          onClick={nextEpisode}
          className="absolute bottom-20 right-4 bg-white text-black font-semibold px-4 py-2 rounded-full text-sm flex items-center gap-2"
        >
          Next Episode
          <svg width="16" height="16" viewBox="0 0 24 24" fill="black"><path d="M8 5v14l11-7z"/></svg>
        </button>
      )}

      {/* Episode sheet */}
      {showEpisodeSheet && (
        <div
          className="absolute inset-0 bg-black/70 z-20"
          onClick={() => setShowEpisodeSheet(false)}
        >
          <div
            className="absolute bottom-0 left-0 right-0 bg-[#1a1a1a] rounded-t-2xl max-h-[75vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-white/[0.06]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-bold">Episodes</h3>
                <button onClick={() => setShowEpisodeSheet(false)} className="text-white/50 text-sm">Close</button>
              </div>
              {seasons.length > 1 && (
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                  {seasons.map(s => (
                    <button
                      key={s.season_number}
                      onClick={() => setSheetSeason(s.season_number)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${sheetSeason === s.season_number ? 'bg-white text-black' : 'bg-white/[0.08] text-white/60'}`}
                    >
                      {s.name || `Season ${s.season_number}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="overflow-y-auto p-3 space-y-2">
              {sheetEpisodes.map(ep => {
                const mins = ep.duration_sec ? Math.round(ep.duration_sec / 60) : null
                const active = ep.episode_number === episode && sheetSeason === season
                return (
                  <button
                    key={ep.id}
                    onClick={() => {
                      setShowEpisodeSheet(false)
                      router.replace(`/watch/tv/${id}?s=${sheetSeason}&e=${ep.episode_number}`)
                    }}
                    className={`w-full flex gap-3 p-2 rounded-lg text-left ${active ? 'bg-white/[0.08]' : 'active:bg-white/[0.04]'}`}
                  >
                    <div className="w-24 aspect-video rounded-lg overflow-hidden bg-[#252525] flex-shrink-0">
                      {ep.thumbnail_image ? (
                        <img src={ep.thumbnail_image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/20 text-sm">{ep.episode_number}</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-white truncate">
                        {ep.episode_number}. {ep.name || 'Episode'}
                      </div>
                      {mins && <div className="text-[10px] text-white/40">{mins}m</div>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Playback rate dots (debug). Only show when top bar is visible. */}
      {showTopBar && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          {[0.75, 1, 1.25, 1.5, 2].map(r => (
            <button
              key={r}
              onClick={() => changeRate(r)}
              className={`px-2 py-1 rounded-full text-[10px] font-semibold ${playbackRate === r ? 'bg-white text-black' : 'bg-white/10 text-white/60'}`}
            >
              {r}x
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
