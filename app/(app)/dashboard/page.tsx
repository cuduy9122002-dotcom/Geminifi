import { createClient } from '@/lib/supabase/server'
import { loadDashboard } from '@/lib/dashboard/data'
import { loadWealth } from '@/lib/dashboard/wealth'
import { BudgetHero } from '@/components/dashboard/budget-hero'
import { BudgetSheet } from '@/components/dashboard/budget-sheet'
import { CategoryBreakdown } from '@/components/dashboard/category-breakdown'
import { MonthSwitcher } from '@/components/dashboard/month-switcher'
import { SettingsDialog } from '@/components/dashboard/settings-dialog'
import { SignOutButton } from '@/components/dashboard/sign-out-button'
import { TransactionList } from '@/components/dashboard/transaction-list'
import { WealthStrip } from '@/components/dashboard/wealth-strip'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>
}) {
  const { cycle } = await searchParams
  const supabase = await createClient()
  const [data, wealth] = await Promise.all([loadDashboard(supabase, cycle), loadWealth(supabase)])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 px-3 py-4">
        <h1 className="sr-only">Dashboard</h1>

        {/* Header: only the three actions */}
        <header className="flex items-center justify-end gap-1">
          <BudgetSheet
            monthStart={data.current.keyDate}
            monthLabel={data.current.label}
            currency={data.currency}
            income={data.summary?.totalIncome ?? null}
            fixedItems={data.fixedItems}
            limitCategories={data.limitCategories}
          />
          <SettingsDialog settings={data.settings} today={data.today} />
          <SignOutButton />
        </header>

        {/* Secondary: small, all-time figures */}
        <WealthStrip wealth={wealth} currency={data.currency} />

        {/* Primary: the running cycle's remaining budget stays the focal point */}
        <BudgetHero
          summary={data.summary}
          fallbackSpent={data.totalSpent}
          cycleLabel={data.current.label}
          currency={data.currency}
          dailyAllowance={data.dailyAllowance}
        />

        {/* Review: the switcher governs only the two sections below it */}
        <MonthSwitcher
          label={data.selected.label}
          prevKey={data.prevKey}
          nextKey={data.nextKey}
          currentKey={data.current.key}
        />

        <CategoryBreakdown rows={data.categorySpend} total={data.totalSpent} currency={data.currency} />

        <TransactionList transactions={data.transactions} currency={data.currency} />

        <footer className="flex justify-center gap-4 pb-2 pt-1 text-xs text-muted-foreground">
          <a href="/api/export" className="underline-offset-2 hover:underline">
            Backup (JSON)
          </a>
          <a href="/api/export?format=csv" className="underline-offset-2 hover:underline">
            Transactions (CSV)
          </a>
        </footer>
      </div>
    </div>
  )
}