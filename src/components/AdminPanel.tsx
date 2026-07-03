import { useCallback, useEffect, useMemo, useState } from 'react'
import { Ban, Check, Copy, RefreshCw, ShieldCheck, Trash2, UserCheck, UserPlus, UsersRound, X } from 'lucide-react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AdminUser {
  id: string
  player_code: string
  display_name: string
  avatar_path: string | null
  avatar_url: string | null
  is_active: boolean
  is_admin: boolean
  created_at: string
  last_seen_at: string | null
}

interface Invite {
  player_code: string
  activation_code: string
  expires_at: string
}

interface AdminPanelProps {
  currentUserId: string
  onClose: () => void
  onUsersChanged: () => Promise<void>
}

const ONLINE_WINDOW_MS = 90_000

function formatDate(value: string | null): string {
  if (!value) return 'Nigdy'
  return new Intl.DateTimeFormat('pl-PL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?'
}

async function readFunctionError(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.json() as { error?: string }
      return payload.error || fallback
    } catch {
      return fallback
    }
  }
  return fallback
}

export function AdminPanel({ currentUserId, onClose, onUsersChanged }: AdminPanelProps) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [serverTime, setServerTime] = useState(() => Date.now())
  const [invite, setInvite] = useState<Invite | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const invoke = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('admin-control', { body })
    if (error) throw error
    return data as Record<string, unknown>
  }, [])

  const loadUsers = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const data = await invoke({ action: 'list' })
      setUsers((data.users || []) as AdminUser[])
      setServerTime(data.server_time ? new Date(String(data.server_time)).getTime() : Date.now())
      if (!quiet) setMessage(null)
    } catch (error) {
      setMessage(await readFunctionError(error, 'Nie udało się pobrać listy użytkowników.'))
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [invoke])

  useEffect(() => {
    void loadUsers()
    const timer = window.setInterval(() => void loadUsers(true), 30_000)
    return () => window.clearInterval(timer)
  }, [loadUsers])

  const isOnline = useCallback((user: AdminUser) => {
    if (!user.is_active || !user.last_seen_at) return false
    return serverTime - new Date(user.last_seen_at).getTime() <= ONLINE_WINDOW_MS
  }, [serverTime])

  const sortedUsers = useMemo(() => [...users].sort((a, b) => {
    const onlineDiff = Number(isOnline(b)) - Number(isOnline(a))
    if (onlineDiff) return onlineDiff
    return a.display_name.localeCompare(b.display_name, 'pl')
  }), [isOnline, users])

  const generateInvite = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const data = await invoke({ action: 'invite' })
      setInvite(data.invite as Invite)
    } catch (error) {
      setMessage(await readFunctionError(error, 'Nie udało się wygenerować zaproszenia.'))
    } finally {
      setBusy(false)
    }
  }

  const copyInvite = async () => {
    if (!invite) return
    await navigator.clipboard.writeText(invite.activation_code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  const setActive = async (user: AdminUser, active: boolean) => {
    const verb = active ? 'odblokować' : 'zablokować'
    if (!window.confirm(`Czy na pewno chcesz ${verb} konto „${user.display_name}”?`)) return
    setBusy(true)
    setMessage(null)
    try {
      await invoke({ action: 'set-active', userId: user.id, active })
      await Promise.all([loadUsers(true), onUsersChanged()])
      setMessage(active ? 'Konto zostało odblokowane.' : 'Konto zostało zablokowane.')
    } catch (error) {
      setMessage(await readFunctionError(error, 'Nie udało się zmienić stanu konta.'))
    } finally {
      setBusy(false)
    }
  }

  const deleteUser = async (user: AdminUser) => {
    if (!window.confirm(`Trwale usunąć konto „${user.display_name}” wraz z jego terminami? Tej operacji nie można cofnąć.`)) return
    setBusy(true)
    setMessage(null)
    try {
      await invoke({ action: 'delete-user', userId: user.id })
      await Promise.all([loadUsers(true), onUsersChanged()])
      setMessage('Konto i jego dane zostały usunięte.')
    } catch (error) {
      setMessage(await readFunctionError(error, 'Nie udało się usunąć konta.'))
    } finally {
      setBusy(false)
    }
  }

  const onlineCount = users.filter(isOnline).length
  const blockedCount = users.filter((user) => !user.is_active).length

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog admin-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="icon-button dialog-close" type="button" onClick={onClose} aria-label="Zamknij"><X size={21} /></button>
        <p className="eyebrow"><ShieldCheck size={15} /> Tylko administrator</p>
        <h2 id="admin-dialog-title">Panel administratora</h2>

        <div className="admin-summary">
          <span><b>{users.length}</b> kont</span>
          <span className="online-summary"><b>{onlineCount}</b> online</span>
          <span><b>{blockedCount}</b> zablokowanych</span>
        </div>

        <section className="admin-invite-section">
          <div>
            <h3><UserPlus size={18} /> Nowe zaproszenie</h3>
            <p>Jednorazowy kod jest ważny przez 30 dni.</p>
          </div>
          <button className="primary-button" type="button" disabled={busy} onClick={() => void generateInvite()}>
            <UserPlus size={17} /> Wygeneruj zaproszenie
          </button>
        </section>

        {invite && (
          <div className="admin-invite-card">
            <div>
              <small>Kod aktywacyjny</small>
              <strong>{invite.activation_code}</strong>
              <span>Kod gracza: {invite.player_code} · ważny do {formatDate(invite.expires_at)}</span>
            </div>
            <button className="secondary-button compact" type="button" onClick={() => void copyInvite()}>
              {copied ? <Check size={17} /> : <Copy size={17} />} {copied ? 'Skopiowano' : 'Kopiuj kod'}
            </button>
          </div>
        )}

        <div className="admin-list-heading">
          <h3><UsersRound size={18} /> Użytkownicy</h3>
          <button className="secondary-button compact" type="button" disabled={loading || busy} onClick={() => void loadUsers()}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} /> Odśwież
          </button>
        </div>

        {loading && users.length === 0 ? (
          <p className="empty-state">Pobieranie użytkowników…</p>
        ) : (
          <div className="admin-user-list">
            {sortedUsers.map((user) => {
              const online = isOnline(user)
              const own = user.id === currentUserId
              return (
                <article className={`admin-user-card ${user.is_active ? '' : 'blocked'}`} key={user.id}>
                  <div className="admin-user-avatar" aria-hidden="true">
                    {user.avatar_url ? <img src={user.avatar_url} alt="" /> : <span>{initials(user.display_name)}</span>}
                    <i className={online ? 'online-dot' : 'offline-dot'} />
                  </div>
                  <div className="admin-user-main">
                    <div className="admin-user-title">
                      <strong>{user.display_name}</strong>
                      {user.is_admin && <span className="admin-role-badge">Administrator</span>}
                      <span className={user.is_active ? 'account-active-badge' : 'account-blocked-badge'}>
                        {user.is_active ? 'Aktywne' : 'Zablokowane'}
                      </span>
                    </div>
                    <code>{user.player_code}</code>
                    <dl className="admin-user-meta">
                      <div><dt>Online teraz</dt><dd>{online ? 'Tak' : 'Nie'}</dd></div>
                      <div><dt>Ostatnio online</dt><dd>{formatDate(user.last_seen_at)}</dd></div>
                      <div><dt>Data dołączenia</dt><dd>{formatDate(user.created_at)}</dd></div>
                    </dl>
                  </div>
                  <div className="admin-user-actions">
                    {user.is_active ? (
                      <button className="warning-button compact" type="button" disabled={busy || own || user.is_admin} onClick={() => void setActive(user, false)}>
                        <Ban size={16} /> Zablokuj
                      </button>
                    ) : (
                      <button className="secondary-button compact" type="button" disabled={busy || own || user.is_admin} onClick={() => void setActive(user, true)}>
                        <UserCheck size={16} /> Odblokuj
                      </button>
                    )}
                    <button className="danger-button compact" type="button" disabled={busy || own || user.is_admin} onClick={() => void deleteUser(user)}>
                      <Trash2 size={16} /> Usuń
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        {message && <p className="form-message" role="status">{message}</p>}
      </section>
    </div>
  )
}
