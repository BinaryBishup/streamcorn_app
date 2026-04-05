import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const { user_id, profile_id, device_id } = await request.json()
  if (!user_id || !device_id) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const supabase = await createClient()

  // Check if session exists
  const { data: existing } = await supabase
    .from('active_sessions')
    .select('id')
    .eq('user_id', user_id)
    .eq('device_id', device_id)
    .maybeSingle()

  if (existing) {
    await supabase.from('active_sessions').update({
      last_active: new Date().toISOString(),
      profile_id: profile_id || null,
    }).eq('id', existing.id)
    return NextResponse.json({ ok: true })
  }

  const { error } = await supabase.from('active_sessions').insert({
    user_id,
    profile_id: profile_id || null,
    device_id,
    device_name: 'Android TV',
    device_type: 'tv',
    last_active: new Date().toISOString(),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const device_id = request.nextUrl.searchParams.get('device_id')
  const user_id = request.nextUrl.searchParams.get('user_id')
  if (!device_id || !user_id) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const supabase = await createClient()
  await supabase.from('active_sessions').delete().eq('device_id', device_id).eq('user_id', user_id)
  return NextResponse.json({ ok: true })
}
