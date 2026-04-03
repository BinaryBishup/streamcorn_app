import { createClient } from '@/lib/supabase/client'

export async function signOut() {
  try {
    const supabase = createClient()
    await supabase.auth.signOut()
  } catch {}
  localStorage.clear()
  // Clear all cookies by setting them expired
  document.cookie.split(';').forEach(c => {
    const name = c.split('=')[0].trim()
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
  })
  window.location.href = '/auth'
}
