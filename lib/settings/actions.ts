'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { todayInTimezone } from '@/lib/chat/normalize'
import { cycleFor } from '@/lib/cycles'
import { parseAmountInput } from '@/lib/dashboard/helpers'
import { createClient } from '@/lib/supabase/server'

type Result = { ok: true } | { ok: false; error: string }

const MAX_AMOUNT = 100_000_000

/** Empty means 0. Accepts German input (2.500,50). */
function parseField(
  raw: unknown,
  label: string,
  allowNegative: boolean
): { value: number } | { error: string } {
  const text = String(raw ?? '').trim()
  if (text === '') return { value: 0 }
  const n = parseAmountInput(text)
  if (n === null) return { error: `${label}: enter a number, e.g. 2500 or 2.500,50` }
  if (Math.abs(n) > MAX_AMOUNT) return { error: `${label} is too large.` }
  if (!allowNegative && n < 0) return { error: `${label} can't be negative.` }
  return { value: n }
}

/**
 * A new payday can put "today" into a cycle that has no budget yet (for example, switching from
 * the 1st to the 22nd on Oct 25 moves you into the cycle that ends in November). Create that
 * cycle's budget from your most recent one, so the dashboard isn't empty after saving.
 */
async function ensureCurrentCycleBudget(supabase: SupabaseClient, cycleDay: number) {
  const { data: s } = await supabase.from('user_settings').select('timezone').maybeSingle()
  const today = todayInTimezone((s?.timezone as string | undefined) ?? 'Europe/Berlin').date
  const cycle = cycleFor(today, cycleDay)

  const { data: existing } = await supabase
    .from('monthly_budgets')
    .select('id')
    .eq('month', cycle.keyDate)
    .maybeSingle()
  if (existing) return

  const { data: previous } = await supabase
    .from('monthly_budgets')
    .select('total_income')
    .lt('month', cycle.keyDate)
    .order('month', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!previous) return

  const { error } = await supabase.rpc('init_monthly_budget', {
    p_month: cycle.keyDate,
    p_income: Number(previous.total_income),
  })
  if (error) throw error
}

export async function saveSettings(input: {
  openingBalance: string
  openingCash: string
  cycleStartDay: string
}): Promise<Result> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub as string | undefined
  if (!userId) return { ok: false, error: 'Please sign in again.' }

  const balance = parseField(input.openingBalance, 'Initial total balance', true)
  if ('error' in balance) return { ok: false, error: balance.error }

  const cash = parseField(input.openingCash, 'Initial cash on hand', false)
  if ('error' in cash) return { ok: false, error: cash.error }

  const day = Number(input.cycleStartDay)
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return { ok: false, error: 'The cycle start day must be a whole number from 1 to 31.' }
  }

  const { error } = await supabase.from('user_settings').upsert(
    {
      user_id: userId,
      opening_balance: balance.value,
      opening_cash: cash.value,
      cycle_start_day: day,
    },
    { onConflict: 'user_id' }
  )
  if (error) {
    console.error('[settings] save failed:', error)
    return { ok: false, error: 'Could not save your settings. Please try again.' }
  }

  try {
    await ensureCurrentCycleBudget(supabase, day)
  } catch (err) {
    // The settings are saved; the daily job will create the budget if this didn't work
    console.error('[settings] could not prepare the current cycle budget:', err)
  }

  // Every number on the dashboard depends on these settings
  revalidatePath('/dashboard')
  return { ok: true }
}