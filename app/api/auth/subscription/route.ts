import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET() {
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
    return NextResponse.json({ subscribed: false, subscription: null, pending_payment: null })
  }

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!sub) {
    return NextResponse.json({ subscribed: false, subscription: null, pending_payment: null })
  }

  const isSubscribed = sub.status === 'active' && new Date(sub.ends_at) > new Date()

  // Check for pending payment: status is 'expired' with a transaction_id created < 30 min ago
  let pendingPayment = null
  if (sub.status === 'expired' && sub.transaction_id) {
    const updatedAt = new Date(sub.updated_at).getTime()
    const elapsed = (Date.now() - updatedAt) / 1000
    if (elapsed < 30 * 60) {
      pendingPayment = {
        transaction_id: sub.transaction_id,
        plan_name: sub.plan_name,
        price: sub.price,
        max_devices: sub.max_devices,
        initiated_at: sub.updated_at,
        seconds_remaining: Math.floor(30 * 60 - elapsed),
      }
    }
  }

  // Also check upgrade_requests for pending upgrades
  let pendingUpgrade = null
  if (isSubscribed) {
    const { data: upgrade } = await supabase
      .from('upgrade_requests')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .single()
    if (upgrade) {
      pendingUpgrade = {
        id: upgrade.id,
        requested_plan_name: upgrade.requested_plan_name,
        requested_price: upgrade.requested_price,
        requested_max_devices: upgrade.requested_max_devices,
        created_at: upgrade.created_at,
      }
    }
  }

  return NextResponse.json({
    subscribed: isSubscribed,
    subscription: {
      id: sub.id,
      plan_name: sub.plan_name,
      price: sub.price,
      max_devices: sub.max_devices,
      status: sub.status,
      starts_at: sub.starts_at,
      ends_at: sub.ends_at,
      auto_renew: sub.auto_renew,
      payment_method: sub.payment_method || 'upi',
    },
    pending_payment: pendingPayment,
    pending_upgrade: pendingUpgrade,
  })
}
