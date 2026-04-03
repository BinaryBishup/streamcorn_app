import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const PLANS: Record<string, { price: number; name: string; devices: number; months: number }> = {
  '1dev-1m':  { price: 299,  name: '1 Device / 1 Month',  devices: 1, months: 1 },
  '1dev-6m':  { price: 1499, name: '1 Device / 6 Months', devices: 1, months: 6 },
  '1dev-12m': { price: 2499, name: '1 Device / 1 Year',   devices: 1, months: 12 },
  '2dev-1m':  { price: 499,  name: '2 Devices / 1 Month', devices: 2, months: 1 },
  '2dev-6m':  { price: 2499, name: '2 Devices / 6 Months',devices: 2, months: 6 },
  '2dev-12m': { price: 3999, name: '2 Devices / 1 Year',  devices: 2, months: 12 },
  '4dev-1m':  { price: 799,  name: '4 Devices / 1 Month', devices: 4, months: 1 },
  '4dev-6m':  { price: 3999, name: '4 Devices / 6 Months',devices: 4, months: 6 },
  '4dev-12m': { price: 6499, name: '4 Devices / 1 Year',  devices: 4, months: 12 },
}

function getSupabase(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() } } }
  )
}

// POST: Request an upgrade (creates pending record)
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const planId = body.plan_id as string
  const plan = PLANS[planId]

  if (!plan) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const supabase = getSupabase(cookieStore)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get current subscription
  const { data: current } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!current || current.status !== 'active' || new Date(current.ends_at) <= new Date()) {
    return NextResponse.json({ error: 'No active subscription to upgrade' }, { status: 400 })
  }

  if (plan.devices <= current.max_devices) {
    return NextResponse.json({ error: 'New plan must have more devices than current plan' }, { status: 400 })
  }

  // Check if there's already a pending request
  const { data: existing } = await supabase
    .from('upgrade_requests')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .single()

  if (existing) {
    // Update existing pending request
    await supabase
      .from('upgrade_requests')
      .update({
        requested_plan_id: planId,
        requested_plan_name: plan.name,
        requested_max_devices: plan.devices,
        requested_price: plan.price,
        created_at: new Date().toISOString(),
      })
      .eq('id', existing.id)

    return NextResponse.json({ requested: true, updated: true, id: existing.id })
  }

  // Create new pending upgrade request
  const { data: inserted, error } = await supabase
    .from('upgrade_requests')
    .insert({
      user_id: user.id,
      current_plan_name: current.plan_name,
      current_max_devices: current.max_devices,
      requested_plan_id: planId,
      requested_plan_name: plan.name,
      requested_max_devices: plan.devices,
      requested_price: plan.price,
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to create upgrade request' }, { status: 500 })
  }

  return NextResponse.json({ requested: true, id: inserted.id })
}

// GET: Check if user has a pending upgrade request
export async function GET() {
  const cookieStore = await cookies()
  const supabase = getSupabase(cookieStore)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: pending } = await supabase
    .from('upgrade_requests')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .single()

  return NextResponse.json({ pending: pending || null })
}

// DELETE: Cancel a pending upgrade request
export async function DELETE() {
  const cookieStore = await cookies()
  const supabase = getSupabase(cookieStore)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await supabase
    .from('upgrade_requests')
    .delete()
    .eq('user_id', user.id)
    .eq('status', 'pending')

  return NextResponse.json({ cancelled: true })
}
