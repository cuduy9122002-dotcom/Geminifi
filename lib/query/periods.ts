import { daysInMonth, formatMonthLabel, isMonthParam, shiftMonth } from '@/lib/dashboard/helpers'
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
  month: string | null // YYYY-MM when the period is exactly one calendar month
  days: number // elapsed days in the period (up to today), at least 1
}

type PeriodSpec = Pick<QuerySpec, 'period' | 'month' | 'date_from' | 'date_to'>

export function resolvePeriod(spec: PeriodSpec, today: string): ResolvedPeriod {
  const currentMonth = today.slice(0, 7)

  const span = (from: string, to: string, label: string, month: string | null = null): ResolvedPeriod => ({
    from,
    to,
    label,
    month,
    days: Math.max(1, daysBetween(from, to < today ? to : today) + 1),
  })

  const wholeMonth = (ym: string, label: string) =>
    span(`${ym}-01`, `${ym}-${String(daysInMonth(ym)).padStart(2, '0')}`, label, ym)

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
      return wholeMonth(shiftMonth(currentMonth, -1), 'Last month')
    case 'specific_month':
      if (isMonthParam(spec.month) && spec.month <= currentMonth) {
        return wholeMonth(spec.month, spec.month === currentMonth ? 'This month' : formatMonthLabel(spec.month))
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

  return wholeMonth(currentMonth, 'This month')
}