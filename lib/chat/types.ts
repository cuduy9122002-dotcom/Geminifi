import type { Extraction, TransactionDraft } from '@/lib/gemini/schema'

export type TransactionType = TransactionDraft['type']
export type PaymentMethod = TransactionDraft['payment_method']
export type ExtractionStatus = Extraction['status']

export interface CategoryRow {
  id: string
  name: string
  kind: TransactionType
  icon: string | null
}

/** A transaction as shown on a confirmation card in the chat. */
export interface SavedTransaction {
  id: string
  type: TransactionType
  amount: number
  category_id: string
  category_name: string
  category_icon: string | null
  payment_method: PaymentMethod
  description: string | null
  transaction_date: string // YYYY-MM-DD
}

export interface BudgetSnapshot {
  month: string // YYYY-MM-01
  available: number
  remaining: number
  spentPct: number | null
}

export interface ChatMessageDTO {
  id: string
  role: 'user' | 'assistant'
  content: string
  image_path: string | null
  metadata: Record<string, unknown>
  created_at: string
}

/** Stored in chat_messages.metadata for assistant messages (lets the UI re-render cards after a reload). */
export interface AssistantMetadata {
  status: ExtractionStatus
  transactions: SavedTransaction[]
  budget: BudgetSnapshot | null
  skipped: number
}

export interface ChatApiResponse {
  userMessage: ChatMessageDTO
  assistantMessage: ChatMessageDTO
  transactions: SavedTransaction[]
  budget: BudgetSnapshot | null
}

export interface UndoApiResponse {
  ok: true
  id: string
  budget: BudgetSnapshot | null
}

export interface ChatApiError {
  error: string
}