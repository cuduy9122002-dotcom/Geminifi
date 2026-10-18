/**
 * Payday-to-payday budget cycles. Pure functions, no imports: the server, the browser and the tests
 * all compute exactly the same boundaries.
 *
 * A cycle is identified by a KEY, "YYYY-MM": the month in which the cycle ENDS.
 * With payday on the 22nd, the "2026-09" cycle runs from Aug 22 to Sep 21 (your "September" budget).
 * With payday on the 1st the cycles are the calendar months, so existing data keeps its meaning.
 * The key date ("2026-09-01") is what monthly_budgets.month stores.
 *
 * Paydays on the 29th-31st use the last day of shorter months (e.g. the 31st becomes Feb 28).
 */

const DAY_MS = 86_400_000
const pad = (n: number) => String(n).padStart(2, '0')
const toUtc = (iso: string) => Date.parse(`${iso}T00:00:00Z`)

export const addDays = (iso: string, n: number) => new Date(toUtc(iso) + n * DAY_MS).toISOString().slice(0, 10)
export const daysBetween = (from: string, to: string) => Math.round((toUtc(to) - toUtc(from)) / DAY_MS)

/** "2026-12" + 1 -> "2027-01" */
export function shiftKey(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}

function daysIn(key: string): number {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Anything that isn't a whole number from 1 to 31 becomes 1 (calendar months). */
export function normalizeCycleDay(value: unknown): number {
  const n = Math.trunc(Number(value))
  return Number.isFinite(n) && n >= 1 && n <= 31 ? n : 1
}

export interface Cycle {
  key: string // "YYYY-MM": the month the cycle ends in
  keyDate: string // "YYYY-MM-01": stored in monthly_budgets.month
  start: string // first day, YYYY-MM-DD
  end: string // last day (inclusive), YYYY-MM-DD
  days: number // length in days
  label: string // "Aug 22 – Sep 21"
}

const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const monthDayYear = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const fmt = (f: Intl.DateTimeFormat, iso: string) => f.format(new Date(`${iso}T00:00:00Z`))

/**
 * "Aug 22 – Sep 21". The year is added only when it matters: a cycle that spans New Year shows both
 * years, and a cycle from a different year than `ref` (usually today) shows the year once at the end.
 */
export function formatCycleLabel(start: string, end: string, ref?: string): string {
  if (start.slice(0, 4) !== end.slice(0, 4)) return `${fmt(monthDayYear, start)} – ${fmt(monthDayYear, end)}`
  if (ref && ref.slice(0, 4) !== end.slice(0, 4)) return `${fmt(monthDay, start)} – ${fmt(monthDayYear, end)}`
  return `${fmt(monthDay, start)} – ${fmt(monthDay, end)}`
}

/** First day of the cycle with this key. */
function startOf(key: string, day: number): string {
  if (day === 1) return `${key}-01`
  const previous = shiftKey(key, -1)
  return `${previous}-${pad(Math.min(day, daysIn(previous)))}`
}

export function cycleFromKey(key: string, cycleDay: number, labelRef?: string): Cycle {
  const day = normalizeCycleDay(cycleDay)
  const start = startOf(key, day)
  const end = addDays(startOf(shiftKey(key, 1), day), -1)
  return {
    key,
    keyDate: `${key}-01`,
    start,
    end,
    days: daysBetween(start, end) + 1,
    label: formatCycleLabel(start, end, labelRef),
  }
}

/** The key of the cycle that contains `date` (YYYY-MM-DD). */
export function cycleKeyFor(date: string, cycleDay: number): string {
  const day = normalizeCycleDay(cycleDay)
  const month = date.slice(0, 7)
  if (day === 1) return month
  const paydayThisMonth = `${month}-${pad(Math.min(day, daysIn(month)))}`
  // On or after this month's payday the cycle ends NEXT month; before it, the cycle ends this month
  return date >= paydayThisMonth ? shiftKey(month, 1) : month
}

/** The cycle that contains `date`. */
export function cycleFor(date: string, cycleDay: number): Cycle {
  return cycleFromKey(cycleKeyFor(date, cycleDay), cycleDay, date)
}

/** Where `today` sits inside a cycle. daysLeft counts today. */
export function cycleProgress(cycle: Cycle, today: string) {
  const daysLeft = Math.max(0, daysBetween(today, cycle.end) + 1)
  const daysElapsed = Math.min(cycle.days, Math.max(0, daysBetween(cycle.start, today) + 1))
  return { daysLeft, daysElapsed, elapsedPct: Math.round((daysElapsed / cycle.days) * 100) }
}