import type { SupabaseClient } from '@supabase/supabase-js'

const LIMITS = [
  { windowMs: 60_000, max: 12, label: 'a minute' },
  { windowMs: 24 * 60 * 60_000, max: 300, label: 'a day' },
] as const

/** Returns an error message when over a limit, otherwise null. Uses the user's session (RLS-scoped). */
export async function checkChatRateLimit(supabase: SupabaseClient): Promise<string | null> {
  const counts = await Promise.all(
    LIMITS.map(({ windowMs }) =>
      supabase
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'user')
        .gte('created_at', new Date(Date.now() - windowMs).toISOString())
    )
  )

  for (let i = 0; i < LIMITS.length; i++) {
    const { count, error } = counts[i]
    if (error) return null // fail open
    if ((count ?? 0) >= LIMITS[i].max) {
      return `Slow down: you've sent ${LIMITS[i].max} messages in ${LIMITS[i].label}.`
    }
  }
  return null
}