import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  label: string // "Aug 22 – Sep 21"
  prevKey: string // cycle keys, "YYYY-MM"
  nextKey: string | null // null = already on the current cycle
  currentKey: string
}

const arrow = 'flex size-8 items-center justify-center rounded-md'

/** Browses payday-to-payday cycles. It only changes the chart and the list below it. */
export function MonthSwitcher({ label, prevKey, nextKey, currentKey }: Props) {
  // The current cycle needs no parameter, so its address stays clean
  const hrefFor = (key: string) => (key === currentKey ? '/dashboard' : `/dashboard?cycle=${key}`)

  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Review cycle</h2>

      <div className="flex items-center gap-1">
        {nextKey !== null && (
          <Link
            href="/dashboard"
            scroll={false}
            className="mr-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
          >
            Current
          </Link>
        )}

        <Link
          href={hrefFor(prevKey)}
          scroll={false}
          aria-label="Previous cycle"
          className={cn(arrow, 'text-muted-foreground hover:bg-muted')}
        >
          <ChevronLeft className="size-4" />
        </Link>

        <span className="min-w-36 text-center text-sm font-semibold tabular-nums">{label}</span>

        {nextKey ? (
          <Link
            href={hrefFor(nextKey)}
            scroll={false}
            aria-label="Next cycle"
            className={cn(arrow, 'text-muted-foreground hover:bg-muted')}
          >
            <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span className={cn(arrow, 'text-muted-foreground/30')} aria-hidden>
            <ChevronRight className="size-4" />
          </span>
        )}
      </div>
    </div>
  )
}