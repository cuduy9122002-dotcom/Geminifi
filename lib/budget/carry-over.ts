import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export type CarryOverResult = 'exists' | 'no-previous-budget' | 'created'

/** If this month has no budget yet, create it from the latest previous income + current fixed items. */
export async function carryOverBudget(
  admin: SupabaseClient,
  userId: string,
  month: string // YYYY-MM
): Promise<CarryOverResult> {
  const monthStart = `${month}-01`

  const { data: existing } = await admin
    .from('monthly_budgets')
    .select('id')
    .eq('user_id', userId)
    .eq('month', monthStart)
    .maybeSingle()
  if (existing) return 'exists'

  const { data: previous } = await admin
    .from('monthly_budgets')
    .select('total_income')
    .eq('user_id', userId)
    .lt('month', monthStart)
    .order('month', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!previous) return 'no-previous-budget'

  const { data: items, error } = await admin
    .from('fixed_items')
    .select('kind, amount')
    .eq('user_id', userId)
    .eq('is_active', true)
  if (error) throw error

  const sum = (kind: string) =>
    (items ?? []).filter((i) => i.kind === kind).reduce((acc, i) => acc + Number(i.amount ?? 0), 0)

  const { error: insertError } = await admin.from('monthly_budgets').upsert(
    {
      user_id: userId,
      month: monthStart,
      total_income: Number(previous.total_income),
      fixed_savings: sum('savings'),
      fixed_costs: sum('fixed_cost'),
    },
    { onConflict: 'user_id,month', ignoreDuplicates: true }
  )
  if (insertError) throw insertError

  return 'created'
}
