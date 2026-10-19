import type { SupabaseClient } from '@supabase/supabase-js'
import { todayInTimezone } from '@/lib/chat/normalize'
import type { PaymentMethod, TransactionType } from '@/lib/chat/types'
import { cycleFor, cycleFromKey, cycleProgress, normalizeCycleDay, shiftKey } from '@/lib/cycles'
import { isMonthParam } from './helpers'
import type {
  CategorySpendRow,
  DashboardData,
  DashboardTransaction,
  FixedItemRow,
  LimitCategory,
  MonthlySummary,
} from './types'

interface TxRow {
  id: string
  type: TransactionType
  amount: number | string
  payment_method: PaymentMethod
  description: string | null
  transaction_date: string
  category: { name: string; icon: string | null } | null
}

/**
 * Everything the dashboard shows, for a payday-to-payday cycle instead of a calendar month.
 *   - the running ("current") cycle drives the hero, the budget sheet and the daily allowance
 *   - the browsed ("selected") cycle drives the category chart and the transaction list
 * `cycleParam` is the cycle key from ?cycle=YYYY-MM (the month the cycle ends in); anything invalid
 * or in the future falls back to the current cycle.
 */
export async function loadDashboard(
  supabase: SupabaseClient,
  cycleParam: string | undefined
): Promise<DashboardData> {
  const { data: row } = await supabase
    .from('user_settings')
    .select('currency, timezone, cycle_start_day, opening_balance, opening_cash')
    .maybeSingle()

  const currency = (row?.currency as string | undefined) ?? 'EUR'
  const timezone = (row?.timezone as string | undefined) ?? 'Europe/Berlin'
  const cycleStartDay = normalizeCycleDay(row?.cycle_start_day)
  const settings = {
    cycleStartDay,
    openingBalance: Number(row?.opening_balance ?? 0),
    openingCash: Number(row?.opening_cash ?? 0),
  }

  const today = todayInTimezone(timezone).date // YYYY-MM-DD in the user's timezone
  const current = cycleFor(today, cycleStartDay)
  const selected =
    isMonthParam(cycleParam) && cycleParam >= '2000-01' && cycleParam < current.key
      ? cycleFromKey(cycleParam, cycleStartDay, today)
      : current

  const [summaryRes, spendRes, txRes, fixedRes, catRes] = await Promise.all([
    // Hero: always the running cycle
    supabase
      .rpc('cycle_summary', { p_key: current.keyDate, p_start: current.start, p_end: current.end })
      .maybeSingle(),
    // Review: the selected cycle
    supabase.rpc('cycle_category_spend', { p_start: selected.start, p_end: selected.end }),
    supabase
      .from('transactions')
      .select(
        'id, type, amount, payment_method, description, transaction_date, category:categories(name, icon)'
      )
      .gte('transaction_date', selected.start)
      .lte('transaction_date', selected.end)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('fixed_items')
      .select('id, name, kind, amount, due_day, remind_days_before, is_active')
      .order('created_at'),
    supabase
      .from('categories')
      .select('id, name, monthly_limit')
      .eq('kind', 'expense')
      .eq('is_active', true)
      .order('sort_order'),
  ])

  for (const res of [summaryRes, spendRes, txRes, fixedRes, catRes]) {
    if (res.error) throw res.error
  }

  // supabase-js can't know what a database function returns, so it types the row as {}: say what it is
  const s = summaryRes.data as Record<string, number | string | null> | null
  const summary: MonthlySummary | null = s
    ? {
        totalIncome: Number(s.total_income),
        extraIncome: Number(s.extra_income),
        fixedSavings: Number(s.fixed_savings),
        fixedCosts: Number(s.fixed_costs),
        spent: Number(s.spent),
        available: Number(s.available_budget),
        remaining: Number(s.remaining_budget),
        spentPct: s.spent_pct === null ? null : Number(s.spent_pct),
      }
    : null

  const categorySpend: CategorySpendRow[] = ((spendRes.data ?? []) as Record<string, unknown>[])
    .map((r) => ({
      categoryId: r.category_id as string,
      name: r.category_name as string,
      icon: (r.icon as string | null) ?? null,
      spent: Number(r.spent),
      limit: r.monthly_limit === null ? null : Number(r.monthly_limit),
    }))
    .sort((a, b) => b.spent - a.spent)

  const totalSpent = categorySpend.reduce((sum, c) => sum + c.spent, 0)

  const transactions: DashboardTransaction[] = ((txRes.data ?? []) as unknown as TxRow[]).map((t) => ({
    id: t.id,
    type: t.type,
    amount: Number(t.amount),
    description: t.description,
    categoryName: t.category?.name ?? 'Uncategorized',
    categoryIcon: t.category?.icon ?? null,
    paymentMethod: t.payment_method,
    date: t.transaction_date,
  }))

  const fixedItems: FixedItemRow[] = (fixedRes.data ?? []).map((f) => ({
    id: f.id as string,
    name: f.name as string,
    kind: f.kind as FixedItemRow['kind'],
    amount: f.amount === null ? null : Number(f.amount),
    due_day: (f.due_day as number | null) ?? null,
    remind_days_before: Number(f.remind_days_before),
    is_active: Boolean(f.is_active),
  }))

  const limitCategories: LimitCategory[] = (catRes.data ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    monthly_limit: c.monthly_limit === null ? null : Number(c.monthly_limit),
  }))

  // "How much per day until the next payday?" (today included)
  const { daysLeft } = cycleProgress(current, today)
  const dailyAllowance =
    summary && summary.remaining > 0 && daysLeft > 0
      ? { perDay: summary.remaining / daysLeft, daysLeft }
      : null

  return {
    currency,
    today,
    settings,
    current,
    selected,
    prevKey: shiftKey(selected.key, -1),
    nextKey: selected.key === current.key ? null : shiftKey(selected.key, 1),
    summary,
    categorySpend,
    totalSpent,
    transactions,
    fixedItems,
    limitCategories,
    dailyAllowance,
  }
}