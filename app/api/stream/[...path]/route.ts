import { NextRequest, NextResponse } from 'next/server'

const CDN_BASE = process.env.NEXT_PUBLIC_CDN_BASE_URL || 'https://speeddeliver.b-cdn.net'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const cdnPath = path.join('/')
  const cdnUrl = `${CDN_BASE}/${cdnPath}`

  try {
    const response = await fetch(cdnUrl)

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch from CDN' },
        { status: response.status }
      )
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    const isManifest = cdnPath.endsWith('.m3u8')

    // For .m3u8 manifests: rewrite the key URI so standard players can fetch it natively
    if (isManifest) {
      let text = await response.text()

      // Replace dummy key URI with our key endpoint (pass content params for per-content keys)
      const keyParams = new URLSearchParams()
      const tmdbId = request.nextUrl.searchParams.get('tmdb_id')
      const contentType = request.nextUrl.searchParams.get('type')
      const sn = request.nextUrl.searchParams.get('season_number')
      const en = request.nextUrl.searchParams.get('episode_number')
      if (tmdbId) keyParams.set('tmdb_id', tmdbId)
      if (contentType) keyParams.set('type', contentType)
      if (sn) keyParams.set('season_number', sn)
      if (en) keyParams.set('episode_number', en)
      const keyUrl = `/api/hls-key${keyParams.toString() ? '?' + keyParams.toString() : ''}`

      text = text.replace(
        /URI="data:text\/plain[^"]*"/g,
        `URI="${keyUrl}"`
      )

      // Rewrite all relative URLs to go through our proxy
      const basePath = cdnPath.substring(0, cdnPath.lastIndexOf('/') + 1)
      const cacheBust = `_t=${Date.now()}`
      const rewriteUrl = (url: string, addCacheBust = false) => {
        if (url.startsWith('http') || url.startsWith('/')) return url
        const proxied = `/api/stream/${basePath}${url}`
        return addCacheBust && url.endsWith('.m3u8') ? `${proxied}?${cacheBust}` : proxied
      }

      // Rewrite standalone segment/playlist lines
      text = text.replace(/^(?!#)([^\s]+\.(?:ts|m3u8|m4s|mp4|aac))$/gm, (match) => rewriteUrl(match, true))

      // Rewrite URI="..." attributes in tags (e.g. #EXT-X-MEDIA URI="audio.m3u8")
      text = text.replace(/URI="(?!\/|http|data:)([^"]+)"/g, (_, url) => `URI="${rewriteUrl(url, true)}"`)


      return new NextResponse(text, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    // For segments: pass through as-is
    const body = response.body
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    console.error('Stream proxy error:', error)
    return NextResponse.json(
      { error: 'Stream proxy failed' },
      { status: 500 }
    )
  }
}
