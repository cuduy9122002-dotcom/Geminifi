'use client'

import { useEffect, useOptimistic, useState, useTransition } from 'react'
import { CalendarDays, LoaderCircle, PiggyBank, Trash2, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import { formatMoney } from '@/lib/format'
import { deleteGoal, depositToGoal } from '@/lib/goals/actions'
import { fireCoins } from '@/lib/goals/confetti'
import { formatDeadline, formatWhole, goalMetrics, timeLeftLabel } from '@/lib/goals/helpers'
import type { GoalCardData } from '@/lib/goals/types'
import { cn } from '@/lib/utils'

const QUICK_AMOUNTS = [10, 50, 100] as const

const GOLD_GRADIENT = 'linear-gradient(90deg, #DAA520, #FDB931 55%, #FFD700)'
const GOLD_COIN = 'linear-gradient(135deg, #FFD700, #DAA520)'

interface Props {
  goal: GoalCardData
  currency: string
}

export function GoalCard({ goal, currency }: Props) {
  const [isPending, startTransition] = useTransition()
  const [armed, setArmed] = useState(false) // two-tap delete
  const [saved, addSaved] = useOptimistic(goal.saved, (current: number, amount: number) => current + amount)

  const m = goalMetrics(goal.target, saved, goal.daysLeft, goal.monthsLeft)
  const done = m.status === 'completed'
  const money = (n: number) => formatMoney(n, currency)

  // The "Sure?" state expires after 3 seconds
  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(timer)
  }, [armed])

  function deposit(amount: number, button: HTMLButtonElement) {
    if (isPending) return

    const completes = saved < goal.target && saved + amount >= goal.target
    void fireCoins(button, { big: completes }) // on tap, not after the server answers
    navigator.vibrate?.(completes ? [30, 50, 80] : 20)

    startTransition(async () => {
      addSaved(amount) // instant; reverts by itself if the action fails
      const res = await depositToGoal({ goalId: goal.id, amount })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(res.completed ? `Goal reached: ${goal.name}!` : `+${money(amount)} saved for ${goal.name}`)
    })
  }

  function remove() {
    if (!armed) {
      setArmed(true)
      return
    }
    setArmed(false)
    startTransition(async () => {
      const res = await deleteGoal(goal.id)
      if (!res.ok) toast.error(res.error)
      else toast(goal.saved > 0 ? `Goal deleted. ${money(goal.saved)} is back in your budget.` : 'Goal deleted.')
    })
  }

  return (
    <article
      className={cn(
        'rounded-2xl border bg-card p-4 transition-shadow',
        done && 'border-[#DAA520]/70 shadow-[0_0_28px_-8px_rgba(253,185,49,0.7)]'
      )}
    >
      {/* Header */}
      <header className="flex items-start gap-3">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: GOLD_COIN }}
        >
          <PiggyBank className="size-5" style={{ color: '#5c4300' }} />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{goal.name}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarDays className="size-3 shrink-0" />
            <span className="truncate">
              {formatDeadline(goal.deadline)} · {timeLeftLabel(goal.daysLeft, goal.monthsLeft)}
            </span>
          </p>
        </div>

        <button
          type="button"
          onClick={remove}
          disabled={isPending}
          aria-label={armed ? 'Tap again to delete this goal' : `Delete goal ${goal.name}`}
          className={cn(
            'flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-xs transition-colors',
            armed ? 'bg-red-600 text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          {armed ? 'Sure?' : <Trash2 className="size-3.5" />}
        </button>
      </header>

      {/* Amounts */}
      <div className="mt-4 flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate tabular-nums">
          <span className="text-2xl font-semibold tracking-tight">{money(saved)}</span>{' '}
          <span className="text-xs text-muted-foreground">of {money(goal.target)}</span>
        </p>
        <span className="text-sm font-semibold tabular-nums" style={{ color: '#B8860B' }}>
          {Math.round(m.progressPct)}%
        </span>
      </div>

      {/* Progress bar with 25 / 50 / 75 % milestone ticks */}
      <div
        className="relative mt-2 h-3 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={`${goal.name} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(m.progressPct)}
      >
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{
            width: `${m.progressPct}%`,
            background: GOLD_GRADIENT,
            boxShadow: '0 0 10px rgba(253,185,49,0.55)',
          }}
        />
        {[25, 50, 75].map((tick) => (
          <span
            key={tick}
            className="absolute inset-y-0 w-px bg-card/80"
            style={{ left: `${tick}%` }}
            aria-hidden
          />
        ))}
      </div>

      {/* Minimum monthly savings */}
      <div className="mt-3 rounded-xl bg-muted/60 px-3 py-2.5">
        {m.status === 'completed' ? (
          <p className="flex items-center gap-2 text-sm font-medium" style={{ color: '#7a5700' }}>
            <Trophy className="size-4" /> Goal reached. Nicely done!
          </p>
        ) : m.status === 'overdue' ? (
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Deadline passed</p>
            <p className="text-lg font-semibold tabular-nums text-red-600">{money(m.remaining)} still missing</p>
          </div>
        ) : (
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Minimum monthly savings
              </p>
              <p className="text-lg font-semibold tabular-nums">{money(m.requiredPerMonth ?? 0)}</p>
            </div>
            <p className="pb-0.5 text-right text-xs tabular-nums text-muted-foreground">
              {money(m.remaining)} to go
              <br />
              over {m.monthsLeft} {m.monthsLeft === 1 ? 'month' : 'months'}
            </p>
          </div>
        )}
      </div>

      {/* One-tap deposits */}
      {!done && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {QUICK_AMOUNTS.map((amount) => (
            <button
              key={amount}
              type="button"
              disabled={isPending}
              onClick={(e) => deposit(amount, e.currentTarget)}
              aria-label={`Deposit ${formatWhole(amount, currency)} into ${goal.name}`}
              className="flex h-11 touch-manipulation select-none items-center justify-center gap-1 rounded-xl text-sm font-semibold transition active:scale-95 disabled:opacity-50"
              style={{
                background: 'rgba(253,185,49,0.16)',
                color: '#7a5700',
                boxShadow: 'inset 0 0 0 1px rgba(218,165,32,0.45)',
              }}
            >
              {isPending ? <LoaderCircle className="size-3.5 animate-spin" /> : '+'}
              {formatWhole(amount, currency)}
            </button>
          ))}
        </div>
      )}
    </article>
  )
}