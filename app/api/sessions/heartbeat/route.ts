import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Lightweight endpoint: checks if a device session still exists and updates last_active
export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ valid: false, reason: 'unauthenticated' })
  }

  const body = await request.json()
  const { device_id } = body

  if (!device_id) {
    return NextResponse.json({ valid: false, reason: 'no_device_id' })
  }

  // Check if this device's session still exists
  const { data: session } = await supabase
    .from('active_sessions')
    .select('id')
    .eq('user_id', user.id)
    .eq('device_id', device_id)
    .single()

  if (!session) {
    return NextResponse.json({ valid: false, reason: 'session_removed' })
  }

  // Update last_active timestamp
  await supabase
    .from('active_sessions')
    .update({ last_active: new Date().toISOString() })
    .eq('id', session.id)

  return NextResponse.json({ valid: true })
}
