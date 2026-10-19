import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { cycleFor, normalizeCycleDay } from '@/lib/cycles'
import { sendEmail } from '@/lib/email/send'
import { budgetAlertEmail, type AlertLine } from '@/lib/email/templates'
import { formatMoney } from '@/lib/format'
import { claimAlerts, releaseAlerts, resolveRecipient, type ClaimEntry } from './shared'

const THRESHOLDS = [100, 80] as const // highest first

interface Candidate {
  scope: 'overall' | 'category'
  idBase: string
  label: string
  spent: number
  limit: number
  pct: number
  note?: string
}

/**
 * Checks the budget + category limits of the payday cycle that contains `onDate` (YYYY-MM-DD, in the
 * user's timezone) and emails any newly crossed thresholds.
 * Safe to call as often as you like: alerts_log prevents repeats.
 */
export async function checkBudgetAlerts(
  userId: string,
  onDate: string,
  admin: SupabaseClient = createAdminClient()
): Promise<{ sent: number }> {
  const { data: settings, error: settingsError } = await admin
    .from('user_settings')
    .select('currency, notification_email, alerts_enabled, cycle_start_day')
    .eq('user_id', userId)
    .maybeSingle()
  if (settingsError) throw settingsError
  if (!settings || !settings.alerts_enabled) return { sent: 0 }

  const currency = settings.currency as string
  const cycle = cycleFor(onDate, normalizeCycleDay(settings.cycle_start_day))
  const month = cycle.key // part of the alert's dedupe key: one alert per cycle and threshold

  // The service role has no logged-in user, so the user id is passed explicitly (p_user)
  const [summaryRes, catRes] = await Promise.all([
    admin
      .rpc('cycle_summary', { p_key: cycle.keyDate, p_start: cycle.start, p_end: cycle.end, p_user: userId })
      .maybeSingle(),
    admin.rpc('cycle_category_spend', { p_start: cycle.start, p_end: cycle.end, p_user: userId }),
  ])
  if (summaryRes.error) throw summaryRes.error
  if (catRes.error) throw catRes.error

  const candidates: Candidate[] = []

  // supabase-js types a database function's rows as {}, so say what they are
  const s = summaryRes.data as Record<string, number | string | null> | null
  if (s && s.spent_pct !== null) {
    candidates.push({
      scope: 'overall',
      idBase: `${month}:overall`,
      label: 'Overall budget',
      spent: Number(s.spent),
      limit: Number(s.available_budget),
      pct: Number(s.spent_pct),
      note: `Remaining ${formatMoney(Number(s.remaining_budget), currency)}`,
    })
  }

  for (const c of (catRes.data ?? []) as Record<string, unknown>[]) {
    if (c.pct_of_limit === null) continue
    candidates.push({
      scope: 'category',
      idBase: `${month}:cat:${c.category_id}`,
      label: c.category_name as string,
      spent: Number(c.spent),
      limit: Number(c.monthly_limit),
      pct: Number(c.pct_of_limit),
    })
  }

  const crossed = candidates
    .map((c) => ({ c, thresholds: THRESHOLDS.filter((t) => c.pct >= t) }))
    .filter((x) => x.thresholds.length > 0)
  if (crossed.length === 0) return { sent: 0 }

  // Reserve every crossed threshold; announce only the highest one per scope
  const entries: ClaimEntry[] = crossed.flatMap(({ c, thresholds }) =>
    thresholds.map((t) => ({
      key: `${c.idBase}:${t}`,
      kind: c.scope === 'overall' ? ('overall_budget' as const) : ('category_budget' as const),
      payload: { pct: c.pct, spent: c.spent, limit: c.limit },
    }))
  )
  const claimed = await claimAlerts(admin, userId, entries)

  const lines: AlertLine[] = []
  for (const { c, thresholds } of crossed) {
    const top = thresholds[0]
    if (claimed.has(`${c.idBase}:${top}`)) {
      lines.push({
        scope: c.scope,
        label: c.label,
        threshold: top,
        spent: c.spent,
        limit: c.limit,
        pct: c.pct,
        note: c.note,
      })
    }
  }
  if (lines.length === 0) return { sent: 0 }

  try {
    const to = await resolveRecipient(admin, userId, settings.notification_email as string | null)
    if (!to) throw new Error('No recipient email for budget alerts')
    await sendEmail({ to, ...budgetAlertEmail({ lines, currency }) })
  } catch (err) {
    await releaseAlerts(admin, userId, [...claimed]) // let the next run retry
    throw err
  }

  return { sent: lines.length }
}