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
    return NextResponse.json({ subscribed: false, subscription: null })
  }

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!sub) {
    return NextResponse.json({ subscribed: false, subscription: null })
  }

  const isSubscribed = sub.status === 'active' && new Date(sub.ends_at) > new Date()

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
  })
}
