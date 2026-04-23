import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Bunny CDN reverse-proxy + HLS manifest rewriter. Ported from the native
 * Android `KeyRewritingDataSource.kt` so both clients use the exact same
 * decryption method:
 *
 *   1. Replace the `URI=` attribute on every `#EXT-X-KEY:METHOD=AES-128`
 *      line with an inline `data:application/octet-stream;base64,<base64>`
 *      URI carrying the 16 raw key bytes. Players resolve this natively —
 *      no extra HTTP round-trip for the key.
 *
 *   2. Whenever an `#EXT-X-KEY` applies to an `#EXT-X-MAP` (init segment),
 *      append `IV=0x00…` to that key (the converter encrypts init with a
 *      zero IV but omits the attribute, which both hls.js and Media3
 *      reject). Re-emit an IV-less key AFTER the `#EXT-X-MAP` line so the
 *      segments that follow still use the media-sequence IV as usual.
 *
 * URL scheme on Bunny (written by the streamcorn-converter pipeline):
 *   Movie   →  {contentId}/master.m3u8
 *   Series  →  {contentId}/{season}/{episode}/master.m3u8
 *
 * We derive `content_id`/`season`/`episode` from the path segments so the
 * client doesn't need to pass them as query params.
 */
const CDN_BASE = process.env.NEXT_PUBLIC_CDN_BASE_URL || 'https://streamcornes.b-cdn.net'

const ZERO_IV = '0x00000000000000000000000000000000'

function hexToBase64(hex: string): string {
  const clean = hex.trim().replace(/^0x/, '')
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16)
  }
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

/**
 * Resolve the AES-128 hex key for the content+episode that produced this
 * manifest. Movies keep their key on `content.hash_key`; series episodes
 * carry a per-episode key on `episodes.hash_key`.
 */
async function resolveKeyHex(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contentId: string,
  seasonNumber: string | null,
  episodeNumber: string | null,
): Promise<string | null> {
  const { data: content } = await supabase
    .from('content')
    .select('id, type, hash_key')
    .eq('id', contentId)
    .maybeSingle()
  if (!content) return null
  const row = content as { id: string; type: 'movie' | 'show' | 'anime'; hash_key: string | null }

  const isMovie = row.type === 'movie'
  if (isMovie || !seasonNumber || !episodeNumber) return row.hash_key

  const { data: season } = await supabase
    .from('seasons')
    .select('id')
    .eq('content_id', row.id)
    .eq('season_number', parseInt(seasonNumber, 10))
    .maybeSingle()
  if (!season) return row.hash_key

  const { data: ep } = await supabase
    .from('episodes')
    .select('hash_key')
    .eq('season_id', (season as { id: string }).id)
    .eq('episode_number', parseInt(episodeNumber, 10))
    .maybeSingle()
  return (ep as { hash_key: string | null } | null)?.hash_key ?? row.hash_key
}

/**
 * Rewrites a playlist body with inline `data:` URIs on every KEY line
 * and a zero IV on any KEY that applies to an `#EXT-X-MAP` init segment.
 * Mirrors `KeyRewritingDataSource.rewriteManifest` on Android.
 */
function rewriteManifest(text: string, keyHex: string | null): string {
  if (!keyHex) return text
  const b64 = hexToBase64(keyHex)
  const dataUri = `data:application/octet-stream;base64,${b64}`

  // 1. Swap the URI on every #EXT-X-KEY line
  const keyRewritten = text.replace(
    /(#EXT-X-KEY:[^\n]*URI=")[^"]*(")/g,
    (_m, pre, post) => `${pre}${dataUri}${post}`,
  )

  // 2. Append IV=0x00… to any key that applies to #EXT-X-MAP, then
  //    re-emit an IV-less key after the MAP line so media segments
  //    fall back to the sequence-number IV as usual.
  return keyRewritten.replace(
    /(#EXT-X-KEY:METHOD=AES-128[^\r\n]*)\r?\n(#EXT-X-MAP:[^\r\n]*)\r?\n/g,
    (_m, keyLine, mapLine) =>
      `${keyLine},IV=${ZERO_IV}\n${mapLine}\n#EXT-X-KEY:METHOD=AES-128,URI="${dataUri}"\n`,
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  const cdnPath = path.join('/')
  const cdnUrl = `${CDN_BASE}/${cdnPath}`

  try {
    const response = await fetch(cdnUrl)
    if (!response.ok) {
      return NextResponse.json({ error: 'CDN fetch failed' }, { status: response.status })
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    const isManifest = cdnPath.endsWith('.m3u8')

    if (isManifest) {
      // Derive content identifiers either from the path layout (Bunny
      // puts content uuid as the first segment) or from the client's
      // explicit query params — whichever is present.
      const sp = request.nextUrl.searchParams
      const contentId = sp.get('content_id') ?? path[0] ?? ''
      const explicitSeason = sp.get('season_number')
      const explicitEpisode = sp.get('episode_number')
      const inferredSeason = path.length >= 4 ? path[1] : null
      const inferredEpisode = path.length >= 4 ? path[2] : null
      const seasonNumber = explicitSeason ?? inferredSeason
      const episodeNumber = explicitEpisode ?? inferredEpisode

      const supabase = await createClient()
      const keyHex = await resolveKeyHex(supabase, contentId, seasonNumber, episodeNumber)

      let text = await response.text()
      text = rewriteManifest(text, keyHex)

      // Rewrite relative playlist/segment URLs to go back through our
      // proxy so variant playlists inherit the same decryption rewrite.
      const basePath = cdnPath.substring(0, cdnPath.lastIndexOf('/') + 1)
      const cacheBust = `_t=${Date.now()}`
      const rewriteUrl = (url: string, addCacheBust = false) => {
        if (url.startsWith('http') || url.startsWith('/') || url.startsWith('data:')) return url
        const proxied = `/api/stream/${basePath}${url}`
        return addCacheBust && url.endsWith('.m3u8') ? `${proxied}?${cacheBust}` : proxied
      }
      text = text.replace(
        /^(?!#)([^\s]+\.(?:ts|m3u8|m4s|mp4|aac))$/gm,
        (match) => rewriteUrl(match, true),
      )
      text = text.replace(
        /URI="(?!\/|http|data:)([^"]+)"/g,
        (_, url) => `URI="${rewriteUrl(url, true)}"`,
      )

      return new NextResponse(text, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    // Segments, init.mp4, WebVTT, etc. — pass through unchanged.
    return new NextResponse(response.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    console.error('Stream proxy error:', error)
    return NextResponse.json({ error: 'Stream proxy failed' }, { status: 500 })
  }
}
