import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const paymentId = request.nextUrl.searchParams.get('payment_id')
  if (!paymentId) {
    return NextResponse.json({ error: 'Missing payment_id' }, { status: 400 })
  }

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

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status, transaction_id, ends_at')
    .eq('user_id', user.id)
    .single()

  if (!sub) {
    return NextResponse.json({ status: 'pending', subscription_active: false })
  }

  if (sub.status === 'active' && new Date(sub.ends_at) > new Date()) {
    return NextResponse.json({ status: 'completed', subscription_active: true })
  }

  return NextResponse.json({ status: 'pending', subscription_active: false })
}
