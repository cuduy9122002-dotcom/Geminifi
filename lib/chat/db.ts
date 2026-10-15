import type { SupabaseClient } from '@supabase/supabase-js'
import type { NormalizedTransaction } from './normalize'
import type {
  BudgetSnapshot,
  CategoryRow,
  ChatMessageDTO,
  PaymentMethod,
  SavedTransaction,
  TransactionType,
} from './types'

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
}

/* ---------- Reads ---------- */

export async function getUserContext(supabase: SupabaseClient) {
  const [settings, categories] = await Promise.all([
    supabase.from('user_settings').select('currency, timezone').maybeSingle(),
    supabase
      .from('categories')
      .select('id, name, kind, icon')
      .eq('is_active', true)
      .order('sort_order'),
  ])

  if (categories.error) throw categories.error
  if (!categories.data?.length) throw new Error('No active categories found for this user')

  return {
    currency: (settings.data?.currency as string | undefined) ?? 'EUR',
    timezone: (settings.data?.timezone as string | undefined) ?? 'Europe/Berlin',
    categories: categories.data as CategoryRow[],
  }
}

/** Non-critical: returns null if there is no budget for that month yet. */
export async function getBudgetSnapshot(
  supabase: SupabaseClient,
  monthStart: string
): Promise<BudgetSnapshot | null> {
  const { data, error } = await supabase
    .from('monthly_summary')
    .select('month, available_budget, remaining_budget, spent_pct')
    .eq('month', monthStart)
    .maybeSingle()

  if (error || !data) return null
  return {
    month: data.month as string,
    available: Number(data.available_budget),
    remaining: Number(data.remaining_budget),
    spentPct: data.spent_pct === null ? null : Number(data.spent_pct),
  }
}

/* ---------- Writes ---------- */

/** Path convention required by the Step 1 storage policy: {user_id}/{yyyy-mm}/{uuid}.ext */
export async function uploadReceipt(
  supabase: SupabaseClient,
  userId: string,
  bytes: Buffer,
  mimeType: string,
  today: string
): Promise<string> {
  const ext = IMAGE_EXTENSIONS[mimeType] ?? 'jpg'
  const path = `${userId}/${today.slice(0, 7)}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage
    .from('receipts')
    .upload(path, bytes, { contentType: mimeType, upsert: false })
  if (error) throw error
  return path
}

export async function insertChatMessage(
  supabase: SupabaseClient,
  message: {
    userId: string
    role: 'user' | 'assistant'
    content: string
    imagePath?: string | null
    metadata?: Record<string, unknown>
  }
): Promise<ChatMessageDTO> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      user_id: message.userId,
      role: message.role,
      content: message.content,
      image_path: message.imagePath ?? null,
      metadata: message.metadata ?? {},
    })
    .select('id, role, content, image_path, metadata, created_at')
    .single()

  if (error) throw error
  return data as ChatMessageDTO
}

interface InsertedTransactionRow {
  id: string
  type: TransactionType
  amount: number | string
  payment_method: PaymentMethod
  description: string | null
  transaction_date: string
  category: { id: string; name: string; icon: string | null } | null
}

export async function insertTransactions(
  supabase: SupabaseClient,
  args: {
    userId: string
    rows: NormalizedTransaction[]
    source: 'chat_text' | 'chat_image'
    receiptPath: string | null
    chatMessageId: string
  }
): Promise<SavedTransaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .insert(
      args.rows.map((row) => ({
        user_id: args.userId,
        ...row,
        source: args.source,
        receipt_path: args.receiptPath,
        chat_message_id: args.chatMessageId,
      }))
    )
    .select(
      'id, type, amount, payment_method, description, transaction_date, category:categories(id, name, icon)'
    )

  if (error) throw error

  return ((data ?? []) as unknown as InsertedTransactionRow[]).map((t) => ({
    id: t.id,
    type: t.type,
    amount: Number(t.amount),
    category_id: t.category?.id ?? '',
    category_name: t.category?.name ?? 'Uncategorized',
    category_icon: t.category?.icon ?? null,
    payment_method: t.payment_method,
    description: t.description,
    transaction_date: t.transaction_date,
  }))
}

/**
 * Undo = hard delete. Returns the deleted row's date (to refresh the right month's budget),
 * or null if nothing was deleted (wrong id, already undone, or not yours: RLS hides it).
 * The receipt file is intentionally kept: it belongs to the chat message that shows it.
 */
export async function deleteTransaction(
  supabase: SupabaseClient,
  id: string
): Promise<{ id: string; transaction_date: string } | null> {
  const { data, error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)
    .select('id, transaction_date')
    .maybeSingle()

  if (error) throw error
  return (data as { id: string; transaction_date: string } | null) ?? null
}