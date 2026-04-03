import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Admin endpoint — uses service role key to bypass RLS
// Call: POST /api/subscribe/upgrade/approve?id=<upgrade_request_id>

const PLANS: Record<string, { price: number; name: string; devices: number }> = {
  '1dev-1m':  { price: 299,  name: '1 Device / 1 Month',  devices: 1 },
  '1dev-6m':  { price: 1499, name: '1 Device / 6 Months', devices: 1 },
  '1dev-12m': { price: 2499, name: '1 Device / 1 Year',   devices: 1 },
  '2dev-1m':  { price: 499,  name: '2 Devices / 1 Month', devices: 2 },
  '2dev-6m':  { price: 2499, name: '2 Devices / 6 Months',devices: 2 },
  '2dev-12m': { price: 3999, name: '2 Devices / 1 Year',  devices: 2 },
  '4dev-1m':  { price: 799,  name: '4 Devices / 1 Month', devices: 4 },
  '4dev-6m':  { price: 3999, name: '4 Devices / 6 Months',devices: 4 },
  '4dev-12m': { price: 6499, name: '4 Devices / 1 Year',  devices: 4 },
}

export async function POST(request: NextRequest) {
  const requestId = request.nextUrl.searchParams.get('id')
  if (!requestId) {
    return NextResponse.json({ error: 'Missing upgrade request id' }, { status: 400 })
  }

  // Use anon key + server client for now (admin auth can be added later)
  // In production, protect this with an admin secret header
  const adminSecret = request.headers.get('x-admin-secret')
  if (adminSecret !== (process.env.ADMIN_SECRET || 'streamcorn-admin')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Fetch the pending request
  const { data: req, error: fetchErr } = await supabase
    .from('upgrade_requests')
    .select('*')
    .eq('id', requestId)
    .eq('status', 'pending')
    .single()

  if (fetchErr || !req) {
    return NextResponse.json({ error: 'Upgrade request not found or already resolved' }, { status: 404 })
  }

  const plan = PLANS[req.requested_plan_id]
  if (!plan) {
    return NextResponse.json({ error: 'Invalid plan in request' }, { status: 400 })
  }

  // Apply the upgrade to the subscription
  const { error: updateErr } = await supabase
    .from('subscriptions')
    .update({
      plan_name: plan.name,
      price: plan.price,
      max_devices: plan.devices,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', req.user_id)

  if (updateErr) {
    return NextResponse.json({ error: 'Failed to upgrade subscription' }, { status: 500 })
  }

  // Mark request as approved and delete it
  await supabase
    .from('upgrade_requests')
    .delete()
    .eq('id', requestId)

  return NextResponse.json({
    approved: true,
    user_id: req.user_id,
    new_plan: plan.name,
    new_devices: plan.devices,
  })
}
