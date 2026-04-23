import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

/**
 * Browser-side Supabase client. Singleton — reuses the same instance across
 * the page so the auth state listener and realtime channels stay attached.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (_client) return _client
  _client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  return _client
}

// Legacy alias for files that still import `createClient` from here.
export const createClient = getSupabaseBrowserClient
