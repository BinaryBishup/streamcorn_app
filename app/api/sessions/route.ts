import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function getSupabase(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
      },
    }
  )
}

function detectDeviceType(userAgent: string): 'mobile' | 'tablet' | 'desktop' | 'tv' | 'web' {
  const ua = userAgent.toLowerCase()
  if (ua.includes('smart-tv') || ua.includes('smarttv') || ua.includes('tv')) return 'tv'
  if (ua.includes('tablet') || ua.includes('ipad')) return 'tablet'
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return 'mobile'
  return 'web'
}

function getDeviceName(userAgent: string): string {
  const ua = userAgent.toLowerCase()
  if (ua.includes('iphone')) return 'iPhone'
  if (ua.includes('ipad')) return 'iPad'
  if (ua.includes('android')) {
    if (ua.includes('mobile')) return 'Android Phone'
    return 'Android Tablet'
  }
  if (ua.includes('macintosh') || ua.includes('mac os')) return 'Mac'
  if (ua.includes('windows')) return 'Windows PC'
  if (ua.includes('linux')) return 'Linux'
  if (ua.includes('smart-tv') || ua.includes('tv')) return 'Smart TV'
  return 'Unknown Device'
}

// GET: List active sessions for the user + check device limit
export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = getSupabase(cookieStore)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get active sessions
  const { data: sessions, error } = await supabase
    .from('active_sessions')
    .select('*')
    .eq('user_id', user.id)
    .order('last_active', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Get max_devices from subscription
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('max_devices, status, ends_at')
    .eq('user_id', user.id)
    .single()

  const maxDevices = subscription?.max_devices || 1
  const isSubscribed = subscription?.status === 'active' &&
    new Date(subscription.ends_at).getTime() > Date.now()

  return NextResponse.json({
    sessions: sessions || [],
    maxDevices,
    isSubscribed,
    limitReached: (sessions?.length || 0) >= maxDevices,
  })
}

// POST: Register a new session (on login / app load)
export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = getSupabase(cookieStore)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { device_id } = body
  const userAgent = request.headers.get('user-agent') || ''
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
             request.headers.get('x-real-ip') || ''

  if (!device_id) {
    return NextResponse.json({ error: 'device_id required' }, { status: 400 })
  }

  // Check if this device already has a session — just update last_active
  const { data: existing } = await supabase
    .from('active_sessions')
    .select('id')
    .eq('user_id', user.id)
    .eq('device_id', device_id)
    .single()

  if (existing) {
    await supabase
      .from('active_sessions')
      .update({
        last_active: new Date().toISOString(),
        user_agent: userAgent,
        ip_address: ip || null,
      })
      .eq('id', existing.id)

    return NextResponse.json({ registered: true, existing: true })
  }

  // Check device limit
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('max_devices, status, ends_at')
    .eq('user_id', user.id)
    .single()

  const maxDevices = subscription?.max_devices || 1

  const { count } = await supabase
    .from('active_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  if ((count || 0) >= maxDevices) {
    // Limit reached — client must remove a session first
    const { data: sessions } = await supabase
      .from('active_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('last_active', { ascending: false })

    return NextResponse.json({
      registered: false,
      limitReached: true,
      maxDevices,
      sessions: sessions || [],
    }, { status: 409 })
  }

  // Register new session
  const { error } = await supabase
    .from('active_sessions')
    .insert({
      user_id: user.id,
      device_id,
      device_name: getDeviceName(userAgent),
      device_type: detectDeviceType(userAgent),
      ip_address: ip || null,
      user_agent: userAgent,
      last_active: new Date().toISOString(),
    })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ registered: true, existing: false })
}

// DELETE: Remove a session (sign out a device)
export async function DELETE(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = getSupabase(cookieStore)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const sessionId = searchParams.get('session_id')

  if (!sessionId) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('active_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', user.id) // ensure user owns the session

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ removed: true })
}
