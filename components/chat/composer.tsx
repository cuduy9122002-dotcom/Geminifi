'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Camera, LoaderCircle, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { compressImage } from '@/lib/image'

export interface OutgoingMessage {
  text: string
  file: File | null
  previewUrl: string | null
}

interface Attachment {
  file: File
  previewUrl: string
}

interface Props {
  busy: boolean
  onSend: (message: OutgoingMessage) => void
}

export function Composer({ busy, onSend }: Props) {
  const [text, setText] = useState('')
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [processing, setProcessing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  const canSend = !busy && !processing && (text.trim().length > 0 || attachment !== null)

  // Auto-grow the textarea up to ~5 lines, shrink back after sending
  useEffect(() => {
    const el = textRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [text])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0]
    e.target.value = '' // allow picking the same file again
    if (!picked) return

    setProcessing(true)
    try {
      const file = await compressImage(picked)
      setAttachment((prev) => {
        if (prev) URL.revokeObjectURL(prev.previewUrl)
        return { file, previewUrl: URL.createObjectURL(file) }
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not read that image.')
    } finally {
      setProcessing(false)
    }
  }

  function removeAttachment() {
    setAttachment((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl)
      return null
    })
  }

  function submit() {
    if (!canSend) return
    // Ownership of previewUrl moves to the chat message, so we don't revoke it here
    onSend({
      text: text.trim(),
      file: attachment?.file ?? null,
      previewUrl: attachment?.previewUrl ?? null,
    })
    setText('')
    setAttachment(null)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="bg-background px-3 pb-2 pt-2">
      {(attachment || processing) && (
        <div className="mb-2">
          {processing ? (
            <div className="flex size-14 items-center justify-center rounded-lg bg-muted">
              <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            attachment && (
              <div className="relative w-fit">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={attachment.previewUrl}
                  alt="Attached receipt"
                  className="size-14 rounded-lg object-cover object-top"
                />
                <button
                  type="button"
                  onClick={removeAttachment}
                  aria-label="Remove photo"
                  className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background"
                >
                  <X className="size-3" />
                </button>
              </div>
            )
          )}
        </div>
      )}

      <div className="flex items-end gap-2">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 shrink-0 rounded-full"
          aria-label="Add receipt photo"
          disabled={processing}
          onClick={() => fileRef.current?.click()}
        >
          <Camera className="size-5" />
        </Button>

        <textarea
          ref={textRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          enterKeyHint="send"
          placeholder="Lunch 12,50 · coffee 3,20 cash…"
          className="max-h-[140px] min-h-10 flex-1 resize-none rounded-2xl bg-muted px-4 py-2 text-base outline-none placeholder:text-muted-foreground"
        />

        <Button
          type="button"
          size="icon"
          className="size-10 shrink-0 rounded-full"
          aria-label="Send"
          disabled={!canSend}
          onClick={submit}
        >
          <ArrowUp className="size-5" />
        </Button>
      </div>
    </div>
  )
}