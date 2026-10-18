import { cycleFromKey, cycleKeyFor, shiftKey } from '@/lib/cycles'
import { isMonthParam } from '@/lib/dashboard/helpers'
import { formatShortDate } from '@/lib/format'
import type { QuerySpec } from '@/lib/gemini/schema'

const DAY_MS = 86_400_000
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const toUtc = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
const addDays = (iso: string, n: number) => new Date(toUtc(iso) + n * DAY_MS).toISOString().slice(0, 10)
const daysBetween = (from: string, to: string) => Math.round((toUtc(to) - toUtc(from)) / DAY_MS)

function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const t = toUtc(value)
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === value
}

export interface ResolvedPeriod {
  from: string // inclusive, YYYY-MM-DD
  to: string // inclusive, YYYY-MM-DD
  label: string
  month: string | null // cycle key (YYYY-MM) when the period is exactly one payday cycle
  days: number // elapsed days in the period (up to today), at least 1
}

type PeriodSpec = Pick<QuerySpec, 'period' | 'month' | 'date_from' | 'date_to'>

/**
 * "This month", "last month" and "in September" mean the user's payday CYCLES (the one containing today,
 * the one before it, and the one that ENDS in September), not calendar months.
 */
export function resolvePeriod(spec: PeriodSpec, today: string, cycleStartDay: number): ResolvedPeriod {
  const currentKey = cycleKeyFor(today, cycleStartDay)

  const span = (from: string, to: string, label: string, month: string | null = null): ResolvedPeriod => ({
    from,
    to,
    label,
    month,
    days: Math.max(1, daysBetween(from, to < today ? to : today) + 1),
  })

  const wholeCycle = (key: string, label: string) => {
    const cycle = cycleFromKey(key, cycleStartDay, today)
    return span(cycle.start, cycle.end, label, key)
  }

  const weekdayOffset = (new Date(toUtc(today)).getUTCDay() + 6) % 7 // Monday = 0

  switch (spec.period) {
    case 'today':
      return span(today, today, 'Today')
    case 'yesterday': {
      const d = addDays(today, -1)
      return span(d, d, 'Yesterday')
    }
    case 'this_week':
      return span(addDays(today, -weekdayOffset), today, 'This week')
    case 'last_week': {
      const start = addDays(today, -weekdayOffset - 7)
      return span(start, addDays(start, 6), 'Last week')
    }
    case 'last_7_days':
      return span(addDays(today, -6), today, 'Last 7 days')
    case 'last_30_days':
      return span(addDays(today, -29), today, 'Last 30 days')
    case 'last_month':
      return wholeCycle(shiftKey(currentKey, -1), 'Last cycle')
    case 'specific_month':
      if (isMonthParam(spec.month) && spec.month >= '2000-01' && spec.month <= currentKey) {
        return wholeCycle(
          spec.month,
          spec.month === currentKey ? 'This cycle' : cycleFromKey(spec.month, cycleStartDay, today).label
        )
      }
      break
    case 'custom_range':
      if (isRealDate(spec.date_from) && isRealDate(spec.date_to) && spec.date_from <= today) {
        const to = spec.date_to > today ? today : spec.date_to
        if (spec.date_from <= to) {
          return span(spec.date_from, to, `${formatShortDate(spec.date_from)} – ${formatShortDate(to)}`)
        }
      }
      break
  }

  return wholeCycle(currentKey, 'This cycle')
}