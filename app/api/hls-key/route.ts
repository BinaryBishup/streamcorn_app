import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const FALLBACK_KEY = process.env.NEXT_PUBLIC_HLS_KEY || ''

function hexToBytes(hex: string): Uint8Array {
  const b = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    b[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return b
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const tmdbId = searchParams.get('tmdb_id')
  const type = searchParams.get('type')
  const seasonNumber = searchParams.get('season_number')
  const episodeNumber = searchParams.get('episode_number')

  let keyHex = FALLBACK_KEY

  // Try per-content key from database
  if (tmdbId && type) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll() } } }
    )

    let query = supabase
      .from('video_sources')
      .select('encryption_key')
      .eq('tmdb_id', parseInt(tmdbId))
      .eq('type', type)

    if (type === 'tv' && seasonNumber && episodeNumber) {
      query = query.eq('season_number', parseInt(seasonNumber)).eq('episode_number', parseInt(episodeNumber))
    }

    const { data } = await query.limit(1).maybeSingle()
    if (data?.encryption_key) {
      keyHex = data.encryption_key
    }
  }

  if (!keyHex) {
    return NextResponse.json({ error: 'Key not configured' }, { status: 500 })
  }

  const keyBytes = hexToBytes(keyHex)

  return new NextResponse(keyBytes.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(keyBytes.length),
      'Cache-Control': 'private, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
