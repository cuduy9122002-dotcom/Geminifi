import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deleteTransaction, getBudgetSnapshot } from '@/lib/chat/db'
import type { ChatApiError, UndoApiResponse } from '@/lib/chat/types'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const fail = (error: string, status: number) =>
  NextResponse.json<ChatApiError>({ error }, { status })

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!UUID_RE.test(id)) return fail('Invalid transaction id.', 400)

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims?.sub) return fail('Unauthorized', 401)

  try {
    const deleted = await deleteTransaction(supabase, id)
    if (!deleted) return fail('Transaction not found (maybe already undone).', 404)

    // Return the refreshed budget so the card can update "remaining" instantly
    const budget = await getBudgetSnapshot(supabase, deleted.transaction_date)
    return NextResponse.json<UndoApiResponse>({ ok: true, id, budget })
  } catch (err) {
    console.error('[undo] failed:', err)
    return fail('Could not undo this transaction. Please try again.', 500)
  }
}