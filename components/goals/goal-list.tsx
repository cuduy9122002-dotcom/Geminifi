import { PiggyBank } from 'lucide-react'
import type { GoalCardData } from '@/lib/goals/types'
import { GoalCard } from './goal-card'
import { NewGoalDialog } from './new-goal-dialog'

interface Props {
  goals: GoalCardData[]
  currency: string
  minDeadline: string
}

export function GoalList({ goals, currency, minDeadline }: Props) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Savings goals{goals.length > 0 ? ` · ${goals.length}` : ''}
        </h2>
        <NewGoalDialog minDeadline={minDeadline} />
      </div>

      {goals.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-6 text-center">
          <div
            className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full"
            style={{ background: 'linear-gradient(135deg, #FFD700, #DAA520)' }}
          >
            <PiggyBank className="size-5" style={{ color: '#5c4300' }} />
          </div>
          <p className="text-sm font-medium">No savings goals yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create a piggy bank, set a deadline, and watch it fill up.
          </p>
        </div>
      ) : (
        goals.map((goal) => <GoalCard key={goal.id} goal={goal} currency={currency} />)
      )}
    </section>
  )
}