import { FormEvent, useState } from 'react'
import { Check, Copy, KeyRound, Save, UserRound, X } from 'lucide-react'
import { isValidPin, normalizePin } from '../lib/auth'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'

interface ProfileDialogProps {
  profile: Profile
  onClose: () => void
  onProfileUpdated: () => Promise<void>
}

export function ProfileDialog({ profile, onClose, onProfileUpdated }: ProfileDialogProps) {
  const [name, setName] = useState(profile.display_name)
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyCode = async () => {
    await navigator.clipboard.writeText(profile.player_code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  const saveName = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length < 2) {
      setMessage('Nazwa musi mieć co najmniej 2 znaki.')
      return
    }

    setBusy(true)
    const { error } = await supabase.from('profiles').update({ display_name: trimmed }).eq('id', profile.id)
    if (!error) await onProfileUpdated()
    setBusy(false)
    setMessage(error ? 'Nie udało się zmienić nazwy.' : 'Nazwa została zmieniona.')
  }

  const savePin = async (event: FormEvent) => {
    event.preventDefault()
    if (!isValidPin(newPin)) {
      setMessage('Nowy PIN musi składać się dokładnie z 6 cyfr.')
      return
    }
    if (newPin !== confirmPin) {
      setMessage('Wpisane PIN-y nie są takie same.')
      return
    }

    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: newPin })
    setBusy(false)
    if (error) {
      setMessage('Nie udało się zmienić PIN-u.')
      return
    }
    setNewPin('')
    setConfirmPin('')
    setMessage('PIN został zmieniony.')
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title" onMouseDown={(e) => e.stopPropagation()}>
        <button className="icon-button dialog-close" type="button" onClick={onClose} aria-label="Zamknij"><X size={21} /></button>
        <p className="eyebrow">Twoje konto</p>
        <h2 id="profile-dialog-title">Ustawienia profilu</h2>

        <div className="player-code-card">
          <div>
            <small>Kod gracza</small>
            <strong>{profile.player_code}</strong>
          </div>
          <button className="secondary-button compact" type="button" onClick={copyCode}>
            {copied ? <Check size={17} /> : <Copy size={17} />} {copied ? 'Skopiowano' : 'Kopiuj'}
          </button>
        </div>

        <form className="settings-section" onSubmit={saveName}>
          <h3><UserRound size={18} /> Nazwa wyświetlana</h3>
          <label>
            Nazwa widoczna dla pozostałych
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} />
          </label>
          <button className="secondary-button" disabled={busy}><Save size={17} /> Zapisz nazwę</button>
        </form>

        <form className="settings-section" onSubmit={savePin}>
          <h3><KeyRound size={18} /> Zmiana PIN-u</h3>
          <label>
            Nowy PIN
            <input type="password" inputMode="numeric" maxLength={6} value={newPin} onChange={(e) => setNewPin(normalizePin(e.target.value))} placeholder="6 cyfr" autoComplete="new-password" />
          </label>
          <label>
            Powtórz nowy PIN
            <input type="password" inputMode="numeric" maxLength={6} value={confirmPin} onChange={(e) => setConfirmPin(normalizePin(e.target.value))} placeholder="6 cyfr" autoComplete="new-password" />
          </label>
          <button className="secondary-button" disabled={busy}><KeyRound size={17} /> Zmień PIN</button>
        </form>

        {message && <p className="form-message" role="status">{message}</p>}
      </section>
    </div>
  )
}
