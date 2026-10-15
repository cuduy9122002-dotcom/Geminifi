import { createClient } from '@/lib/supabase/server'
import { loadDashboard } from '@/lib/dashboard/data'
import { formatMonthLabel } from '@/lib/dashboard/helpers'
import { BudgetHero } from '@/components/dashboard/budget-hero'
import { BudgetSheet } from '@/components/dashboard/budget-sheet'
import { CategoryBreakdown } from '@/components/dashboard/category-breakdown'
import { MonthSwitcher } from '@/components/dashboard/month-switcher'
import { SignOutButton } from '@/components/dashboard/sign-out-button'
import { TransactionList } from '@/components/dashboard/transaction-list'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const { month } = await searchParams
  const supabase = await createClient()
  const data = await loadDashboard(supabase, month)
  const monthLabel = formatMonthLabel(data.month)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 px-3 py-4">
        <header className="flex items-center justify-between">
          <MonthSwitcher label={monthLabel} prevMonth={data.prevMonth} nextMonth={data.nextMonth} />
          <div className="flex items-center gap-1">
            {data.isCurrentMonth && (
              <BudgetSheet
                monthStart={data.monthStart}
                monthLabel={monthLabel}
                currency={data.currency}
                income={data.summary?.totalIncome ?? null}
                fixedItems={data.fixedItems}
                limitCategories={data.limitCategories}
              />
            )}
            <SignOutButton />
          </div>
        </header>

        <BudgetHero
          summary={data.summary}
          fallbackSpent={data.totalSpent}
          monthLabel={monthLabel}
          currency={data.currency}
          dailyAllowance={data.dailyAllowance}
        />

        <CategoryBreakdown rows={data.categorySpend} total={data.totalSpent} currency={data.currency} />

        <TransactionList transactions={data.transactions} currency={data.currency} /><footer className="flex justify-center gap-4 pb-2 pt-1 text-xs text-muted-foreground">
  <a href="/api/export" className="underline-offset-2 hover:underline">Backup (JSON)</a>
  <a href="/api/export?format=csv" className="underline-offset-2 hover:underline">Transactions (CSV)</a>
</footer>
      </div>
    </div>
  )
}