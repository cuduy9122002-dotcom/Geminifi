export type GoalStatus = 'active' | 'completed' | 'overdue'

export interface GoalMetrics {
  remaining: number
  progressPct: number // 0..100
  requiredPerMonth: number | null // null when the goal is completed
  monthsLeft: number
  status: GoalStatus
}

/** Everything a goal card needs. Dates are resolved on the server, in the user's timezone. */
export interface GoalCardData {
  id: string
  name: string
  target: number
  saved: number
  deadline: string // YYYY-MM-DD
  daysLeft: number // negative = overdue
  monthsLeft: number
}

export type ActionResult = { ok: true } | { ok: false; error: string }

export type DepositResult =
  | { ok: true; savedAmount: number; targetAmount: number; completed: boolean }
  | { ok: false; error: string }