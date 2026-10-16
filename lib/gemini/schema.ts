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
export const EXTRACTION_STATUSES = [
  'ok',
  'needs_clarification',
  'not_a_transaction',
  'question',
] as const
export const QUERY_KINDS = [
  'none',
  'budget_remaining',
  'category_status',
  'spending_total',
  'top_categories',
  'find_transactions',
] as const
export const QUERY_PERIODS = [
  'this_month',
  'today',
  'yesterday',
  'this_week',
  'last_week',
  'last_7_days',
  'last_30_days',
  'last_month',
  'specific_month',
  'custom_range',
] as const

/** Sentinel for "no category" (an enum value, so the schema needs no nullable fields). */
export const NO_CATEGORY = '(none)'

/* ---------- Zod: runtime validation of Gemini's output ---------- */

export const TransactionDraftSchema = z.object({
  type: z.enum(TRANSACTION_TYPES),
  amount: z.number(),
  category: z.string(),
  payment_method: z.enum(PAYMENT_METHODS),
  date: z.string(),
  description: z.string(),
})

export const QuerySpecSchema = z.object({
  kind: z.enum(QUERY_KINDS),
  category: z.string(),
  text: z.string(),
  period: z.enum(QUERY_PERIODS),
  month: z.string(),
  date_from: z.string(),
  date_to: z.string(),
  transaction_type: z.enum(TRANSACTION_TYPES),
})

export const ExtractionSchema = z.object({
  status: z.enum(EXTRACTION_STATUSES),
  transactions: z.array(TransactionDraftSchema).max(20),
  query: QuerySpecSchema,
  reply: z.string(),
})

export type TransactionDraft = z.infer<typeof TransactionDraftSchema>
export type QuerySpec = z.infer<typeof QuerySpecSchema>
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
          'ok = at least one transaction extracted. question = the user asks about their money and there is nothing to log. needs_clarification = amount missing/unreadable or wrong currency. not_a_transaction = greeting or unrelated input.',
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
      query: {
        type: 'object',
        description:
          'A question about the user\'s money for the app to look up. kind is "none" when the user is not asking one.',
        properties: {
          kind: { type: 'string', enum: [...QUERY_KINDS] },
          category: {
            type: 'string',
            enum: [...categories, NO_CATEGORY],
            description: `The category the question is about, or "${NO_CATEGORY}".`,
          },
          text: {
            type: 'string',
            description: 'Merchant or item search word (e.g. Rewe, coffee). Empty string if none.',
          },
          period: { type: 'string', enum: [...QUERY_PERIODS], description: 'Defaults to this_month.' },
          month: {
            type: 'string',
            description: 'YYYY-MM, only when period is specific_month. Otherwise an empty string.',
          },
          date_from: {
            type: 'string',
            description: 'YYYY-MM-DD, only when period is custom_range. Otherwise an empty string.',
          },
          date_to: {
            type: 'string',
            description: 'YYYY-MM-DD, only when period is custom_range. Otherwise an empty string.',
          },
          transaction_type: {
            type: 'string',
            enum: [...TRANSACTION_TYPES],
            description: 'expense unless the user asks about income or earnings.',
          },
        },
        required: [
          'kind',
          'category',
          'text',
          'period',
          'month',
          'date_from',
          'date_to',
          'transaction_type',
        ],
      },
      reply: {
        type: 'string',
        description:
          'Short chat reply in the same language as the user. Never include amounts or figures. If clarification is needed, ask exactly one question.',
      },
    },
    required: ['status', 'transactions', 'query', 'reply'],
  } as const
}