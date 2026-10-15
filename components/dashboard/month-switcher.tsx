import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  label: string
  prevMonth: string
  nextMonth: string | null
}

const arrow = 'flex size-8 items-center justify-center rounded-md'

export function MonthSwitcher({ label, prevMonth, nextMonth }: Props) {
  return (
    <div className="flex items-center gap-1">
      <Link
        href={`/dashboard?month=${prevMonth}`}
        aria-label="Previous month"
        className={cn(arrow, 'text-muted-foreground hover:bg-muted')}
      >
        <ChevronLeft className="size-4" />
      </Link>
      <h1 className="min-w-32 text-center text-sm font-semibold">{label}</h1>
      {nextMonth ? (
        <Link
          // Going forward to the current month drops the param
          href={`/dashboard?month=${nextMonth}`}
          aria-label="Next month"
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
  )
}