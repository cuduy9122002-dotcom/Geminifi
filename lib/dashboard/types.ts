import type { PaymentMethod, TransactionType } from '@/lib/chat/types'
import type { Cycle } from '@/lib/cycles'

export type FixedItemKind = 'fixed_cost' | 'savings' | 'reminder'

export interface FixedItemRow {
  id: string
  name: string
  kind: FixedItemKind
  amount: number | null
  due_day: number | null
  remind_days_before: number
  is_active: boolean
}

export interface LimitCategory {
  id: string
  name: string
  monthly_limit: number | null
}

export interface MonthlySummary {
  totalIncome: number
  extraIncome: number
  fixedSavings: number
  fixedCosts: number
  spent: number
  available: number
  remaining: number
  spentPct: number | null
}

export interface CategorySpendRow {
  categoryId: string
  name: string
  icon: string | null
  spent: number
  limit: number | null
}

export interface DashboardTransaction {
  id: string
  type: TransactionType
  amount: number
  description: string | null
  categoryName: string
  categoryIcon: string | null
  paymentMethod: PaymentMethod
  date: string // YYYY-MM-DD
}

export interface UserSettingsView {
  cycleStartDay: number // 1-31: the day your salary arrives
  openingBalance: number
  openingCash: number
}

export interface DashboardData {
  currency: string
  today: string // YYYY-MM-DD in the user's timezone
  settings: UserSettingsView
  current: Cycle // the running cycle: hero, "Edit budget", alerts
  selected: Cycle // the cycle being reviewed: categories + transactions (== current unless you browse back)
  prevKey: string
  nextKey: string | null // null when `selected` IS the current cycle
  summary: MonthlySummary | null // current cycle; null = no budget set for it yet
  categorySpend: CategorySpendRow[] // selected cycle
  totalSpent: number // selected cycle
  transactions: DashboardTransaction[] // selected cycle
  fixedItems: FixedItemRow[]
  limitCategories: LimitCategory[]
  dailyAllowance: { perDay: number; daysLeft: number } | null // current cycle
}