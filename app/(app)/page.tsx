import { createClient } from '@/lib/supabase/server'
import { loadChatHistory } from '@/lib/chat/history'
import { ChatView } from '@/components/chat/chat-view'

export default async function ChatPage() {
  const supabase = await createClient()

  const [history, settings] = await Promise.all([
    loadChatHistory(supabase),
    supabase.from('user_settings').select('currency').maybeSingle(),
  ])

  const currency = (settings.data?.currency as string | undefined) ?? 'EUR'

  return <ChatView initialMessages={history} currency={currency} />
}