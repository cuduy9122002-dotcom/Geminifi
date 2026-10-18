import type { SupabaseClient } from '@supabase/supabase-js'
import { cycleFromKey, cycleKeyFor, cycleProgress, type Cycle } from '@/lib/cycles'
import { formatMoney, formatShortDate, PAYMENT_LABELS } from '@/lib/format'
import type { CategoryRow, PaymentMethod } from '@/lib/chat/types'
import { NO_CATEGORY, type QuerySpec } from '@/lib/gemini/schema'
import { resolvePeriod, type ResolvedPeriod } from './periods'
import type { AnswerCard, AnswerItem, AnswerRow, Tone } from './types'

const MAX_ROWS = 1000 // PostgREST's default page cap
const LIST_SIZE = 8
const TOP_N = 5

export interface AnswerContext {
  currency: string
  today: string // YYYY-MM-DD in the user's timezone
  cycleStartDay: number // 1-31: the user's payday
  categories: CategoryRow[]
}

interface TxRow {
  id: string
  type: 'expense' | 'income'
  amount: number | string
  description: string | null
  transaction_date: string
  payment_method: PaymentMethod
  category: { name: string } | null
}

interface Filters {
  from: string
  to: string
  type: 'expense' | 'income'
  categoryId?: string
  text?: string
}

/* ---------- helpers ---------- */

const sumOf = (rows: TxRow[]) => rows.reduce((acc, r) => acc + Number(r.amount), 0)

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const toneForPct = (pct: number): Tone => (pct >= 100 ? 'bad' : pct >= 80 ? 'warn' : 'good')

/** Keep letters/digits/spaces only: no wildcard or filter-syntax characters reach the query. */
function sanitizeSearch(term: string): string {
  return term.replace(/[%_*\\,()"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)
}

function findCategory(
  name: string,
  categories: CategoryRow[],
  kind: 'expense' | 'income' | null
): CategoryRow | null {
  if (!name || name === NO_CATEGORY) return null
  const wanted = name.trim().toLowerCase()
  return categories.find((c) => c.name.toLowerCase() === wanted && (kind === null || c.kind === kind)) ?? null
}

async function fetchTransactions(supabase: SupabaseClient, f: Filters): Promise<TxRow[]> {
  let query = supabase
    .from('transactions')
    .select('id, type, amount, description, transaction_date, payment_method, category:categories(name)')
    .eq('type', f.type)
    .gte('transaction_date', f.from)
    .lte('transaction_date', f.to)

  if (f.categoryId) query = query.eq('category_id', f.categoryId)
  if (f.text) query = query.ilike('description', `%${f.text}%`)

  const { data, error } = await query
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS)
  if (error) throw error
  return (data ?? []) as unknown as TxRow[]
}

async function cycleSummary(supabase: SupabaseClient, ctx: AnswerContext, key: string) {
  const cycle = cycleFromKey(key, ctx.cycleStartDay, ctx.today)
  const { data, error } = await supabase
    .rpc('cycle_summary', { p_key: cycle.keyDate, p_start: cycle.start, p_end: cycle.end })
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    available: Number(data.available_budget),
    remaining: Number(data.remaining_budget),
    spent: Number(data.spent),
    pct: data.spent_pct === null ? null : Number(data.spent_pct),
  }
}

/** Money per day for the rest of the cycle (today included). */
function perDay(remaining: number, cycle: Cycle, today: string) {
  const { daysLeft } = cycleProgress(cycle, today)
  if (remaining <= 0 || daysLeft < 1) return null
  return { amount: remaining / daysLeft, daysLeft }
}

/* ---------- 1. budget_remaining ---------- */

async function budgetCard(supabase: SupabaseClient, ctx: AnswerContext, period: ResolvedPeriod): Promise<AnswerCard> {
  const m = (n: number) => formatMoney(n, ctx.currency)
  const currentKey = cycleKeyFor(ctx.today, ctx.cycleStartDay)
  const key = period.month ?? currentKey
  const isCurrent = key === currentKey
  const cycle = cycleFromKey(key, ctx.cycleStartDay, ctx.today)
  const label = isCurrent ? 'This cycle' : period.label
  const s = await cycleSummary(supabase, ctx, key)

  if (!s) {
    return {
      title: `Budget · ${label}`,
      rows: [{ label: 'Status', value: 'No budget set' }],
      footnote: 'Set your income under Dashboard → Set up budget.',
    }
  }

  const { elapsedPct: elapsed } = cycleProgress(cycle, ctx.today)
  const ahead = s.pct !== null && s.pct > elapsed + 10

  const tone: Tone =
    s.remaining < 0 ? 'bad' : s.pct !== null && (s.pct >= 80 || (isCurrent && ahead)) ? 'warn' : 'good'

  const rows: AnswerRow[] = [
    { label: 'Available budget', value: m(s.available) },
    { label: 'Spent', value: s.pct === null ? m(s.spent) : `${m(s.spent)} (${Math.round(s.pct)}%)` },
  ]

  let footnote: string | undefined
  if (isCurrent) {
    rows.push({ label: 'Cycle elapsed', value: `${elapsed}%` })
    const day = perDay(s.remaining, cycle, ctx.today)
    if (day) rows.push({ label: `Per day (${day.daysLeft} days left)`, value: m(day.amount) })
    if (ahead && s.remaining >= 0) footnote = "You're spending faster than the cycle is passing."
  }

  return {
    title: `Budget · ${label}`,
    headline: { label: 'Remaining', value: m(s.remaining), tone },
    rows,
    footnote,
  }
}

/* ---------- 2. category_status ---------- */

function categoryNotFound(categories: CategoryRow[]): AnswerCard {
  const names = categories.filter((c) => c.kind === 'expense').map((c) => c.name)
  return {
    title: 'Category not found',
    rows: [],
    footnote: `I couldn't match that to one of your categories: ${names.join(', ')}.`,
  }
}

async function categoryCard(
  supabase: SupabaseClient,
  ctx: AnswerContext,
  spec: QuerySpec,
  period: ResolvedPeriod
): Promise<AnswerCard> {
  const m = (n: number) => formatMoney(n, ctx.currency)
  const category = findCategory(spec.category, ctx.categories, 'expense')
  if (!category) return categoryNotFound(ctx.categories)

  const [rows, limitRes] = await Promise.all([
    fetchTransactions(supabase, { from: period.from, to: period.to, type: 'expense', categoryId: category.id }),
    supabase.from('categories').select('monthly_limit').eq('id', category.id).maybeSingle(),
  ])
  if (limitRes.error) throw limitRes.error

  const spent = sumOf(rows)
  const limit = limitRes.data?.monthly_limit == null ? null : Number(limitRes.data.monthly_limit)
  const title = `${category.name} · ${period.label}`
  const count: AnswerRow = { label: 'Transactions', value: String(rows.length) }

  // Limit set and the period is one whole month: "what's left"
  if (limit !== null && period.month) {
    const remaining = limit - spent
    const pct = limit > 0 ? (spent / limit) * 100 : 100
    const out: AnswerRow[] = [
      { label: 'Limit per cycle', value: m(limit) },
      { label: 'Spent', value: `${m(spent)} (${Math.round(pct)}%)` },
    ]
    if (period.month === cycleKeyFor(ctx.today, ctx.cycleStartDay)) {
      const day = perDay(remaining, cycleFromKey(period.month, ctx.cycleStartDay, ctx.today), ctx.today)
      if (day) out.push({ label: `Per day (${day.daysLeft} days left)`, value: m(day.amount) })
    }
    out.push(count)
    return {
      title,
      headline: { label: `Left for ${category.name}`, value: m(remaining), tone: remaining < 0 ? 'bad' : toneForPct(pct) },
      rows: out,
    }
  }

  // Limit set, but the period isn't a whole month: show spend, mention the limit
  if (limit !== null) {
    return {
      title,
      headline: { label: `Spent on ${category.name}`, value: m(spent) },
      rows: [{ label: 'Limit per cycle', value: m(limit) }, count],
    }
  }

  // No limit: show spend, plus the overall budget for context
  const out: AnswerRow[] = [{ label: 'Limit', value: 'Not set' }, count]
  const summary = await cycleSummary(supabase, ctx, period.month ?? cycleKeyFor(ctx.today, ctx.cycleStartDay))
  if (summary) out.push({ label: 'Overall budget left', value: m(summary.remaining), tone: summary.remaining < 0 ? 'bad' : undefined })

  return {
    title,
    headline: { label: `Spent on ${category.name}`, value: m(spent) },
    rows: out,
    footnote: 'Set a limit under Dashboard → Edit budget to see what is left.',
  }
}

/* ---------- 3. spending_total ---------- */

async function totalCard(
  supabase: SupabaseClient,
  ctx: AnswerContext,
  spec: QuerySpec,
  period: ResolvedPeriod
): Promise<AnswerCard> {
  const m = (n: number) => formatMoney(n, ctx.currency)
  const category = findCategory(spec.category, ctx.categories, null)
  const text = sanitizeSearch(spec.text)
  const income = spec.transaction_type === 'income'

  const rows = await fetchTransactions(supabase, {
    from: period.from,
    to: period.to,
    type: spec.transaction_type,
    categoryId: category?.id,
    text: text || undefined,
  })
  const total = sumOf(rows)

  const title = [income ? 'Income' : 'Spending', category?.name, text ? `“${text}”` : null, period.label]
    .filter(Boolean)
    .join(' · ')

  const out: AnswerRow[] = [{ label: 'Transactions', value: String(rows.length) }]
  if (rows.length > 0 && period.days > 1) out.push({ label: 'Daily average', value: m(total / period.days) })
  if (rows.length > 0) {
    const largest = rows.reduce((a, b) => (Number(b.amount) > Number(a.amount) ? b : a))
    out.push({ label: 'Largest', value: `${largest.description || largest.category?.name || 'Transaction'} · ${m(Number(largest.amount))}` })
  }

  return {
    title,
    headline: { label: income ? 'Received' : 'Spent', value: m(total) },
    rows: out,
    footnote:
      rows.length === 0
        ? 'No matching transactions.'
        : rows.length >= MAX_ROWS
          ? `Based on the ${MAX_ROWS} most recent matches.`
          : undefined,
  }
}

/* ---------- 4. top_categories ---------- */

async function topCategoriesCard(
  supabase: SupabaseClient,
  ctx: AnswerContext,
  spec: QuerySpec,
  period: ResolvedPeriod
): Promise<AnswerCard> {
  const m = (n: number) => formatMoney(n, ctx.currency)
  const rows = await fetchTransactions(supabase, { from: period.from, to: period.to, type: spec.transaction_type })
  const total = sumOf(rows)

  const groups = new Map<string, { sum: number; count: number }>()
  for (const r of rows) {
    const name = r.category?.name ?? 'Uncategorized'
    const g = groups.get(name) ?? { sum: 0, count: 0 }
    g.sum += Number(r.amount)
    g.count++
    groups.set(name, g)
  }

  const sorted = [...groups.entries()].sort((a, b) => b[1].sum - a[1].sum)
  const share = (sum: number) => (total > 0 ? Math.round((sum / total) * 100) : 0)

  const items: AnswerItem[] = sorted.slice(0, TOP_N).map(([name, g]) => ({
    primary: name,
    secondary: `${plural(g.count, 'transaction')} · ${share(g.sum)}%`,
    value: m(g.sum),
  }))

  const rest = sorted.slice(TOP_N)
  if (rest.length > 0) {
    const restSum = rest.reduce((acc, [, g]) => acc + g.sum, 0)
    items.push({
      primary: plural(rest.length, 'other category', 'other categories'),
      secondary: `${share(restSum)}%`,
      value: m(restSum),
    })
  }

  return {
    title: `${spec.transaction_type === 'income' ? 'Income' : 'Spending'} by category · ${period.label}`,
    headline: { label: spec.transaction_type === 'income' ? 'Received' : 'Spent', value: m(total) },
    rows: [],
    items,
    footnote: rows.length === 0 ? 'No transactions in this period.' : undefined,
  }
}

/* ---------- 5. find_transactions ---------- */

async function findCard(
  supabase: SupabaseClient,
  ctx: AnswerContext,
  spec: QuerySpec,
  period: ResolvedPeriod
): Promise<AnswerCard> {
  const m = (n: number) => formatMoney(n, ctx.currency)
  const category = findCategory(spec.category, ctx.categories, null)
  const text = sanitizeSearch(spec.text)

  const rows = await fetchTransactions(supabase, {
    from: period.from,
    to: period.to,
    type: spec.transaction_type,
    categoryId: category?.id,
    text: text || undefined,
  })

  const items: AnswerItem[] = rows.slice(0, LIST_SIZE).map((r) => ({
    primary: r.description || r.category?.name || 'Transaction',
    secondary: [formatShortDate(r.transaction_date), r.category?.name, PAYMENT_LABELS[r.payment_method]]
      .filter(Boolean)
      .join(' · '),
    value: `${r.type === 'income' ? '+' : '−'}${m(Number(r.amount))}`,
  }))

  const title = ['Transactions', category?.name, text ? `“${text}”` : null, period.label].filter(Boolean).join(' · ')

  return {
    title,
    headline: { label: 'Total of matches', value: m(sumOf(rows)) },
    rows: [{ label: 'Matches', value: String(rows.length) }],
    items,
    footnote:
      rows.length === 0
        ? 'No matching transactions.'
        : rows.length > LIST_SIZE
          ? `Showing the newest ${LIST_SIZE} of ${rows.length}.`
          : undefined,
  }
}

/* ---------- entry point ---------- */

export async function answerQuery(
  supabase: SupabaseClient,
  spec: QuerySpec,
  ctx: AnswerContext
): Promise<AnswerCard | null> {
  const period = resolvePeriod(spec, ctx.today, ctx.cycleStartDay)

  switch (spec.kind) {
    case 'budget_remaining':
      return budgetCard(supabase, ctx, period)
    case 'category_status':
      return categoryCard(supabase, ctx, spec, period)
    case 'spending_total':
      return totalCard(supabase, ctx, spec, period)
    case 'top_categories':
      return topCategoriesCard(supabase, ctx, spec, period)
    case 'find_transactions':
      return findCard(supabase, ctx, spec, period)
    default:
      return null
  }
}