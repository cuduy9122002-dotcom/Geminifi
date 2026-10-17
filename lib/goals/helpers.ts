import type { GoalMetrics } from './types'

const DAY_MS = 86_400_000
const DATE_LOCALE = 'en-DE' // English month names, day-first order
const MONEY_LOCALE = 'de-DE' // 1.234,50 € (en-DE would print €1,234.50)

const toUtc = (iso: string) => Date.parse(`${iso}T00:00:00Z`)

export const addDays = (iso: string, n: number) => new Date(toUtc(iso) + n * DAY_MS).toISOString().slice(0, 10)

/** Whole days from `from` to `to` (negative when `to` is earlier). Both YYYY-MM-DD. */
export const daysBetween = (from: string, to: string) => Math.round((toUtc(to) - toUtc(from)) / DAY_MS)

/**
 * Calendar months from today to the deadline, rounded UP (a started month counts as a month), minimum 1.
 * 16 Oct -> 16 Nov = 1, 16 Oct -> 17 Nov = 2, 16 Oct -> 31 Dec = 3.
 */
export function monthsUntil(today: string, deadline: string): number {
  const [ty, tm, td] = today.split('-').map(Number)
  const [dy, dm, dd] = deadline.split('-').map(Number)
  const completed = (dy - ty) * 12 + (dm - tm) - (dd < td ? 1 : 0)
  const partial = dd === td ? 0 : 1
  return Math.max(1, completed + partial)
}

/** Rounds UP to whole cents, ignoring floating-point noise (so 4.35 never becomes 4.36). */
const ceilCents = (n: number) => Math.ceil(Number((n * 100).toFixed(6))) / 100

/** "Minimum monthly savings" = (target - saved) / months left. Everything here is derived, never stored. */
export function goalMetrics(target: number, saved: number, daysLeft: number, monthsLeft: number): GoalMetrics {
  const remaining = Math.max(0, Math.round((target - saved) * 100) / 100)

  if (remaining === 0) {
    return { remaining, progressPct: 100, requiredPerMonth: null, monthsLeft: 0, status: 'completed' }
  }

  const progressPct = target > 0 ? Math.min(100, (saved / target) * 100) : 0

  if (daysLeft < 0) {
    // Deadline passed: everything that is missing is "due now"
    return { remaining, progressPct, requiredPerMonth: remaining, monthsLeft: 0, status: 'overdue' }
  }

  const months = Math.max(1, monthsLeft)
  return { remaining, progressPct, requiredPerMonth: ceilCents(remaining / months), monthsLeft: months, status: 'active' }
}

export function formatDeadline(iso: string): string {
  return new Intl.DateTimeFormat(DATE_LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`)
  )
}

export function timeLeftLabel(daysLeft: number, monthsLeft: number): string {
  if (daysLeft < 0) return `${Math.abs(daysLeft)} ${Math.abs(daysLeft) === 1 ? 'day' : 'days'} overdue`
  if (daysLeft === 0) return 'Due today'
  if (daysLeft === 1) return 'Due tomorrow'
  if (daysLeft < 60) return `${daysLeft} days left`
  return `${monthsLeft} months left`
}

/** Whole-amount currency for compact buttons: "50 €". */
export function formatWhole(amount: number, currency: string): string {
  return new Intl.NumberFormat(MONEY_LOCALE, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
}