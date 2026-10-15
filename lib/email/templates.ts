import { formatMoney } from '@/lib/format'
import { formatDayHeading } from '@/lib/dashboard/helpers'
import type { FixedItemKind } from '@/lib/dashboard/types'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

interface Email {
  subject: string
  html: string
  text: string
}

function layout(heading: string, bodyHtml: string): string {
  const appUrl = process.env.APP_URL
  const link = appUrl
    ? `<p style="margin:24px 0 0"><a href="${esc(appUrl)}/dashboard" style="color:#171717;font-weight:600">Open dashboard →</a></p>`
    : ''

  return `<!doctype html>
<html><body style="margin:0;background:#f5f5f5;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#171717">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:12px;padding:24px">
<p style="margin:0 0 4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#737373">GeminiFi</p>
<h1 style="margin:0 0 16px;font-size:18px">${esc(heading)}</h1>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">${bodyHtml}</table>
${link}
</div></body></html>`
}

/* ---------- Budget alerts ---------- */

export interface AlertLine {
  scope: 'overall' | 'category'
  label: string
  threshold: 80 | 100
  spent: number
  limit: number
  pct: number
  note?: string
}

export function budgetAlertEmail(args: { lines: AlertLine[]; currency: string }): Email {
  const { lines, currency } = args
  const m = (n: number) => formatMoney(n, currency)
  const anyLimitReached = lines.some((l) => l.threshold === 100)

  const unit = (l: AlertLine) => (l.scope === 'overall' ? 'of your available budget' : 'of its limit')
  const only = lines[0]
  const subject =
    lines.length === 1
      ? `${only.label}: ${only.threshold}% ${unit(only)} reached`
      : `Budget alerts: ${lines.length} thresholds reached`
  const heading = anyLimitReached ? 'Limit reached' : 'Heads-up: 80% used'

  const rows = lines
    .map((l) => {
      const color = l.threshold === 100 ? '#b91c1c' : '#b45309'
      return `<tr>
<td style="padding:10px 0;border-top:1px solid #e5e5e5">
<div style="font-weight:600">${esc(l.label)}</div>
<div style="font-size:13px;color:${color}">${Math.round(l.pct)}% ${unit(l)} used</div>
${l.note ? `<div style="font-size:12px;color:#737373">${esc(l.note)}</div>` : ''}
</td>
<td align="right" style="padding:10px 0;border-top:1px solid #e5e5e5;white-space:nowrap">${m(l.spent)} / ${m(l.limit)}</td>
</tr>`
    })
    .join('')

  const text = lines
    .map(
      (l) =>
        `- ${l.label}: ${Math.round(l.pct)}% ${unit(l)} used (${m(l.spent)} / ${m(l.limit)})${l.note ? `. ${l.note}` : ''}`
    )
    .join('\n')

  return { subject, html: layout(heading, rows), text: `${heading}\n\n${text}` }
}

/* ---------- Reminders ---------- */

export interface ReminderLine {
  name: string
  kind: FixedItemKind
  amount: number | null
  dueDate: string // YYYY-MM-DD
  daysUntil: number
}

const KIND_LABELS: Record<FixedItemKind, string> = {
  fixed_cost: 'Fixed cost',
  savings: 'Savings transfer',
  reminder: 'Reminder',
}

const when = (days: number) => (days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`)

export function reminderEmail(args: { lines: ReminderLine[]; currency: string }): Email {
  const { lines, currency } = args
  const first = lines[0]

  const subject =
    lines.length === 1
      ? `Reminder: ${first.name} due ${when(first.daysUntil)}`
      : `Reminders: ${lines.length} payments coming up`

  const rows = lines
    .map(
      (l) => `<tr>
<td style="padding:10px 0;border-top:1px solid #e5e5e5">
<div style="font-weight:600">${esc(l.name)}</div>
<div style="font-size:13px;color:#737373">${KIND_LABELS[l.kind]} · due ${when(l.daysUntil)} (${esc(formatDayHeading(l.dueDate))})</div>
</td>
<td align="right" style="padding:10px 0;border-top:1px solid #e5e5e5;white-space:nowrap">${
        l.amount !== null ? formatMoney(l.amount, currency) : ''
      }</td>
</tr>`
    )
    .join('')

  const text = lines
    .map(
      (l) =>
        `- ${l.name}${l.amount !== null ? ` (${formatMoney(l.amount, currency)})` : ''}: due ${when(l.daysUntil)}, ${formatDayHeading(l.dueDate)}`
    )
    .join('\n')

  return { subject, html: layout('Payment reminder', rows), text: `Payment reminder\n\n${text}` }
}