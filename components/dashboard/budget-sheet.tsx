'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LoaderCircle, Plus, Settings2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { createClient } from '@/lib/supabase/client'
import { formatMoney } from '@/lib/format'
import { parseAmountInput } from '@/lib/dashboard/helpers'
import type { FixedItemKind, FixedItemRow, LimitCategory } from '@/lib/dashboard/types'

interface Props {
  monthStart: string
  monthLabel: string
  currency: string
  income: number | null // null = no budget for this month yet
  fixedItems: FixedItemRow[]
  limitCategories: LimitCategory[]
}

const KIND_LABELS: Record<FixedItemKind, string> = {
  fixed_cost: 'Fixed cost',
  savings: 'Savings',
  reminder: 'Reminder only',
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.')

const fieldClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:text-sm'

export function BudgetSheet({ monthStart, monthLabel, currency, income, fixedItems, limitCategories }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [busy, setBusy] = useState<string | null>(null)

  const [incomeInput, setIncomeInput] = useState(income !== null ? String(income).replace('.', ',') : '')

  const [name, setName] = useState('')
  const [kind, setKind] = useState<FixedItemKind>('fixed_cost')
  const [amount, setAmount] = useState('')
  const [dueDay, setDueDay] = useState('')
  const [remindDays, setRemindDays] = useState('3')

  const [limits, setLimits] = useState<Record<string, string>>(
    Object.fromEntries(
      limitCategories.map((c) => [c.id, c.monthly_limit !== null ? String(c.monthly_limit).replace('.', ',') : ''])
    )
  )

  const activeItems = fixedItems.filter((f) => f.is_active)
  const sum = (k: FixedItemKind) =>
    activeItems.filter((f) => f.kind === k).reduce((acc, f) => acc + (f.amount ?? 0), 0)

  /** (Re)creates this month's budget row from income + the current fixed items. */
  async function applyBudget(nextIncome: number) {
    const { error } = await supabase.rpc('init_monthly_budget', {
      p_month: monthStart,
      p_income: nextIncome,
    })
    if (error) throw error
  }

  async function run(section: string, work: () => Promise<void>, success: string) {
    setBusy(section)
    try {
      await work()
      toast.success(success)
      router.refresh()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  /* ---------- Income ---------- */
  function saveIncome() {
    const value = parseAmountInput(incomeInput)
    if (value === null || value < 0) {
      toast.error('Enter a valid income amount, e.g. 3000 or 3.000,50')
      return
    }
    void run('income', () => applyBudget(value), 'Budget saved')
  }

  /* ---------- Fixed items ---------- */
  function addItem() {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('Give the item a name.')
      return
    }

    const parsedAmount = amount.trim() ? parseAmountInput(amount) : null
    if (kind !== 'reminder' && (parsedAmount === null || parsedAmount <= 0)) {
      toast.error('Enter an amount for this item.')
      return
    }

    const day = dueDay.trim() ? Number(dueDay) : null
    if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31)) {
      toast.error('Due day must be between 1 and 31.')
      return
    }
    if (kind === 'reminder' && day === null) {
      toast.error('A reminder needs a due day.')
      return
    }

    const remind = Number(remindDays || '3')
    if (!Number.isInteger(remind) || remind < 0 || remind > 14) {
      toast.error('"Remind days before" must be between 0 and 14.')
      return
    }

    void run(
      'add',
      async () => {
        const { error } = await supabase.from('fixed_items').insert({
          name: trimmed,
          kind,
          amount: parsedAmount,
          due_day: day,
          remind_days_before: remind,
        })
        if (error) throw error
        if (kind !== 'reminder' && income !== null) await applyBudget(income)

        setName('')
        setAmount('')
        setDueDay('')
      },
      'Item added'
    )
  }

  function removeItem(item: FixedItemRow) {
    void run(
      `del-${item.id}`,
      async () => {
        const { error } = await supabase.from('fixed_items').delete().eq('id', item.id)
        if (error) throw error
        if (item.kind !== 'reminder' && income !== null) await applyBudget(income)
      },
      'Item removed'
    )
  }

  /* ---------- Category limits ---------- */
  function saveLimits() {
    const updates: { id: string; value: number | null }[] = []

    for (const c of limitCategories) {
      const raw = (limits[c.id] ?? '').trim()
      const value = raw === '' ? null : parseAmountInput(raw)
      if (raw !== '' && (value === null || value < 0)) {
        toast.error(`Invalid limit for ${c.name}.`)
        return
      }
      if (value !== c.monthly_limit) updates.push({ id: c.id, value })
    }

    if (updates.length === 0) {
      toast('No changes to save.')
      return
    }

    void run(
      'limits',
      async () => {
        const results = await Promise.all(
          updates.map((u) => supabase.from('categories').update({ monthly_limit: u.value }).eq('id', u.id))
        )
        const failed = results.find((r) => r.error)
        if (failed?.error) throw failed.error
      },
      'Limits saved'
    )
  }

  return (
    <Sheet>
      <SheetTrigger className={buttonVariants({ variant: "outline", size: "sm", className: "h-8 gap-1" })}>
  {/* keep your icons or text exactly the same here */}
  Edit Budget
</SheetTrigger>

      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-2xl px-4 pb-10">
        <SheetHeader className="px-0">
          <SheetTitle>Budget for {monthLabel}</SheetTitle>
          <SheetDescription>
            Available budget = income − fixed savings − fixed costs. Chat expenses are deducted from it.
          </SheetDescription>
        </SheetHeader>

        <div className="mx-auto w-full max-w-md space-y-8 pt-2">
          {/* ---- Income ---- */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Monthly income</h3>
            <div className="flex gap-2">
              <Input
                inputMode="decimal"
                placeholder="e.g. 3.000,00"
                value={incomeInput}
                onChange={(e) => setIncomeInput(e.target.value)}
              />
              <Button onClick={saveIncome} disabled={busy !== null} className="shrink-0">
                {busy === 'income' ? <LoaderCircle className="size-4 animate-spin" /> : 'Save'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Saving also refreshes this month&apos;s fixed totals from the list below.
            </p>
          </section>

          {/* ---- Fixed items ---- */}
          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold">Fixed monthly items</h3>
              <span className="text-xs tabular-nums text-muted-foreground">
                Costs {formatMoney(sum('fixed_cost'), currency)} · Savings {formatMoney(sum('savings'), currency)}
              </span>
            </div>

            {fixedItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing yet. Add rent, insurance, your savings transfer, or a credit card reminder.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {fixedItems.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{f.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {KIND_LABELS[f.kind]}
                        {f.due_day ? ` · day ${f.due_day}` : ''}
                        {f.due_day ? ` · remind ${f.remind_days_before}d before` : ''}
                      </p>
                    </div>
                    {f.amount !== null && (
                      <span className="text-sm tabular-nums">{formatMoney(f.amount, currency)}</span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground"
                      aria-label={`Remove ${f.name}`}
                      disabled={busy !== null}
                      onClick={() => removeItem(f)}
                    >
                      {busy === `del-${f.id}` ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-2 rounded-lg bg-muted/50 p-3">
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Name (e.g. Rent)" value={name} onChange={(e) => setName(e.target.value)} />
                <select
                  className={fieldClass}
                  value={kind}
                  onChange={(e) => setKind(e.target.value as FixedItemKind)}
                  aria-label="Type"
                >
                  <option value="fixed_cost">Fixed cost</option>
                  <option value="savings">Savings</option>
                  <option value="reminder">Reminder only</option>
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  inputMode="decimal"
                  placeholder={kind === 'reminder' ? 'Amount (opt.)' : 'Amount'}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <Input
                  inputMode="numeric"
                  placeholder="Due day"
                  value={dueDay}
                  onChange={(e) => setDueDay(e.target.value)}
                />
                <Input
                  inputMode="numeric"
                  placeholder="Remind (d)"
                  value={remindDays}
                  onChange={(e) => setRemindDays(e.target.value)}
                />
              </div>
              <Button onClick={addItem} disabled={busy !== null} variant="secondary" className="w-full gap-1.5">
                {busy === 'add' ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Add item
              </Button>
              <p className="text-xs text-muted-foreground">
                “Reminder only” items (e.g. credit card bill) send an email but never reduce your budget, because those
                purchases are already logged in the chat.
              </p>
            </div>
          </section>

          {/* ---- Category limits ---- */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Category limits</h3>
            <p className="text-xs text-muted-foreground">
              Optional monthly limit per category. You&apos;ll get an email at 80% and 100%. Leave empty for no limit.
            </p>
            <ul className="space-y-2">
              {limitCategories.map((c) => (
                <li key={c.id} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                  <Input
                    className="w-32"
                    inputMode="decimal"
                    placeholder="No limit"
                    value={limits[c.id] ?? ''}
                    onChange={(e) => setLimits((prev) => ({ ...prev, [c.id]: e.target.value }))}
                  />
                </li>
              ))}
            </ul>
            <Button onClick={saveLimits} disabled={busy !== null} variant="secondary" className="w-full">
              {busy === 'limits' ? <LoaderCircle className="size-4 animate-spin" /> : 'Save limits'}
            </Button>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}