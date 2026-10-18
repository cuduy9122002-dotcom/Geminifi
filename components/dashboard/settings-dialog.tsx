'use client'

import { useState, useTransition } from 'react'
import { LoaderCircle, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cycleFor, normalizeCycleDay } from '@/lib/cycles'
import type { UserSettingsView } from '@/lib/dashboard/types'
import { saveSettings } from '@/lib/settings/actions'

interface Props {
  settings: UserSettingsView
  today: string // YYYY-MM-DD in the user's timezone, from the server
}

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

const toInput = (n: number) => (n === 0 ? '' : String(n).replace('.', ','))

const fieldClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:text-sm'

export function SettingsDialog({ settings, today }: Props) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [balance, setBalance] = useState(toInput(settings.openingBalance))
  const [cash, setCash] = useState(toInput(settings.openingCash))
  const [day, setDay] = useState(String(settings.cycleStartDay))

  const chosenDay = normalizeCycleDay(day)
  const preview = cycleFor(today, chosenDay)
  const dayChanged = chosenDay !== settings.cycleStartDay

  // Opening the dialog always starts from the saved values, not from an abandoned edit
  function handleOpenChange(next: boolean) {
    if (next) {
      setBalance(toInput(settings.openingBalance))
      setCash(toInput(settings.openingCash))
      setDay(String(settings.cycleStartDay))
    }
    setOpen(next)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await saveSettings({ openingBalance: balance, openingCash: cash, cycleStartDay: day })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Settings saved')
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Base UI (shadcn "base-*" styles) has no asChild: the trigger IS the button, via the render prop */}
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label="Settings" />
        }
      >
        <Settings className="size-4" />
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Your starting position and the day your budget cycle begins.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="set-cycle" className="text-sm font-medium">
              Cycle start day (your payday)
            </label>
            <select id="set-cycle" className={fieldClass} value={day} onChange={(e) => setDay(e.target.value)}>
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Your current cycle would run{' '}
              <span className="font-medium tabular-nums text-foreground">{preview.label}</span>. Days 29-31 use the
              last day of shorter months.
            </p>
            {dayChanged && (
              <p className="text-xs text-amber-600">
                This re-draws the boundaries of every cycle, including past ones. Your transactions and budgets are
                kept; only the dates they are grouped by change.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="set-balance" className="text-sm font-medium">
              Initial total balance
            </label>
            <Input
              id="set-balance"
              inputMode="decimal"
              placeholder="0"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Everything you owned when you started using the app: bank, cash and savings together.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="set-cash" className="text-sm font-medium">
              Initial cash on hand
            </label>
            <Input
              id="set-cash"
              inputMode="decimal"
              placeholder="0"
              value={cash}
              onChange={(e) => setCash(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Only the physical cash part of the balance above.</p>
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? <LoaderCircle className="size-4 animate-spin" /> : 'Save settings'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}