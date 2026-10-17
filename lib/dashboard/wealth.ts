import type { SupabaseClient } from '@supabase/supabase-js'

export interface Wealth {
  totalBalance: number
  cashOnHand: number
}

export async function loadWealth(supabase: SupabaseClient): Promise<Wealth | null> {
  const { data, error } = await supabase
    .from('wealth_summary')
    .select('total_balance, cash_on_hand')
    .maybeSingle()

  if (error) {
    console.error('[dashboard] wealth summary failed:', error)
    return null
  }
  if (!data) return null

  return {
    totalBalance: Number(data.total_balance),
    cashOnHand: Number(data.cash_on_hand),
  }
}