import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const PRICES: Record<string, { price: number; name: string; devices: number; months: number }> = {
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

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const planId = (body.plan_id as string) || '1dev-1m'
  const plan = PRICES[planId] || PRICES['1dev-1m']

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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check if already active with the same plan
  const { data: existingSub } = await supabase
    .from('subscriptions')
    .select('id, status, ends_at, plan_name')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (existingSub && new Date(existingSub.ends_at) > new Date() && existingSub.plan_name === plan.name) {
    return NextResponse.json({ error: 'Already subscribed to this plan' }, { status: 400 })
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  const transactionId = `SC-${timestamp}-${random}`

  // Upsert subscription as pending-like (we store it but status stays 'expired' until payment confirmed)
  const now = new Date()
  const endsAt = new Date(now.getTime() + plan.months * 30 * 24 * 60 * 60 * 1000)

  // Store pending info in the subscription row itself
  const { error } = await supabase
    .from('subscriptions')
    .upsert({
      user_id: user.id,
      plan_name: plan.name,
      price: plan.price,
      max_devices: plan.devices,
      status: 'expired',
      starts_at: now.toISOString(),
      ends_at: endsAt.toISOString(),
      payment_method: 'upi',
      transaction_id: transactionId,
      updated_at: now.toISOString(),
    }, { onConflict: 'user_id' })

  if (error) {
    return NextResponse.json({ error: 'Failed to initiate' }, { status: 500 })
  }

  return NextResponse.json({
    payment_id: transactionId,
    transaction_id: transactionId,
    amount: plan.price,
    plan_name: plan.name,
  })
}
