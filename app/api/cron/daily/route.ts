import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { todayInTimezone } from '@/lib/chat/normalize'
import { checkBudgetAlerts } from '@/lib/alerts/budget'
import { sendDueReminders, type UserRow } from '@/lib/alerts/reminders'
import { carryOverBudget } from '@/lib/budget/carry-over'

export const runtime = 'nodejs'
export const maxDuration = 60

/** Set to false if you'd rather enter every month's income yourself. */
const CARRY_OVER_BUDGET = true

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // fail closed
  const given = Buffer.from(request.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

async function step(report: Record<string, unknown>, name: string, work: () => Promise<unknown>) {
  try {
    report[name] = await work()
  } catch (err) {
    console.error(`[cron] ${name} failed:`, err)
    report[name] = { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: users, error } = await admin
    .from('user_settings')
    .select('user_id, timezone, currency, notification_email, alerts_enabled')
  if (error) {
    console.error('[cron] could not load users:', error)
    return NextResponse.json({ error: 'Could not load users' }, { status: 500 })
  }

  const results: Record<string, unknown>[] = []

  for (const u of users ?? []) {
    const user = u as UserRow & { alerts_enabled: boolean }
    const month = todayInTimezone(user.timezone).date.slice(0, 7)
    const report: Record<string, unknown> = { user: user.user_id.slice(0, 8), month }

    // 1. New month? Create its budget first, so the alert sweep below can see it
    await step(report, 'carryOver', async () =>
      CARRY_OVER_BUDGET ? carryOverBudget(admin, user.user_id, month) : 'disabled'
    )
    // 2. Rent / credit card / savings reminders
    await step(report, 'reminders', async () =>
      user.alerts_enabled ? sendDueReminders(admin, user) : 'alerts disabled'
    )
    // 3. Safety-net sweep for 80% / 100% alerts (the instant check runs after each chat expense)
    await step(report, 'budgetAlerts', async () =>
      user.alerts_enabled ? checkBudgetAlerts(user.user_id, month, admin) : 'alerts disabled'
    )

    results.push(report)
  }

  return NextResponse.json({ ok: true, results })
}