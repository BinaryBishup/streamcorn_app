import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Delegates to the `validate-coupon` edge function so the preview price
 * shown on the subscribe screen is computed by the same code that will
 * evaluate the coupon at mandate-creation time.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ valid: false }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const code = (body?.code || '').toString().trim().toUpperCase()
  const planId = (body?.plan_id || '').toString()
  if (!code || !planId) return NextResponse.json({ valid: false, message: 'Missing code or plan_id' }, { status: 400 })

  const { data, error } = await supabase.functions.invoke('validate-coupon', {
    body: { code, plan_id: planId },
  })
  if (error) return NextResponse.json({ valid: false, message: error.message })
  return NextResponse.json(data ?? { valid: false })
}
