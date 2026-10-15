import type { SupabaseClient } from '@supabase/supabase-js'
import { todayInTimezone } from '@/lib/chat/normalize'
import type { PaymentMethod, TransactionType } from '@/lib/chat/types'
import { daysInMonth, isMonthParam, shiftMonth } from './helpers'
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

export async function loadDashboard(
  supabase: SupabaseClient,
  monthParam: string | undefined
): Promise<DashboardData> {
  const { data: settings } = await supabase
    .from('user_settings')
    .select('currency, timezone')
    .maybeSingle()

  const currency = (settings?.currency as string | undefined) ?? 'EUR'
  const timezone = (settings?.timezone as string | undefined) ?? 'Europe/Berlin'

  const today = todayInTimezone(timezone).date // YYYY-MM-DD in the user's timezone
  const currentMonth = today.slice(0, 7)
  const month = isMonthParam(monthParam) && monthParam <= currentMonth ? monthParam : currentMonth
  const monthStart = `${month}-01`
  const nextStart = `${shiftMonth(month, 1)}-01`
  const isCurrentMonth = month === currentMonth

  const [summaryRes, spendRes, txRes, fixedRes, catRes] = await Promise.all([
    supabase
      .from('monthly_summary')
      .select(
        'total_income, extra_income, fixed_savings, fixed_costs, spent, available_budget, remaining_budget, spent_pct'
      )
      .eq('month', monthStart)
      .maybeSingle(),
    supabase
      .from('category_spend')
      .select('category_id, category_name, icon, monthly_limit, spent')
      .eq('month', monthStart),
    supabase
      .from('transactions')
      .select(
        'id, type, amount, payment_method, description, transaction_date, category:categories(name, icon)'
      )
      .gte('transaction_date', monthStart)
      .lt('transaction_date', nextStart)
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

  const s = summaryRes.data
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

  const categorySpend: CategorySpendRow[] = (spendRes.data ?? [])
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

  // "How much can I spend per day for the rest of the month?" (today included)
  let dailyAllowance: DashboardData['dailyAllowance'] = null
  if (isCurrentMonth && summary && summary.remaining > 0) {
    const daysLeft = daysInMonth(month) - Number(today.slice(8, 10)) + 1
    dailyAllowance = { perDay: summary.remaining / daysLeft, daysLeft }
  }

  return {
    month,
    monthStart,
    prevMonth: shiftMonth(month, -1),
    nextMonth: isCurrentMonth ? null : shiftMonth(month, 1),
    isCurrentMonth,
    currency,
    summary,
    categorySpend,
    totalSpent,
    transactions,
    fixedItems,
    limitCategories,
    dailyAllowance,
  }
}