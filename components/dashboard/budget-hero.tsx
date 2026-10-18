import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { MonthlySummary } from '@/lib/dashboard/types'

interface Props {
  summary: MonthlySummary | null
  fallbackSpent: number
  cycleLabel: string // "Aug 22 – Sep 21"
  currency: string
  dailyAllowance: { perDay: number; daysLeft: number } | null
}

function toneOf(s: MonthlySummary) {
  if (s.remaining < 0) return { text: 'text-red-600', bar: 'bg-red-600' }
  if ((s.spentPct ?? 0) >= 80) return { text: 'text-amber-600', bar: 'bg-amber-500' }
  return { text: 'text-green-700', bar: 'bg-green-600' }
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between py-1.5', strong && 'font-semibold')}>
      <dt className={strong ? '' : 'text-muted-foreground'}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}

export function BudgetHero({ summary, fallbackSpent, cycleLabel, currency, dailyAllowance }: Props) {
  const m = (n: number) => formatMoney(n, currency)

  if (!summary) {
    return (
      <section className="rounded-xl border bg-card p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Remaining available budget
          </p>
          <p className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{cycleLabel}</p>
        </div>
        <p className="mt-1 text-4xl font-semibold tracking-tight text-muted-foreground">—</p>
        <p className="mt-2 text-sm text-muted-foreground">
          No budget set for {cycleLabel}. Tap <span className="font-medium text-foreground">Set up budget</span> to enter
          your income and fixed costs.
        </p>
        {fallbackSpent > 0 && (
          <p className="mt-3 border-t pt-3 font-mono text-xs text-muted-foreground">
            Spent so far <span className="tabular-nums text-foreground">{m(fallbackSpent)}</span>
          </p>
        )}
      </section>
    )
  }

  const tone = toneOf(summary)
  const pct = summary.spentPct ?? (summary.spent > 0 ? 100 : 0)

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Remaining available budget
        </p>
        <p className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{cycleLabel}</p>
      </div>
      <p className={cn('mt-1 text-4xl font-semibold tabular-nums tracking-tight', tone.text)}>
        {m(summary.remaining)}
      </p>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full', tone.bar)} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-xs tabular-nums text-muted-foreground">
        <span>{Math.round(pct)}% of available budget used</span>
        {dailyAllowance && (
          <span>
            {m(dailyAllowance.perDay)}/day · {dailyAllowance.daysLeft}d left
          </span>
        )}
      </div>

      <dl className="mt-4 divide-y border-t font-mono text-xs">
        <Row label="Income" value={m(summary.totalIncome)} />
        {summary.extraIncome > 0 && <Row label="+ Extra income" value={m(summary.extraIncome)} />}
        <Row label="− Fixed savings" value={`−${m(summary.fixedSavings)}`} />
        <Row label="− Fixed costs" value={`−${m(summary.fixedCosts)}`} />
        <Row label="= Available" value={m(summary.available)} strong />
        <Row label="− Spent" value={`−${m(summary.spent)}`} />
      </dl>
    </section>
  )
}