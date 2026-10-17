import { Banknote, Landmark } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Wealth } from '@/lib/dashboard/wealth'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

function Stat({
  icon,
  label,
  value,
  currency,
  hint,
}: {
  icon: ReactNode
  label: string
  value: number
  currency: string
  hint: string
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2" title={hint}>
      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className={cn('mt-0.5 text-base font-semibold tabular-nums', value < 0 && 'text-red-600')}>
        {formatMoney(value, currency)}
      </p>
    </div>
  )
}

export function WealthStrip({ wealth, currency }: { wealth: Wealth | null; currency: string }) {
  if (!wealth) return null

  return (
    <section aria-label="Overall position, all time" className="grid grid-cols-2 gap-2">
      <Stat
        icon={<Landmark className="size-3" />}
        label="Total balance"
        value={wealth.totalBalance}
        currency={currency}
        hint="All time: opening balance + income (monthly budgets + logged) − expenses (logged + fixed costs). Money in savings goals still counts."
      />
      <Stat
        icon={<Banknote className="size-3" />}
        label="Cash on hand"
        value={wealth.cashOnHand}
        currency={currency}
        hint="All time: opening cash + income logged as cash − expenses logged as cash."
      />
    </section>
  )
}