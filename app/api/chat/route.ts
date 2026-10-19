import { after, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractTransactions } from '@/lib/gemini/client'
import type { Extraction } from '@/lib/gemini/schema'
import {
  getBudgetSnapshot,
  getUserContext,
  insertChatMessage,
  insertTransactions,
  uploadReceipt,
} from '@/lib/chat/db'
import { normalizeDrafts, todayInTimezone } from '@/lib/chat/normalize'
import { checkChatRateLimit } from '@/lib/chat/rate-limit'
import { checkBudgetAlerts } from '@/lib/alerts/budget'
import { answerQuery } from '@/lib/query/execute'
import type { AnswerCard } from '@/lib/query/types'
import type { ChatApiError, ChatApiResponse, SavedTransaction } from '@/lib/chat/types'

export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_TEXT_CHARS = 2000
const MAX_IMAGE_BYTES = 4 * 1024 * 1024 // Vercel limits request bodies; the client compresses first
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])

const fail = (error: string, status: number) =>
  NextResponse.json<ChatApiError>({ error }, { status })

export async function POST(request: Request) {
  // 0. Auth. The proxy already gates /api/*, but a route must never rely on that alone.
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) return fail('Unauthorized', 401)

  // 1. Parse + validate input (multipart for text+image, or plain JSON for text only)
  let text: string | null = null
  let file: File | null = null
  try {
    if ((request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
      const form = await request.formData()
      const message = form.get('message')
      const image = form.get('image')
      text = typeof message === 'string' ? message.trim() || null : null
      file = image instanceof File && image.size > 0 ? image : null
    } else {
      const body = (await request.json()) as { message?: unknown }
      text = typeof body.message === 'string' ? body.message.trim() || null : null
    }
  } catch {
    return fail('Invalid request body.', 400)
  }

  if (!text && !file) return fail('Send a message or a receipt photo.', 400)
  if (text && text.length > MAX_TEXT_CHARS) {
    return fail(`Message is too long (max ${MAX_TEXT_CHARS} characters).`, 400)
  }
  if (file && !ALLOWED_IMAGE_TYPES.has(file.type)) {
    return fail('Unsupported image type. Use JPEG, PNG, WebP or HEIC.', 415)
  }
  if (file && file.size > MAX_IMAGE_BYTES) {
    return fail('Image is too large (max 4 MB).', 413)
  }

  // Sanity brake against retry loops / a stolen session (Step 7)
  const limited = await checkChatRateLimit(supabase)
  if (limited) return fail(limited, 429)

  try {
    const ctx = await getUserContext(supabase)
    const { date: today, weekday } = todayInTimezone(ctx.timezone)
    const imageBytes = file ? Buffer.from(await file.arrayBuffer()) : null

    // 2. Ask Gemini. If this fails, nothing has been saved yet.
    let extraction: Extraction
    try {
      extraction = await extractTransactions({
        text,
        image: imageBytes && file ? { base64: imageBytes.toString('base64'), mimeType: file.type } : null,
        context: {
          today,
          weekday,
          timezone: ctx.timezone,
          currency: (ctx as any).currency,
          categories: ctx.categories,
        },
      })
    } catch (err) {
      console.error('[chat] Gemini extraction failed:', err)
      return fail('The AI service did not respond properly. Nothing was saved. Please try again.', 502)
    }

    // 3. Never trust model output blindly: validate amounts, dates and categories
    const hasQuery = extraction.query.kind !== 'none'
    let status = extraction.status
    if (status === 'question' && !hasQuery) status = 'not_a_transaction'

    const { rows, skipped } =
      status === 'ok'
        ? normalizeDrafts(extraction.transactions, ctx.categories, today)
        : { rows: [], skipped: 0 }

    let reply = extraction.reply.trim() || 'Done.'
    if (status === 'ok' && rows.length === 0) {
      status = 'needs_clarification'
      reply = "I couldn't find a valid amount. How much was it?"
    } else if (skipped > 0) {
      reply += ` (${skipped} entr${skipped === 1 ? 'y' : 'ies'} skipped: invalid amount.)`
    }

    // 4. Persist: receipt file -> user message -> transactions
    const imagePath =
      imageBytes && file ? await uploadReceipt(supabase, userId, imageBytes, file.type, today) : null

    const userMessage = await insertChatMessage(supabase, {
      userId,
      role: 'user',
      content: text ?? '',
      imagePath,
    })

    const transactions: SavedTransaction[] = rows.length
      ? await insertTransactions(supabase, {
          userId,
          rows,
          source: imagePath ? 'chat_image' : 'chat_text',
          receiptPath: imagePath,
          chatMessageId: userMessage.id,
        })
      : []

    // Budget alerts run AFTER the response is sent, so they never slow the chat down
    if (transactions.some((t) => t.type === 'expense')) {
      after(async () => {
        try {
          await checkBudgetAlerts(userId, today)
        } catch (err) {
          console.error('[alerts] instant check failed:', err)
        }
      })
    }

    const budget = transactions.length
      ? await getBudgetSnapshot(supabase, today)
      : null

    // 5. Questions: answered from the database AFTER saving, so the numbers include what was just logged
    let answer: AnswerCard | null = null
    if (hasQuery && (status === 'ok' || status === 'question')) {
      try {
        answer = await answerQuery(supabase, extraction.query, {
          currency: (context as any).currency,
          today,
          cycleStartDay: ctx.cycleStartDay,
          categories: ctx.categories,
        })
      } catch (err) {
        console.error('[chat] answering failed:', err)
      }
      if (!answer && transactions.length === 0) {
        reply = "I couldn't look that up right now. Please try again."
      }
    }

    // 6. Assistant message (cards are stored in metadata so a reload shows them again)
    const assistantMessage = await insertChatMessage(supabase, {
      userId,
      role: 'assistant',
      content: reply,
      metadata: { status, transactions, budget, skipped, answer },
    })

    return NextResponse.json<ChatApiResponse>({
      userMessage,
      assistantMessage,
      transactions,
      budget,
      answer,
    })
  } catch (err) {
    console.error('[chat] unexpected error:', err)
    return fail('Something went wrong while saving. Please try again.', 500)
  }
}