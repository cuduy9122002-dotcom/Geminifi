import type { TransactionDraft } from '@/lib/gemini/schema'
import type { CategoryRow } from './types'

export const MAX_AMOUNT = 1_000_000
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

export interface NormalizedTransaction {
  type: TransactionDraft['type']
  amount: number
  category_id: string
  payment_method: TransactionDraft['payment_method']
  description: string | null
  transaction_date: string
  ai_raw: TransactionDraft
}

function resolveTimezone(timezone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return timezone
  } catch {
    return 'Europe/Berlin'
  }
}

/** "Today" in the user's timezone (not the server's UTC). en-CA formats as YYYY-MM-DD. */
export function todayInTimezone(timezone: string, now: Date = new Date()) {
  const timeZone = resolveTimezone(timezone)
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(now)
  return { date, weekday }
}

function sanitizeDate(value: string, today: string): string {
  if (!ISO_DATE.test(value)) return today
  const parsed = new Date(`${value}T00:00:00Z`)
  // Rejects impossible dates such as 2026-02-31
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return today
  if (value > today) return today // never in the future
  const oldest = new Date(Date.parse(`${today}T00:00:00Z`) - 400 * DAY_MS).toISOString().slice(0, 10)
  return value < oldest ? today : value // a year misread by OCR falls back to today
}

function resolveCategory(draft: TransactionDraft, categories: CategoryRow[]): CategoryRow | null {
  const wanted = draft.category.trim().toLowerCase()
  const sameKind = categories.filter((c) => c.kind === draft.type)
  const fallbackName = draft.type === 'expense' ? 'other' : 'other income'

  return (
    sameKind.find((c) => c.name.toLowerCase() === wanted) ??
    sameKind.find((c) => c.name.toLowerCase() === fallbackName) ??
    sameKind[0] ??
    null
  )
}

export function normalizeDrafts(
  drafts: TransactionDraft[],
  categories: CategoryRow[],
  today: string
): { rows: NormalizedTransaction[]; skipped: number } {
  const rows: NormalizedTransaction[] = []
  let skipped = 0

  for (const draft of drafts) {
    const amount = Math.round(draft.amount * 100) / 100
    const category = resolveCategory(draft, categories)

    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT || !category) {
      skipped++
      continue
    }

    rows.push({
      type: draft.type,
      amount,
      category_id: category.id,
      payment_method: draft.payment_method,
      description: draft.description.trim().slice(0, 200) || null,
      transaction_date: sanitizeDate(draft.date, today),
      ai_raw: draft,
    })
  }

  return { rows, skipped }
}