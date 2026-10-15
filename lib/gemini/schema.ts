import { z } from 'zod'

export const TRANSACTION_TYPES = ['expense', 'income'] as const
export const PAYMENT_METHODS = [
  'cash',
  'debit_card',
  'credit_card',
  'bank_transfer',
  'e_wallet',
  'other',
] as const
export const EXTRACTION_STATUSES = ['ok', 'needs_clarification', 'not_a_transaction'] as const

/* ---------- Zod: runtime validation of Gemini's output ---------- */

export const TransactionDraftSchema = z.object({
  type: z.enum(TRANSACTION_TYPES),
  amount: z.number(),
  category: z.string(),
  payment_method: z.enum(PAYMENT_METHODS),
  date: z.string(),
  description: z.string(),
})

export const ExtractionSchema = z.object({
  status: z.enum(EXTRACTION_STATUSES),
  transactions: z.array(TransactionDraftSchema).max(20),
  reply: z.string(),
})

export type TransactionDraft = z.infer<typeof TransactionDraftSchema>
export type Extraction = z.infer<typeof ExtractionSchema>

/* ---------- JSON Schema: what we force Gemini to produce ---------- */

export function buildResponseJsonSchema(categoryNames: string[]) {
  const categories = [...new Set(categoryNames)]

  return {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: [...EXTRACTION_STATUSES],
        description:
          'ok = at least one transaction extracted. needs_clarification = amount missing/unreadable or wrong currency. not_a_transaction = greeting, question or unrelated input.',
      },
      transactions: {
        type: 'array',
        maxItems: 20,
        description: 'One entry per separate purchase/payment. Empty unless status is ok.',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: [...TRANSACTION_TYPES] },
            amount: {
              type: 'number',
              description: 'Positive amount in the user currency. Dot as decimal separator. No symbols.',
            },
            category: {
              type: 'string',
              enum: categories,
              description: 'Exactly one of the allowed category names.',
            },
            payment_method: { type: 'string', enum: [...PAYMENT_METHODS] },
            date: {
              type: 'string',
              description: 'Transaction date as YYYY-MM-DD. Never after today.',
            },
            description: {
              type: 'string',
              description: 'Short label, 2-6 words, no amount. Example: Rewe groceries.',
            },
          },
          required: ['type', 'amount', 'category', 'payment_method', 'date', 'description'],
        },
      },
      reply: {
        type: 'string',
        description:
          'Short chat reply in the same language as the user. Do not repeat amounts. If clarification is needed, ask exactly one question.',
      },
    },
    required: ['status', 'transactions', 'reply'],
  } as const
}