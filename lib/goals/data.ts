import type { SupabaseClient } from '@supabase/supabase-js'
import { todayInTimezone } from '@/lib/chat/normalize'
import { addDays, daysBetween, monthsUntil } from './helpers'
import type { GoalCardData } from './types'

interface GoalRow {
  id: string
  name: string
  target_amount: number | string
  saved_amount: number | string
  deadline: string
}

export async function loadGoals(
  supabase: SupabaseClient
): Promise<{ goals: GoalCardData[]; minDeadline: string }> {
  const [settingsRes, goalsRes] = await Promise.all([
    supabase.from('user_settings').select('timezone').maybeSingle(),
    supabase.from('savings_goals').select('id, name, target_amount, saved_amount, deadline').order('deadline'),
  ])
  if (goalsRes.error) throw goalsRes.error

  const today = todayInTimezone((settingsRes.data?.timezone as string | undefined) ?? 'Europe/Berlin').date

  const goals = ((goalsRes.data ?? []) as GoalRow[]).map(
    (g): GoalCardData => ({
      id: g.id,
      name: g.name,
      target: Number(g.target_amount),
      saved: Number(g.saved_amount),
      deadline: g.deadline,
      daysLeft: daysBetween(today, g.deadline),
      monthsLeft: monthsUntil(today, g.deadline),
    })
  )

  // Unfinished goals first (nearest deadline first), finished ones last
  goals.sort(
    (a, b) =>
      Number(a.saved >= a.target) - Number(b.saved >= b.target) || a.deadline.localeCompare(b.deadline)
  )

  return { goals, minDeadline: addDays(today, 1) }
}