import { createClient } from '@/lib/supabase/client'

export async function signOut() {
  try {
    const supabase = createClient()
    await supabase.auth.signOut()
  } catch {}
  // Only remove Streamcorn-specific keys — supabase.auth.signOut() handles auth cookies
  localStorage.removeItem('streamcorn_device_id')
  localStorage.removeItem('streamcorn_profile_id')
  localStorage.removeItem('streamcorn_profile_name')
  window.location.href = '/auth'
}
