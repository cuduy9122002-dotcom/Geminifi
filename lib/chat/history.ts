import type { SupabaseClient } from '@supabase/supabase-js'
import type { AssistantMetadata, ChatMessageDTO } from './types'
import type { UiMessage } from './ui-types'

export async function loadChatHistory(supabase: SupabaseClient, limit = 40): Promise<UiMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, image_path, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error

  const messages = (data as ChatMessageDTO[]).reverse() // oldest first

  // Receipt photos: private bucket, so hand out short-lived signed URLs
  const paths = messages.map((m) => m.image_path).filter((p): p is string => !!p)
  const urlByPath = new Map<string, string>()
  if (paths.length) {
    const { data: signed } = await supabase.storage.from('receipts').createSignedUrls(paths, 60 * 60)
    signed?.forEach((s) => {
      if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl)
    })
  }

  // Which transactions still exist? (undone ones were deleted)
  const txIds = messages.flatMap((m) =>
    m.role === 'assistant'
      ? ((m.metadata as Partial<AssistantMetadata>).transactions ?? []).map((t) => t.id)
      : []
  )
  const alive = new Set<string>()
  if (txIds.length) {
    const { data: existing } = await supabase.from('transactions').select('id').in('id', txIds)
    existing?.forEach((row) => alive.add(row.id as string))
  }

  return messages.map((m): UiMessage => {
    const meta = (m.metadata ?? {}) as Partial<AssistantMetadata>
    const isAssistant = m.role === 'assistant'
    return {
      key: m.id,
      role: m.role,
      content: m.content,
      imageUrl: m.image_path ? (urlByPath.get(m.image_path) ?? null) : null,
      transactions: isAssistant
        ? (meta.transactions ?? []).map((t) => ({
            ...t,
            state: alive.has(t.id) ? ('active' as const) : ('undone' as const),
          }))
        : [],
      budget: isAssistant ? (meta.budget ?? null) : null,
      status: 'sent',
    }
  })
}