import 'server-only'
import { Resend } from 'resend'

let client: Resend | null = null

export async function sendEmail(args: { to: string; subject: string; html: string; text: string }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY is not set')
  client ??= new Resend(apiKey)

  const from = process.env.EMAIL_FROM || 'GeminiFi <onboarding@resend.dev>'
  const { error } = await client.emails.send({
    from,
    to: [args.to],
    subject: args.subject,
    html: args.html,
    text: args.text,
  })

  if (error) throw new Error(`Resend error: ${error.message}`)
}