import { Button } from '@/components/ui/button'
import { TransactionCard } from './transaction-card'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { BudgetSnapshot } from '@/lib/chat/types'
import type { UiMessage } from '@/lib/chat/ui-types'

interface Props {
  message: UiMessage
  currency: string
  onUndo: (txId: string) => void
  onRetry: () => void
  onDismiss: () => void
}

function BudgetLine({ budget, currency }: { budget: BudgetSnapshot; currency: string }) {
  const tone =
    budget.remaining < 0
      ? 'text-red-600'
      : (budget.spentPct ?? 0) >= 80
        ? 'text-amber-600'
        : 'text-green-700'

  return (
    <p className="px-1 text-xs text-muted-foreground">
      Remaining after this entry{' '}
      <span className={cn('font-medium tabular-nums', tone)}>
        {formatMoney(budget.remaining, currency)}
      </span>
      {budget.spentPct !== null && <> · {Math.round(budget.spentPct)}% used</>}
    </p>
  )
}

export function MessageBubble({ message, currency, onUndo, onRetry, onDismiss }: Props) {
  if (message.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-1">
        <div
          className={cn(
            'max-w-[85%] space-y-2 rounded-2xl rounded-br-md bg-foreground px-3.5 py-2 text-background',
            message.status === 'sending' && 'opacity-60'
          )}
        >
          {message.imageUrl && (
            // Signed/blob URLs don't work with next/image, so a plain <img> is intentional here.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={message.imageUrl}
              alt="Receipt"
              className="max-h-60 w-full rounded-lg object-cover object-top"
            />
          )}
          {message.content && (
            <p className="whitespace-pre-wrap break-words text-[15px]">{message.content}</p>
          )}
        </div>

        {message.status === 'failed' && (
          <div className="flex items-center gap-2 text-xs text-red-600">
            <span>{message.error}</span>
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onRetry}>
              Retry
            </Button>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs text-muted-foreground"
              onClick={onDismiss}
            >
              Dismiss
            </Button>
          </div>
        )}
      </div>
    )
  }

  const hasActive = message.transactions.some((t) => t.state !== 'undone')

  return (
    <div className="flex flex-col items-start gap-2">
      {message.content && (
        <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-muted px-3.5 py-2 text-[15px]">
          {message.content}
        </div>
      )}

      {message.transactions.length > 0 && (
        <div className="w-full max-w-[92%] space-y-2">
          {message.transactions.map((tx) => (
            <TransactionCard key={tx.id} tx={tx} currency={currency} onUndo={() => onUndo(tx.id)} />
          ))}
          {message.budget && hasActive && <BudgetLine budget={message.budget} currency={currency} />}
        </div>
      )}
    </div>
  )
}