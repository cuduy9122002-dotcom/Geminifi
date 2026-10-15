import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * Service-role client: bypasses RLS. Only for cron jobs and background work.
 * Every query made with it MUST filter by user_id explicitly.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY is not set')

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}