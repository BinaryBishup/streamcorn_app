import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Poll Razorpay via the `razorpay-verify` edge function — it checks the
 * live subscription status and flips our DB row to `active` once
 * authenticated. Returns `{ verified: boolean }` for the client to poll.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ verified: false }, { status: 401 })

  const { data, error } = await supabase.functions.invoke<{ verified: boolean }>('razorpay-verify', {
    body: {},
  })
  if (error) return NextResponse.json({ verified: false })
  return NextResponse.json({ verified: !!data?.verified })
}
