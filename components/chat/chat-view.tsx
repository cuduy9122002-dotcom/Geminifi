'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Composer, type OutgoingMessage } from './composer'
import { MessageBubble } from './message-bubble'
import { formatMoney } from '@/lib/format'
import type { ChatApiError, ChatApiResponse, UndoApiResponse } from '@/lib/chat/types'
import type { TxState, UiMessage } from '@/lib/chat/ui-types'

interface Props {
  initialMessages: UiMessage[]
  currency: string
}

const localKey = () => `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

function TypingIndicator() {
  return (
    <div className="flex w-fit items-center gap-1 rounded-2xl rounded-bl-md bg-muted px-4 py-3" aria-label="Thinking">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  )
}

export function ChatView({ initialMessages, currency }: Props) {
  const [messages, setMessages] = useState<UiMessage[]>(initialMessages)
  const [thinking, setThinking] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const didMount = useRef(false)
  const payloads = useRef(new Map<string, OutgoingMessage>()) // for Retry

  // Jump to the bottom on first paint, glide on new messages
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: didMount.current ? 'smooth' : 'auto', block: 'end' })
    didMount.current = true
  }, [messages.length, thinking])

  const patchMessage = useCallback((key: string, patch: Partial<UiMessage>) => {
    setMessages((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)))
  }, [])

  const setTxState = useCallback((messageKey: string, txId: string, state: TxState) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.key !== messageKey
          ? m
          : { ...m, transactions: m.transactions.map((t) => (t.id === txId ? { ...t, state } : t)) }
      )
    )
  }, [])

  /* ---------- Send ---------- */
  const send = useCallback(
    async (msg: OutgoingMessage) => {
      const key = localKey()
      payloads.current.set(key, msg)

      setMessages((prev) => [
        ...prev,
        {
          key,
          role: 'user',
          content: msg.text,
          imageUrl: msg.previewUrl,
          transactions: [],
          budget: null,
          status: 'sending',
        },
      ])
      setThinking(true)

      try {
        let res: Response
        if (msg.file) {
          const form = new FormData()
          if (msg.text) form.append('message', msg.text)
          form.append('image', msg.file)
          res = await fetch('/api/chat', { method: 'POST', body: form })
        } else {
          res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg.text }),
          })
        }

        const json = (await res.json().catch(() => null)) as ChatApiResponse | ChatApiError | null

        if (!res.ok || !json || !('assistantMessage' in json)) {
          const error =
            json && 'error' in json
              ? json.error
              : res.status === 413
                ? 'The photo is too large to upload.'
                : `Request failed (${res.status}).`
          patchMessage(key, { status: 'failed', error })
          return
        }

        payloads.current.delete(key)
        setMessages((prev) => [
          ...prev.map((m) => (m.key === key ? { ...m, status: 'sent' as const } : m)),
          {
            key: json.assistantMessage.id,
            role: 'assistant',
            content: json.assistantMessage.content,
            imageUrl: null,
            transactions: json.transactions.map((t) => ({ ...t, state: 'active' as const })),
            budget: json.budget,
            answer: json.answer,
            status: 'sent',
          },
        ])
      } catch {
        patchMessage(key, { status: 'failed', error: 'Network error. Check your connection and retry.' })
      } finally {
        setThinking(false)
      }
    },
    [patchMessage]
  )

  function retry(key: string) {
    const payload = payloads.current.get(key)
    if (!payload) return
    payloads.current.delete(key)
    setMessages((prev) => prev.filter((m) => m.key !== key))
    void send(payload)
  }

  function dismiss(key: string) {
    payloads.current.delete(key)
    setMessages((prev) => prev.filter((m) => m.key !== key))
  }

  /* ---------- Undo ---------- */
  async function undo(messageKey: string, txId: string) {
    setTxState(messageKey, txId, 'undoing')
    try {
      const res = await fetch(`/api/transactions/${txId}`, { method: 'DELETE' })
      const json = (await res.json().catch(() => null)) as UndoApiResponse | ChatApiError | null

      // 404 = already gone (undone elsewhere): treat as success
      if (res.ok || res.status === 404) {
        setTxState(messageKey, txId, 'undone')
        if (json && 'budget' in json && json.budget) {
          toast(`Undone. Remaining ${formatMoney(json.budget.remaining, currency)}`)
        } else {
          toast('Undone')
        }
        return
      }

      setTxState(messageKey, txId, 'active')
      toast.error(json && 'error' in json ? json.error : 'Could not undo. Please try again.')
    } catch {
      setTxState(messageKey, txId, 'active')
      toast.error('Network error. Could not undo.')
    }
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
      <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-4">
        {messages.length === 0 && !thinking ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
            <p>Tell me what you spent, or snap a receipt.</p>
            <p className="text-xs">e.g. “Lunch 12,50 and coffee 3,20 cash”</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => (
              <MessageBubble
                key={m.key}
                message={m}
                currency={currency}
                onUndo={(txId) => void undo(m.key, txId)}
                onRetry={() => retry(m.key)}
                onDismiss={() => dismiss(m.key)}
              />
            ))}
            {thinking && <TypingIndicator />}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <Composer busy={thinking} onSend={(msg) => void send(msg)} />
    </div>
  )
}