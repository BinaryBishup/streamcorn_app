import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { episodesForContentSeason } from '@/lib/content-adapter'

/**
 * Episode list for a content+season. Pulls directly from the `episodes`
 * table; no TMDB round-trip.
 *
 *   GET /api/episodes?content_id=<uuid>&s=<number>
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const contentId = sp.get('content_id')
  const season = sp.get('s')
  if (!contentId || !season) {
    return NextResponse.json({ error: 'Missing content_id / s' }, { status: 400 })
  }
  const supabase = await createClient()
  const eps = await episodesForContentSeason(supabase, contentId, parseInt(season, 10))
  return NextResponse.json({ episodes: eps })
}
