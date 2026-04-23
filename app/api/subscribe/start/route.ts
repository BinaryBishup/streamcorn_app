import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Start (or upgrade) the caller's subscription by invoking the
 * `razorpay-subscribe` edge function. Returns the Razorpay
 * subscription id the client hands to Checkout.js.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const planId = body?.plan_id
  if (!planId) return NextResponse.json({ error: 'Missing plan_id' }, { status: 400 })

  const { data, error } = await supabase.functions.invoke('razorpay-subscribe', {
    body: {
      plan_id: planId,
      coupon_code: body?.coupon_code || null,
    },
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? {})
}
