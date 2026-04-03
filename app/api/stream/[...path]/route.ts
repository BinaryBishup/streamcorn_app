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
