import type { BudgetSnapshot, SavedTransaction } from './types'

export type TxState = 'active' | 'undoing' | 'undone'
export type UiTransaction = SavedTransaction & { state: TxState }

export interface UiMessage {
  key: string // local key while sending, DB id once persisted
  role: 'user' | 'assistant'
  content: string
  imageUrl: string | null // blob: URL (just sent) or signed Storage URL (loaded history)
  transactions: UiTransaction[]
  budget: BudgetSnapshot | null
  status: 'sent' | 'sending' | 'failed'
  error?: string
}