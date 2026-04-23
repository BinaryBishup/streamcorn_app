import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Serves the 16-byte AES-128 key for an HLS segment. Keys live on the
 * catalogue rows:
 *   - Movies           → `content.hash_key`
 *   - Series episodes  → `episodes.hash_key` (per episode)
 *
 * Falls back to NEXT_PUBLIC_HLS_KEY when no per-content key is found so
 * legacy assets keep playing during migration.
 */

const FALLBACK_KEY = process.env.NEXT_PUBLIC_HLS_KEY || ''

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().replace(/^0x/, '')
  const b = new Uint8Array(clean.length / 2)
  for (let i = 0; i < clean.length; i += 2) {
    b[i / 2] = parseInt(clean.substring(i, i + 2), 16)
  }
  return b
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const contentId = sp.get('content_id')
  const tmdbId = sp.get('tmdb_id')
  const type = sp.get('type')
  const seasonNumber = sp.get('season_number')
  const episodeNumber = sp.get('episode_number')

  let keyHex: string | null = null

  if (contentId || tmdbId) {
    const supabase = await createClient()
    // Resolve the content row
    let row: { id: string; type: string; hash_key: string | null } | null = null
    if (contentId) {
      const { data } = await supabase
        .from('content')
        .select('id, type, hash_key')
        .eq('id', contentId)
        .maybeSingle()
      row = data as typeof row
    } else if (tmdbId) {
      const { data } = await supabase
        .from('content')
        .select('id, type, hash_key')
        .eq('tmdb_id', parseInt(tmdbId, 10))
        .maybeSingle()
      row = data as typeof row
    }

    if (row) {
      const isMovie = row.type === 'movie'
      if (isMovie) {
        keyHex = row.hash_key
      } else if (seasonNumber && episodeNumber) {
        const { data: season } = await supabase
          .from('seasons')
          .select('id')
          .eq('content_id', row.id)
          .eq('season_number', parseInt(seasonNumber, 10))
          .maybeSingle()
        if (season) {
          const { data: ep } = await supabase
            .from('episodes')
            .select('hash_key')
            .eq('season_id', (season as { id: string }).id)
            .eq('episode_number', parseInt(episodeNumber, 10))
            .maybeSingle()
          keyHex = (ep as { hash_key: string | null } | null)?.hash_key ?? row.hash_key
        } else {
          keyHex = row.hash_key
        }
      } else {
        keyHex = row.hash_key
      }
    }
  }

  if (!keyHex) keyHex = FALLBACK_KEY
  if (!keyHex) return NextResponse.json({ error: 'Key not configured' }, { status: 500 })

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

// Silence unused-var warning until callers are fully migrated off type/tmdb
void type
