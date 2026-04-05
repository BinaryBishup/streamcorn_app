'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Hls from 'hls.js'

interface SportsEvent {
  id: string; sport: string; league: string
  team1_name: string; team1_logo: string | null
  team2_name: string; team2_logo: string | null
  match_date: string; stage: string; status: string
  result: string | null; team1_score: string | null; team2_score: string | null
  winner: string | null; stream_url: string | null; highlight_url: string | null
}

interface PointsRow {
  position: number; team: string; played: number; won: number; lost: number; nrr: string; points: number
}

// Sample points table — in production this would come from Supabase
const SAMPLE_POINTS: PointsRow[] = [
  { position: 1, team: 'RCB', played: 5, won: 4, lost: 1, nrr: '+1.23', points: 8 },
  { position: 2, team: 'CSK', played: 5, won: 4, lost: 1, nrr: '+0.98', points: 8 },
  { position: 3, team: 'MI', played: 5, won: 3, lost: 2, nrr: '+0.45', points: 6 },
  { position: 4, team: 'KKR', played: 5, won: 3, lost: 2, nrr: '+0.12', points: 6 },
  { position: 5, team: 'SRH', played: 5, won: 2, lost: 3, nrr: '-0.34', points: 4 },
  { position: 6, team: 'LSG', played: 5, won: 2, lost: 3, nrr: '-0.56', points: 4 },
  { position: 7, team: 'DC', played: 5, won: 1, lost: 4, nrr: '-0.87', points: 2 },
  { position: 8, team: 'PBKS', played: 5, won: 1, lost: 4, nrr: '-1.01', points: 2 },
]

export default function SportsPlayerPage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string

  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)

  const [event, setEvent] = useState<SportsEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'match' | 'points'>('match')
  const [isLandscape, setIsLandscape] = useState(false)

  // Fetch event
  useEffect(() => {
    fetch(`/api/sports/${eventId}`)
      .then(r => r.json())
      .then(d => { setEvent(d.event || null); setLoading(false) })
      .catch(() => setLoading(false))
  }, [eventId])

  // Orientation
  useEffect(() => {
    const check = () => setIsLandscape(window.innerWidth > window.innerHeight)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // HLS
  useEffect(() => {
    const v = videoRef.current
    const url = event?.stream_url || event?.highlight_url
    if (!v || !url) return

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true })
      hls.loadSource(url); hls.attachMedia(v)
      hls.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => {}))
      hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) { if (d.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad(); else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError() } })
      hlsRef.current = hls
    } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = url; v.addEventListener('loadedmetadata', () => v.play().catch(() => {}))
    }

    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null } }
  }, [event])

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="w-10 h-10 border-3 border-white/20 border-t-[#e50914] rounded-full animate-spin" />
    </div>
  )

  if (!event) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <p className="text-white/50 text-sm">Event not found</p>
    </div>
  )

  const hasVideo = event.stream_url || event.highlight_url
  const isLive = event.status === 'live'

  return (
    <div className="min-h-screen bg-black">
      {/* Video player */}
      {hasVideo && (
        <div className="relative w-full bg-black" style={{ aspectRatio: isLandscape ? undefined : '16/9', height: isLandscape ? '100vh' : undefined }}>
          <video ref={videoRef} playsInline autoPlay controls className="w-full h-full object-contain bg-black" />
          {isLive && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-red-600 px-2.5 py-1 rounded-md">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              <span className="text-white text-[10px] font-bold uppercase">Live</span>
            </div>
          )}
        </div>
      )}

      {/* Back button (if no video or in portrait) */}
      {(!hasVideo || !isLandscape) && (
        <button onClick={() => router.back()} className="absolute top-3 left-3 z-10 w-9 h-9 bg-black/60 backdrop-blur rounded-full flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 -960 960 960" fill="white"><path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z"/></svg>
        </button>
      )}

      {/* Match info + points (portrait only) */}
      {!isLandscape && (
        <div className="px-4 pt-4">
          {/* Match header */}
          <div className="bg-[#1a1a1a] rounded-xl p-4 mb-4">
            <p className="text-white/40 text-[10px] uppercase tracking-wider mb-3">{event.league} · {event.stage}</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                {event.team1_logo && <img src={event.team1_logo} alt="" className="w-10 h-10 object-contain" />}
                <div>
                  <p className={`text-sm font-semibold ${event.winner === event.team1_name ? 'text-white' : 'text-white/70'}`}>{event.team1_name}</p>
                  {event.team1_score && <p className="text-white/50 text-xs font-mono">{event.team1_score}</p>}
                </div>
              </div>
              <span className="text-white/20 text-lg font-bold mx-3">vs</span>
              <div className="flex items-center gap-3 flex-1 justify-end text-right">
                <div>
                  <p className={`text-sm font-semibold ${event.winner === event.team2_name ? 'text-white' : 'text-white/70'}`}>{event.team2_name}</p>
                  {event.team2_score && <p className="text-white/50 text-xs font-mono">{event.team2_score}</p>}
                </div>
                {event.team2_logo && <img src={event.team2_logo} alt="" className="w-10 h-10 object-contain" />}
              </div>
            </div>
            {event.result && <p className="text-[#46d369] text-xs font-medium mt-3 text-center">{event.result}</p>}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-[#111] rounded-xl p-1 mb-4">
            <button onClick={() => setActiveTab('match')} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${activeTab === 'match' ? 'bg-white text-black' : 'text-white/50'}`}>Match Info</button>
            <button onClick={() => setActiveTab('points')} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${activeTab === 'points' ? 'bg-white text-black' : 'text-white/50'}`}>Points Table</button>
          </div>

          {/* Match info tab */}
          {activeTab === 'match' && (
            <div className="bg-[#1a1a1a] rounded-xl p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-white/40">Sport</span>
                <span className="text-white capitalize">{event.sport}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/40">Date</span>
                <span className="text-white">{new Date(event.match_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/40">Time</span>
                <span className="text-white">{new Date(event.match_date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/40">Status</span>
                <span className={`font-medium ${isLive ? 'text-red-500' : event.status === 'completed' ? 'text-[#46d369]' : 'text-white/60'}`}>
                  {isLive ? 'LIVE' : event.status === 'completed' ? 'Completed' : 'Upcoming'}
                </span>
              </div>
            </div>
          )}

          {/* Points table tab */}
          {activeTab === 'points' && (
            <div className="bg-[#1a1a1a] rounded-xl overflow-hidden">
              <div className="grid grid-cols-8 gap-1 px-3 py-2 border-b border-white/[0.06] text-[10px] text-white/40 uppercase tracking-wider">
                <span className="col-span-1">#</span>
                <span className="col-span-2">Team</span>
                <span className="text-center">P</span>
                <span className="text-center">W</span>
                <span className="text-center">L</span>
                <span className="text-center">NRR</span>
                <span className="text-center font-bold">Pts</span>
              </div>
              {SAMPLE_POINTS.map(row => (
                <div key={row.position} className={`grid grid-cols-8 gap-1 px-3 py-2.5 text-xs ${row.position <= 4 ? 'bg-[#46d369]/[0.04]' : ''} ${row.position <= 4 ? 'border-l-2 border-[#46d369]' : 'border-l-2 border-transparent'}`}>
                  <span className="text-white/40 col-span-1">{row.position}</span>
                  <span className="text-white font-medium col-span-2">{row.team}</span>
                  <span className="text-white/60 text-center">{row.played}</span>
                  <span className="text-white/60 text-center">{row.won}</span>
                  <span className="text-white/60 text-center">{row.lost}</span>
                  <span className="text-white/50 text-center text-[10px]">{row.nrr}</span>
                  <span className="text-white font-bold text-center">{row.points}</span>
                </div>
              ))}
              <div className="px-3 py-2 border-t border-white/[0.06]">
                <p className="text-white/30 text-[10px]">Top 4 qualify for playoffs</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
