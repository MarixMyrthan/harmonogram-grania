import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircle, RefreshCw, Send, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { ChatMessage, Profile } from '../types'
import { Avatar } from './Avatar'

interface ChatPanelProps {
  profiles: Profile[]
  currentUserId: string
  onClose: () => void
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function ChatPanel({ profiles, currentUserId, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles])

  const loadMessages = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: queryError } = await supabase
      .from('chat_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (queryError) {
      setError('Nie udało się pobrać wiadomości czatu.')
    } else {
      setMessages(((data || []) as ChatMessage[]).reverse())
    }
    setLoading(false)
  }, [])

  useEffect(() => { void loadMessages() }, [loadMessages])

  useEffect(() => {
    const channel = supabase
      .channel('meeting-chat-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const incoming = payload.new as ChatMessage
          setMessages((current) => current.some((message) => message.id === incoming.id)
            ? current
            : [...current, incoming].slice(-100))
          return
        }

        void loadMessages()
      })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [loadMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: messages.length > 1 ? 'smooth' : 'auto' })
  }, [messages])

  const sendMessage = async (event?: FormEvent) => {
    event?.preventDefault()
    const message = draft.trim()
    if (!message || sending) return

    setSending(true)
    setError(null)
    const { data, error: insertError } = await supabase.from('chat_messages').insert({
      user_id: currentUserId,
      message,
    }).select('*').single()

    if (insertError) {
      setError('Nie udało się wysłać wiadomości.')
    } else {
      const sent = data as ChatMessage
      setMessages((current) => current.some((item) => item.id === sent.id)
        ? current
        : [...current, sent].slice(-100))
      setDraft('')
    }
    setSending(false)
  }

  const onDraftKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendMessage()
    }
  }

  return (
    <div className="dialog-backdrop chat-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="chat-panel" role="dialog" aria-modal="true" aria-labelledby="chat-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="chat-header">
          <div>
            <p className="eyebrow"><MessageCircle size={15} /> Czat grupowy</p>
            <h2 id="chat-title">Rozmowa graczy</h2>
          </div>
          <div className="chat-header-actions">
            <button className="icon-button" type="button" onClick={() => void loadMessages()} disabled={loading} aria-label="Odśwież czat" title="Odśwież czat">
              <RefreshCw size={18} className={loading ? 'spin' : ''} />
            </button>
            <button className="icon-button" type="button" onClick={onClose} aria-label="Zamknij czat"><X size={20} /></button>
          </div>
        </header>

        <div className="chat-messages" aria-live="polite">
          {loading && messages.length === 0 ? (
            <p className="empty-state">Pobieranie wiadomości…</p>
          ) : messages.length === 0 ? (
            <p className="empty-state">Czat jest pusty. Napisz pierwszą wiadomość.</p>
          ) : messages.map((message) => {
            const profile = profileById.get(message.user_id)
            const own = message.user_id === currentUserId
            return (
              <article className={`chat-message${own ? ' own' : ''}`} key={message.id}>
                {profile ? <Avatar profile={profile} size="small" /> : <div className="avatar small">?</div>}
                <div className="chat-bubble">
                  <div className="chat-message-meta">
                    <strong>{profile?.display_name || 'Nieznany użytkownik'}</strong>
                    <time dateTime={message.created_at}>{formatTime(message.created_at)}</time>
                  </div>
                  <p>{message.message}</p>
                </div>
              </article>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {error && <p className="form-message" role="status">{error}</p>}

        <form className="chat-composer" onSubmit={(event) => void sendMessage(event)}>
          <label>
            <span className="sr-only">Wiadomość</span>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value.slice(0, 500))}
              onKeyDown={onDraftKeyDown}
              placeholder="Napisz wiadomość…"
              rows={3}
              maxLength={500}
            />
            <small className="character-count">Enter — wyślij · Shift+Enter — nowa linia · {draft.length}/500</small>
          </label>
          <button className="primary-button" type="submit" disabled={sending || !draft.trim()}>
            <Send size={18} /> {sending ? 'Wysyłanie…' : 'Wyślij'}
          </button>
        </form>
      </section>
    </div>
  )
}
