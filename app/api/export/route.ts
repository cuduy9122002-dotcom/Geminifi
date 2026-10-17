import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 30

const PAGE = 1000

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

async function fetchAll<T>(page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return rows
}

function textCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

interface TxExportRow {
  id: string
  transaction_date: string
  type: string
  amount: number | string
  payment_method: string
  description: string | null
  source: string
  category: { name: string } | null
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const format = new URL(request.url).searchParams.get('format') === 'csv' ? 'csv' : 'json'
  const stamp = new Date().toISOString().slice(0, 10)
  const headers = { 'Cache-Control': 'no-store' }

  try {
    if (format === 'csv') {
      const rows = await fetchAll<TxExportRow>((from, to) =>
        supabase
          .from('transactions')
          .select('id, transaction_date, type, amount, payment_method, description, source, category:categories(name)')
          .order('transaction_date', { ascending: false })
          .order('id')
          .range(from, to) as any // <-- Đã thêm as any để fix lỗi TypeScript
      )

      const lines = [['date', 'type', 'amount', 'category', 'payment_method', 'description', 'source', 'id'].join(',')]
      for (const r of rows) {
        // Fix lỗi TypeScript bóc tách object category
        const cat = r.category as any
        lines.push(
          [
            r.transaction_date, r.type, String(r.amount), textCell(cat?.name ?? cat?.[0]?.name),
            r.payment_method, textCell(r.description), r.source, r.id,
          ].join(',')
        )
      }

      return new NextResponse('\uFEFF' + lines.join('\n'), {
        headers: {
          ...headers,
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="geminifi-transactions-${stamp}.csv"`,
        },
      })
    }

    const table = (name: string, columns: string, orderBy: string) =>
      fetchAll<Record<string, unknown>>((from, to) =>
        supabase.from(name).select(columns).order(orderBy).order('id').range(from, to) as any // <-- Đã thêm as any để fix lỗi TypeScript
      )

    const [settings, categories, fixedItems, budgets, transactions, chat, goals] = await Promise.all([
      fetchAll<Record<string, unknown>>((from, to) => supabase.from('user_settings').select('*').order('user_id').range(from, to) as any),
      table('categories', '*', 'sort_order'),
      table('fixed_items', '*', 'created_at'),
      table('monthly_budgets', '*', 'month'),
      table('transactions', '*', 'created_at'),
      table('chat_messages', 'id, role, content, image_path, metadata, created_at', 'created_at'),
      table('savings_goals', '*', 'created_at'), // <-- Đã thêm lệnh lấy dữ liệu ống heo
    ])

    const backup = {
      app: 'GeminiFi', version: 1, exported_at: new Date().toISOString(),
      user_settings: settings, categories, fixed_items: fixedItems,
      monthly_budgets: budgets, transactions, chat_messages: chat,
      savings_goals: goals, // <-- Đã ghép biến goals vào file backup thành công
    }

    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        ...headers,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="geminifi-backup-${stamp}.json"`,
      },
    })
  } catch (err) {
    console.error('[export] failed:', err)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}