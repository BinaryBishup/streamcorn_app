import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Known bot/crawler user agents to block
const BLOCKED_BOTS = [
  'bot', 'crawler', 'spider', 'scraper', 'wget', 'curl',
  'httrack', 'archive', 'python-requests', 'axios', 'node-fetch',
  'postman', 'insomnia', 'httpie',
]

export async function middleware(request: NextRequest) {
  const ua = (request.headers.get('user-agent') || '').toLowerCase()

  // Block known crawlers/scrapers on content routes
  if (
    !request.nextUrl.pathname.startsWith('/_next') &&
    !request.nextUrl.pathname.startsWith('/api/hls-key') &&
    BLOCKED_BOTS.some(bot => ua.includes(bot))
  ) {
    return new NextResponse('Access denied', { status: 403 })
  }

  // Block requests without user-agent (likely automated)
  if (!request.headers.get('user-agent') && !request.nextUrl.pathname.startsWith('/_next')) {
    return new NextResponse('Access denied', { status: 403 })
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|json|js)$).*)',
  ],
}
