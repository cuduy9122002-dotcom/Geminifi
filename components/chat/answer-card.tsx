import { cn } from '@/lib/utils'
import type { AnswerCard, Tone } from '@/lib/query/types'

const TONE: Record<Tone, string> = {
  good: 'text-green-700',
  warn: 'text-amber-600',
  bad: 'text-red-600',
}

export function AnswerCardView({ card }: { card: AnswerCard }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{card.title}</p>

      {card.headline && (
        <div className="mt-1.5">
          <p className="text-xs text-muted-foreground">{card.headline.label}</p>
          <p
            className={cn(
              'text-2xl font-semibold tabular-nums tracking-tight',
              card.headline.tone && TONE[card.headline.tone]
            )}
          >
            {card.headline.value}
          </p>
        </div>
      )}

      {card.rows.length > 0 && (
        <dl className="mt-2 divide-y border-t text-xs">
          {card.rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 py-1.5">
              <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
              <dd className={cn('truncate text-right tabular-nums', row.tone && TONE[row.tone])}>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {card.items && card.items.length > 0 && (
        <ul className="mt-2 divide-y border-t">
          {card.items.map((item, i) => (
            <li key={`${item.primary}-${i}`} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{item.primary}</p>
                <p className="truncate text-xs text-muted-foreground">{item.secondary}</p>
              </div>
              <span className="shrink-0 text-sm tabular-nums">{item.value}</span>
            </li>
          ))}
        </ul>
      )}

      {card.footnote && <p className="mt-2 text-[11px] text-muted-foreground">{card.footnote}</p>}
    </div>
  )
}