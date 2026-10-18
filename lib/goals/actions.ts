'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { checkBudgetAlerts } from '@/lib/alerts/budget'
import { todayInTimezone } from '@/lib/chat/normalize'
import { parseAmountInput } from '@/lib/dashboard/helpers'
import { createClient } from '@/lib/supabase/server'
import { addDays } from './helpers'
import type { ActionResult, DepositResult } from './types'

const MAX_GOALS = 20
const MAX_TARGET = 10_000_000
const MAX_DEPOSIT = 1_000_000
const MAX_YEARS_AHEAD = 50
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const t = Date.parse(`${value}T00:00:00Z`)
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === value
}

async function getUser() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  return { supabase, userId: (data?.claims?.sub as string | undefined) ?? null }
}

/* ---------- Create ---------- */

export async function createGoal(input: {
  name: string
  target: string
  deadline: string
}): Promise<ActionResult> {
  const { supabase, userId } = await getUser()
  if (!userId) return { ok: false, error: 'Please sign in again.' }

  const name = String(input.name ?? '').trim()
  if (name.length < 1 || name.length > 60) {
    return { ok: false, error: 'Give the goal a name (up to 60 characters).' }
  }

  const target = parseAmountInput(String(input.target ?? ''))
  if (target === null || target <= 0 || target > MAX_TARGET) {
    return { ok: false, error: 'Enter a target amount above 0, e.g. 1500 or 1.500,00' }
  }

  const deadline = String(input.deadline ?? '')
  if (!isRealDate(deadline)) return { ok: false, error: 'Pick a valid deadline.' }

  const { data: settings } = await supabase.from('user_settings').select('timezone').maybeSingle()
  const today = todayInTimezone((settings?.timezone as string | undefined) ?? 'Europe/Berlin').date
  if (deadline <= today) return { ok: false, error: 'The deadline must be in the future.' }
  if (deadline > addDays(today, 365 * MAX_YEARS_AHEAD)) return { ok: false, error: 'That deadline is too far away.' }

  const { count } = await supabase.from('savings_goals').select('id', { count: 'exact', head: true })
  if ((count ?? 0) >= MAX_GOALS) {
    return { ok: false, error: `You can have up to ${MAX_GOALS} goals. Delete one first.` }
  }

  const { error } = await supabase
    .from('savings_goals')
    .insert({ user_id: userId, name, target_amount: target, deadline })
  if (error) {
    console.error('[goals] create failed:', error)
    return { ok: false, error: 'Could not create the goal. Please try again.' }
  }

  revalidatePath('/savings')
  return { ok: true }
}

/* ---------- Deposit (atomic, in the database) ---------- */

export async function depositToGoal(input: { goalId: string; amount: number }): Promise<DepositResult> {
  const { supabase, userId } = await getUser()
  if (!userId) return { ok: false, error: 'Please sign in again.' }

  if (!UUID_RE.test(String(input.goalId))) return { ok: false, error: 'Unknown goal.' }

  const amount = Math.round(Number(input.amount) * 100) / 100
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_DEPOSIT) {
    return { ok: false, error: 'Invalid deposit amount.' }
  }

  const { data, error } = await supabase.rpc('deposit_to_goal', {
    p_goal_id: input.goalId,
    p_amount: amount,
  })

  if (error) {
    console.error('[goals] deposit failed:', error)
    return {
      ok: false,
      error: error.message.includes('Goal not found')
        ? 'This goal no longer exists.'
        : 'Could not save the deposit. Nothing was changed.',
    }
  }

  const result = data as {
    saved_amount: number | string
    target_amount: number | string
    completed: boolean
    transaction_date: string
  }

  // A deposit is spending: check the 80% / 100% budget alerts, after the response is sent
  after(async () => {
    try {
      await checkBudgetAlerts(userId, String(result.transaction_date))
    } catch (err) {
      console.error('[alerts] check after deposit failed:', err)
    }
  })

  revalidatePath('/savings')
  revalidatePath('/dashboard')
  return {
    ok: true,
    savedAmount: Number(result.saved_amount),
    targetAmount: Number(result.target_amount),
    completed: Boolean(result.completed),
  }
}

/* ---------- Delete ---------- */

export async function deleteGoal(goalId: string): Promise<ActionResult> {
  const { supabase, userId } = await getUser()
  if (!userId) return { ok: false, error: 'Please sign in again.' }
  if (!UUID_RE.test(String(goalId))) return { ok: false, error: 'Unknown goal.' }

  // ONE statement. The foreign key (ON DELETE CASCADE, migration 003) removes every deposit that
  // belongs to this goal in the same atomic step: all gone together, or nothing changed.
  const { error } = await supabase.from('savings_goals').delete().eq('id', goalId)
  if (error) {
    console.error('[goals] delete failed:', error)
    return { ok: false, error: 'Could not delete the goal. Nothing was changed.' }
  }

  // The deposits are gone, so the month's budget changed: refresh both pages
  revalidatePath('/savings')
  revalidatePath('/dashboard')
  return { ok: true }
}