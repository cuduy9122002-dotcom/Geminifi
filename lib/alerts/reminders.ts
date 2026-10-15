import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { todayInTimezone } from '@/lib/chat/normalize'
import { daysInMonth, shiftMonth } from '@/lib/dashboard/helpers'
import type { FixedItemKind } from '@/lib/dashboard/types'
import { sendEmail } from '@/lib/email/send'
import { reminderEmail, type ReminderLine } from '@/lib/email/templates'
import { claimAlerts, releaseAlerts, resolveRecipient } from './shared'

const DAY_MS = 86_400_000
const toUtc = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
const addDays = (iso: string, n: number) => new Date(toUtc(iso) + n * DAY_MS).toISOString().slice(0, 10)
const daysBetween = (from: string, to: string) => Math.round((toUtc(to) - toUtc(from)) / DAY_MS)

export interface UserRow {
  user_id: string
  timezone: string
  currency: string
  notification_email: string | null
}

export async function sendDueReminders(admin: SupabaseClient, user: UserRow): Promise<{ sent: number }> {
  const today = todayInTimezone(user.timezone).date
  const thisMonth = today.slice(0, 7)
  const months = [thisMonth, shiftMonth(thisMonth, 1)] // a reminder for the 1st can start in the previous month

  const { data: items, error } = await admin
    .from('fixed_items')
    .select('id, name, kind, amount, due_day, remind_days_before')
    .eq('user_id', user.user_id)
    .eq('is_active', true)
    .not('due_day', 'is', null)
  if (error) throw error

  const due: (ReminderLine & { key: string })[] = []

  for (const item of items ?? []) {
    for (const ym of months) {
      const day = Math.min(Number(item.due_day), daysInMonth(ym))
      const dueDate = `${ym}-${String(day).padStart(2, '0')}`
      const windowStart = addDays(dueDate, -Number(item.remind_days_before))

      if (windowStart <= today && today <= dueDate) {
        due.push({
          key: `${dueDate}:reminder:${item.id}`,
          name: item.name as string,
          kind: item.kind as FixedItemKind,
          amount: item.amount === null ? null : Number(item.amount),
          dueDate,
          daysUntil: daysBetween(today, dueDate),
        })
      }
    }
  }
  if (due.length === 0) return { sent: 0 }

  const claimed = await claimAlerts(
    admin,
    user.user_id,
    due.map((d) => ({
      key: d.key,
      kind: 'reminder' as const,
      payload: { name: d.name, dueDate: d.dueDate },
    }))
  )

  const lines = due.filter((d) => claimed.has(d.key)).sort((a, b) => a.daysUntil - b.daysUntil)
  if (lines.length === 0) return { sent: 0 }

  try {
    const to = await resolveRecipient(admin, user.user_id, user.notification_email)
    if (!to) throw new Error('No recipient email for reminders')
    await sendEmail({ to, ...reminderEmail({ lines, currency: user.currency }) })
  } catch (err) {
    await releaseAlerts(admin, user.user_id, [...claimed])
    throw err
  }

  return { sent: lines.length }
}