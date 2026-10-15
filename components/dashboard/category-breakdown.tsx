'use client'

import { Pie, PieChart } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { CategorySpendRow } from '@/lib/dashboard/types'

interface Props {
  rows: CategorySpendRow[] // already sorted by spend, descending
  total: number
  currency: string
}

const OVER_LIMIT = '#dc2626'

function grayAt(index: number, count: number): string {
  const lightness = count <= 1 ? 18 : 14 + (index / (count - 1)) * 62 // 14% (near black) .. 76% (light gray)
  return `hsl(0 0% ${lightness}%)`
}

export function CategoryBreakdown({ rows, total, currency }: Props) {
  const colors = rows.map((r, i) =>
    r.limit !== null && r.spent > r.limit ? OVER_LIMIT : grayAt(i, rows.length)
  )

  const config: ChartConfig = Object.fromEntries(
    rows.map((r, i) => [`c${i}`, { label: r.name, color: colors[i] }])
  )
  const data = rows.map((r, i) => ({ key: `c${i}`, value: r.spent, fill: `var(--color-c${i})` }))

  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Spending by category
      </h2>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No expenses this month yet.</p>
      ) : (
        <>
          <div className="relative mx-auto mt-3 w-full max-w-[220px]">
            <ChartContainer config={config} className="aspect-square w-full">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="key" />} />
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="key"
                  innerRadius="62%"
                  outerRadius="100%"
                  paddingAngle={1}
                  stroke="var(--card)"
                  strokeWidth={1}
                  isAnimationActive={false}
                />
              </PieChart>
            </ChartContainer>

            {/* Centre label as plain HTML: simpler and sturdier than a Recharts <Label> */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Spent</span>
              <span className="text-lg font-semibold tabular-nums">{formatMoney(total, currency)}</span>
            </div>
          </div>

          <ul className="mt-4 divide-y text-sm">
            {rows.map((r, i) => {
              const share = total > 0 ? (r.spent / total) * 100 : 0
              const limitPct = r.limit && r.limit > 0 ? (r.spent / r.limit) * 100 : null
              const barTone =
                limitPct === null
                  ? ''
                  : limitPct >= 100
                    ? 'bg-red-600'
                    : limitPct >= 80
                      ? 'bg-amber-500'
                      : 'bg-foreground/50'

              return (
                <li key={r.categoryId} className="py-2">
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-sm" style={{ background: colors[i] }} />
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{Math.round(share)}%</span>
                    <span className="w-24 text-right font-medium tabular-nums">
                      {formatMoney(r.spent, currency)}
                    </span>
                  </div>

                  {limitPct !== null && r.limit !== null && (
                    <div className="mt-1.5 flex items-center gap-2 pl-[18px]">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn('h-full rounded-full', barTone)}
                          style={{ width: `${Math.min(100, limitPct)}%` }}
                        />
                      </div>
                      <span
                        className={cn(
                          'text-[11px] tabular-nums',
                          limitPct >= 100 ? 'text-red-600' : 'text-muted-foreground'
                        )}
                      >
                        {Math.round(limitPct)}% of {formatMoney(r.limit, currency)}
                      </span>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}