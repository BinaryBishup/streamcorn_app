'use client'

interface SportsEvent {
  id: string
  sport: string
  league: string
  team1_name: string
  team1_logo: string | null
  team2_name: string
  team2_logo: string | null
  match_date: string
  stage: string
  status: 'upcoming' | 'live' | 'completed'
  result: string | null
  team1_score: string | null
  team2_score: string | null
  winner: string | null
  stream_url: string | null
  highlight_url: string | null
}

function formatMatchTime(date: string) {
  const d = new Date(date)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const isTomorrow = d.toDateString() === new Date(now.getTime() + 86400000).toDateString()

  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase()

  if (isToday) return { label: 'Today', time }
  if (isTomorrow) return { label: 'Tomorrow', time }
  return { label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), time }
}

export function SportsSection({ events }: { events: SportsEvent[] }) {
  if (events.length === 0) return null

  // Group by league
  const leagues = new Map<string, SportsEvent[]>()
  events.forEach(e => {
    if (!leagues.has(e.league)) leagues.set(e.league, [])
    leagues.get(e.league)!.push(e)
  })

  return (
    <div className="px-4 mb-6">
      {Array.from(leagues.entries()).map(([league, matches]) => (
        <div key={league} className="mb-5">
          <h2 className="text-white font-bold text-base mb-3">{league}</h2>

          {/* Horizontal scrollable match cards */}
          <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
            {matches.map(match => {
              const { label, time } = formatMatchTime(match.match_date)
              const isLive = match.status === 'live'
              const isCompleted = match.status === 'completed'

              return (
                <div
                  key={match.id}
                  className="flex-shrink-0 bg-[#1a1a1a] rounded-xl overflow-hidden"
                  style={{ width: 280 }}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
                    <div className="flex items-center gap-2">
                      {isLive && (
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                          <span className="text-red-500 text-[10px] font-bold uppercase">Live</span>
                        </span>
                      )}
                      <span className="text-white/40 text-[10px] uppercase tracking-wider">{match.stage}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-white/50 text-[10px]">{label}</span>
                      {!isCompleted && <span className="text-white text-xs font-semibold ml-2">{time}</span>}
                    </div>
                  </div>

                  {/* Teams */}
                  <div className="p-3 space-y-3">
                    {/* Team 1 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        {match.team1_logo && <img src={match.team1_logo} alt="" className="w-7 h-7 object-contain flex-shrink-0" />}
                        <span className={`text-sm truncate ${match.winner === match.team1_name ? 'text-white font-semibold' : 'text-white/80'}`}>{match.team1_name}</span>
                      </div>
                      {match.team1_score && (
                        <span className={`text-sm font-mono ${match.winner === match.team1_name ? 'text-white font-bold' : 'text-white/60'}`}>{match.team1_score}</span>
                      )}
                    </div>

                    {/* Team 2 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        {match.team2_logo && <img src={match.team2_logo} alt="" className="w-7 h-7 object-contain flex-shrink-0" />}
                        <span className={`text-sm truncate ${match.winner === match.team2_name ? 'text-white font-semibold' : 'text-white/80'}`}>{match.team2_name}</span>
                      </div>
                      {match.team2_score && (
                        <span className={`text-sm font-mono ${match.winner === match.team2_name ? 'text-white font-bold' : 'text-white/60'}`}>{match.team2_score}</span>
                      )}
                    </div>
                  </div>

                  {/* Result or action */}
                  {isCompleted && match.result && (
                    <div className="px-3 pb-3">
                      <p className="text-[#46d369] text-xs font-medium">{match.result}</p>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="px-3 pb-3 flex gap-2">
                    {isLive && match.stream_url && (
                      <a href={match.stream_url} className="flex-1 flex items-center justify-center gap-1.5 bg-red-600 text-white text-xs font-bold py-2 rounded-lg active:bg-red-700">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
                        Watch Live
                      </a>
                    )}
                    {isCompleted && match.highlight_url && (
                      <a href={match.highlight_url} className="flex-1 flex items-center justify-center gap-1.5 bg-white/10 text-white text-xs font-semibold py-2 rounded-lg active:bg-white/15">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
                        Highlights
                      </a>
                    )}
                    {!isLive && !isCompleted && (
                      <div className="flex-1 flex items-center justify-center gap-1.5 bg-white/[0.06] text-white/40 text-xs py-2 rounded-lg">
                        <svg width="14" height="14" viewBox="0 -960 960 960" fill="currentColor"><path d="M200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v560q0 33-23.5 56.5T760-80H200Zm0-80h560v-400H200v400Z" /></svg>
                        Upcoming
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
