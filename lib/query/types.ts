export type Tone = 'good' | 'warn' | 'bad'

export interface AnswerRow {
  label: string
  value: string
  tone?: Tone
}

export interface AnswerItem {
  primary: string
  secondary: string
  value: string
}

export interface AnswerCard {
  title: string // e.g. "Food & Drinks · This month": shows what was understood
  headline?: { label: string; value: string; tone?: Tone }
  rows: AnswerRow[]
  items?: AnswerItem[]
  footnote?: string
}