import type { PaymentMethod, TransactionType } from '@/lib/chat/types'

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

export interface DashboardData {
  month: string // YYYY-MM
  monthStart: string // YYYY-MM-01
  prevMonth: string
  nextMonth: string | null // null when already on the current month
  isCurrentMonth: boolean
  currency: string
  summary: MonthlySummary | null // null = no budget set for this month yet
  categorySpend: CategorySpendRow[]
  totalSpent: number
  transactions: DashboardTransaction[]
  fixedItems: FixedItemRow[]
  limitCategories: LimitCategory[]
  dailyAllowance: { perDay: number; daysLeft: number } | null
}