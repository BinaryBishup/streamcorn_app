import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Protected routes
  const isAuthPage = pathname.startsWith('/auth')
  const isProtectedRoute = pathname.startsWith('/browse') ||
                          pathname.startsWith('/watch') ||
                          pathname.startsWith('/subscribe')

  // Unauthenticated users trying to access protected routes → /auth
  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth'
    return NextResponse.redirect(url)
  }

  // Authenticated user on /auth → redirect to browse
  if (user && isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/browse'
    return NextResponse.redirect(url)
  }

  // Authenticated user on root → redirect to browse
  if (user && pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/browse'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
