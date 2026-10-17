import type { PaymentMethod } from '@/lib/chat/types'

const LOCALE = 'en-DE'
const MONEY_LOCALE = 'de-DE'

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency }).format(amount)
}

/** Input is YYYY-MM-DD. Formatted in UTC so the day never shifts with the viewer's timezone. */
export function formatShortDate(isoDate: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`))
}

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  debit_card: 'Debit card',
  credit_card: 'Credit card',
  bank_transfer: 'Transfer',
  e_wallet: 'E-wallet',
  other: '',
}