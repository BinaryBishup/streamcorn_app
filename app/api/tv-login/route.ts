import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST — create a new TV login token
export async function POST() {
  const supabase = await createClient()
  const token = Math.random().toString(36).substring(2, 10).toUpperCase()

  const { error } = await supabase.from('tv_login_tokens').insert({
    token,
    status: 'pending',
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ token })
}

// GET — check token status (TV polls this)
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tv_login_tokens')
    .select('status, user_id')
    .eq('token', token)
    .single()

  if (error || !data) return NextResponse.json({ status: 'not_found' })

  // Check expiry
  return NextResponse.json({ status: data.status, user_id: data.user_id })
}

// PUT — confirm token (mobile web app calls this)
export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { token } = await request.json()
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const { error } = await supabase
    .from('tv_login_tokens')
    .update({ status: 'authenticated', user_id: user.id })
    .eq('token', token)
    .eq('status', 'pending')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
