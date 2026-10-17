import { GoalList } from '@/components/goals/goal-list'
import { loadGoals } from '@/lib/goals/data'
import { createClient } from '@/lib/supabase/server'

export default async function SavingsPage() {
  const supabase = await createClient()

  const [{ goals, minDeadline }, settings] = await Promise.all([
    loadGoals(supabase),
    supabase.from('user_settings').select('currency').maybeSingle(),
  ])

  const currency = (settings.data?.currency as string | undefined) ?? 'EUR'

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 px-3 py-4">
        <h1 className="sr-only">Savings</h1>
        <GoalList goals={goals} currency={currency} minDeadline={minDeadline} />
      </div>
    </div>
  )
}