import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Returns the caller's subscription state. Mirrors the shape of
 * Android's `SubscriptionState`: a derived `subscribed` boolean plus
 * the raw row. Columns that no longer exist in the live schema
 * (`auto_renew`, `upgrade_requests` joins, UPI-era payment_method) have
 * been removed.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ subscribed: false, subscription: null })
  }

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!sub) {
    return NextResponse.json({ subscribed: false, subscription: null })
  }

  const subscribed =
    sub.status === 'active' && new Date(sub.ends_at).getTime() > Date.now()

  return NextResponse.json({
    subscribed,
    subscription: {
      id: sub.id,
      plan_name: sub.plan_name,
      price: sub.price,
      max_devices: sub.max_devices,
      status: sub.status,
      starts_at: sub.starts_at,
      ends_at: sub.ends_at,
      trial_ends_at: sub.trial_ends_at,
      in_trial: sub.in_trial,
      applied_coupon_code: sub.applied_coupon_code,
      original_price: sub.original_price,
      effective_price: sub.effective_price,
    },
  })
}
