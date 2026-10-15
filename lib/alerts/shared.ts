import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ClaimEntry {
  key: string
  kind: 'overall_budget' | 'category_budget' | 'reminder'
  payload: Record<string, unknown>
}

/** Reserves alert keys in alerts_log. Returns the keys that were NOT already there. */
export async function claimAlerts(
  admin: SupabaseClient,
  userId: string,
  entries: ClaimEntry[]
): Promise<Set<string>> {
  if (entries.length === 0) return new Set()

  const { data, error } = await admin
    .from('alerts_log')
    .upsert(
      entries.map((e) => ({ user_id: userId, dedupe_key: e.key, kind: e.kind, payload: e.payload })),
      { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true }
    )
    .select('dedupe_key')

  if (error) throw error
  return new Set((data ?? []).map((r) => r.dedupe_key as string))
}

/** Un-reserves keys after a failed send, so the next run retries. */
export async function releaseAlerts(admin: SupabaseClient, userId: string, keys: string[]) {
  if (keys.length === 0) return
  const { error } = await admin.from('alerts_log').delete().eq('user_id', userId).in('dedupe_key', keys)
  if (error) console.error('[alerts] could not release keys:', error)
}

export async function resolveRecipient(
  admin: SupabaseClient,
  userId: string,
  notificationEmail: string | null
): Promise<string | null> {
  if (notificationEmail) return notificationEmail
  const { data } = await admin.auth.admin.getUserById(userId)
  return data.user?.email ?? null
}