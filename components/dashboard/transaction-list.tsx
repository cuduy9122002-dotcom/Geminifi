'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LoaderCircle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/category-icon'
import { formatMoney, PAYMENT_LABELS } from '@/lib/format'
import { formatDayHeading } from '@/lib/dashboard/helpers'
import { cn } from '@/lib/utils'
import type { DashboardTransaction } from '@/lib/dashboard/types'

interface Props {
  transactions: DashboardTransaction[]
  currency: string
}

export function TransactionList({ transactions, currency }: Props) {
  const router = useRouter()
  const [armedId, setArmedId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // The armed state expires after 3 seconds
  useEffect(() => {
    if (!armedId) return
    const timer = setTimeout(() => setArmedId(null), 3000)
    return () => clearTimeout(timer)
  }, [armedId])

  async function remove(id: string) {
    if (armedId !== id) {
      setArmedId(id)
      return
    }
    setArmedId(null)
    setBusyId(id)
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
      if (res.ok || res.status === 404) {
        toast('Transaction deleted')
        router.refresh()
      } else {
        toast.error('Could not delete this transaction.')
      }
    } catch {
      toast.error('Network error. Could not delete.')
    } finally {
      setBusyId(null)
    }
  }

  // Group by date (the query already returns newest first)
  const groups: { date: string; items: DashboardTransaction[] }[] = []
  for (const t of transactions) {
    const last = groups[groups.length - 1]
    if (last && last.date === t.date) last.items.push(t)
    else groups.push({ date: t.date, items: [t] })
  }

  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Transactions · {transactions.length}
      </h2>

      {groups.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nothing logged this month.</p>
      ) : (
        <div className="mt-3 space-y-4">
          {groups.map((g) => (
            <div key={g.date}>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{formatDayHeading(g.date)}</p>
              <ul className="divide-y border-y">
                {g.items.map((t) => {
                  const income = t.type === 'income'
                  const armed = armedId === t.id
                  const meta = [t.categoryName, PAYMENT_LABELS[t.paymentMethod]].filter(Boolean).join(' · ')

                  return (
                    <li key={t.id} className="flex items-center gap-3 py-2">
                      <CategoryIcon name={t.categoryIcon} className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{t.description || t.categoryName}</p>
                        <p className="truncate text-xs text-muted-foreground">{meta}</p>
                      </div>
                      <span className={cn('text-sm tabular-nums', income && 'text-green-700')}>
                        {income ? '+' : '−'}
                        {formatMoney(t.amount, currency)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void remove(t.id)}
                        disabled={busyId === t.id}
                        aria-label={armed ? 'Tap again to confirm delete' : 'Delete transaction'}
                        className={cn(
                          'flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-xs transition-colors',
                          armed
                            ? 'bg-red-600 text-white'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        {busyId === t.id ? (
                          <LoaderCircle className="size-3.5 animate-spin" />
                        ) : armed ? (
                          'Sure?'
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}