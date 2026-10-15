import { LoaderCircle, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CategoryIcon } from '@/components/category-icon'
import { formatMoney, formatShortDate, PAYMENT_LABELS } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { UiTransaction } from '@/lib/chat/ui-types'

interface Props {
  tx: UiTransaction
  currency: string
  onUndo: () => void
}

export function TransactionCard({ tx, currency, onUndo }: Props) {
  const undone = tx.state === 'undone'
  const undoing = tx.state === 'undoing'
  const income = tx.type === 'income'
  const meta = [tx.category_name, PAYMENT_LABELS[tx.payment_method], formatShortDate(tx.transaction_date)]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border bg-card p-3 transition-opacity',
        undone && 'opacity-50'
      )}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
        <CategoryIcon name={tx.category_icon} className="size-4" />
      </div>

      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm font-medium', undone && 'line-through')}>
          {tx.description || tx.category_name}
        </p>
        <p className="truncate text-xs text-muted-foreground">{undone ? 'Undone' : meta}</p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span
          className={cn(
            'text-sm font-semibold tabular-nums',
            income && !undone && 'text-green-700',
            undone && 'line-through'
          )}
        >
          {income ? '+' : '−'}
          {formatMoney(tx.amount, currency)}
        </span>
        {!undone && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs text-muted-foreground"
            disabled={undoing}
            onClick={onUndo}
          >
            {undoing ? <LoaderCircle className="size-3 animate-spin" /> : <Undo2 className="size-3" />}
            Undo
          </Button>
        )}
      </div>
    </div>
  )
}