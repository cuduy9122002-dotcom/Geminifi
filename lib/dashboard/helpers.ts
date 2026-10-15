const LOCALE = 'en-DE'
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export function isMonthParam(value: string | undefined): value is string {
  return !!value && MONTH_RE.test(value)
}

/** shiftMonth('2026-12', 1) -> '2027-01' */
export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function formatMonthLabel(ym: string): string {
  return new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${ym}-01T00:00:00Z`)
  )
}

export function formatDayHeading(isoDate: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`))
}

export function parseAmountInput(raw: string): number | null {
  const s = raw.trim().replace(/[€\s]/g, '')
  if (!s) return null

  let normalized: string
  if (s.includes(',') && s.includes('.')) {
    // Whichever separator comes last is the decimal one
    normalized =
      s.lastIndexOf(',') > s.lastIndexOf('.')
        ? s.replace(/\./g, '').replace(',', '.')
        : s.replace(/,/g, '')
  } else if (s.includes(',')) {
    normalized = s.replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    normalized = s.replace(/\./g, '') // 3.000 -> 3000
  } else {
    normalized = s
  }

  const n = Number(normalized)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}