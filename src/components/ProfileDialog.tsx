import { FormEvent, useEffect, useRef, useState } from 'react'
import { Camera, Check, Copy, ImageUp, KeyRound, Save, Trash2, UserRound, X } from 'lucide-react'
import { Avatar } from './Avatar'
import { AvatarCropper, type AvatarCropperHandle } from './AvatarCropper'
import { isValidPin, normalizePin } from '../lib/auth'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'

interface ProfileDialogProps {
  profile: Profile
  onClose: () => void
  onProfileUpdated: () => Promise<void>
}

const MAX_AVATAR_SIZE = 2 * 1024 * 1024
const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function ProfileDialog({ profile, onClose, onProfileUpdated }: ProfileDialogProps) {
  const [name, setName] = useState(profile.display_name)
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [avatarSource, setAvatarSource] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const cropperRef = useRef<AvatarCropperHandle>(null)

  useEffect(() => {
    return () => {
      if (avatarSource) URL.revokeObjectURL(avatarSource)
    }
  }, [avatarSource])

  const copyCode = async () => {
    await navigator.clipboard.writeText(profile.player_code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  const chooseAvatar = (file: File | undefined) => {
    setMessage(null)
    if (!file) return
    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      setMessage('Avatar musi być plikiem JPG, PNG albo WebP.')
      return
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setMessage('Zdjęcie źródłowe może mieć maksymalnie 2 MB.')
      return
    }

    if (avatarSource) URL.revokeObjectURL(avatarSource)
    setAvatarSource(URL.createObjectURL(file))
  }

  const clearAvatarSource = () => {
    if (avatarSource) URL.revokeObjectURL(avatarSource)
    setAvatarSource(null)
  }

  const saveAvatar = async () => {
    if (!avatarSource || !cropperRef.current) return

    setBusy(true)
    setMessage(null)

    try {
      const croppedFile = await cropperRef.current.crop()
      if (croppedFile.size > MAX_AVATAR_SIZE) {
        setMessage('Przygotowany avatar jest zbyt duży. Spróbuj innego zdjęcia.')
        setBusy(false)
        return
      }

      const extension = croppedFile.type === 'image/png' ? 'png' : 'webp'
      const path = `${profile.id}/avatar-${Date.now()}.${extension}`
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, croppedFile, {
        cacheControl: '3600',
        contentType: croppedFile.type,
        upsert: false,
      })

      if (uploadError) {
        setMessage('Nie udało się wysłać avatara.')
        setBusy(false)
        return
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ avatar_path: path })
        .eq('id', profile.id)

      if (profileError) {
        await supabase.storage.from('avatars').remove([path])
        setMessage('Nie udało się przypisać avatara do profilu.')
        setBusy(false)
        return
      }

      if (profile.avatar_path) {
        await supabase.storage.from('avatars').remove([profile.avatar_path])
      }

      clearAvatarSource()
      await onProfileUpdated()
      setMessage('Avatar został wykadrowany i zapisany.')
    } catch {
      setMessage('Nie udało się przygotować avatara.')
    } finally {
      setBusy(false)
    }
  }

  const removeAvatar = async () => {
    if (!profile.avatar_path) return
    setBusy(true)
    setMessage(null)

    const { error } = await supabase
      .from('profiles')
      .update({ avatar_path: null })
      .eq('id', profile.id)

    if (error) {
      setBusy(false)
      setMessage('Nie udało się usunąć avatara.')
      return
    }

    await supabase.storage.from('avatars').remove([profile.avatar_path])
    await onProfileUpdated()
    setBusy(false)
    setMessage('Avatar został usunięty.')
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
      <section className="dialog profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
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

        <section className="settings-section avatar-settings">
          <h3><Camera size={18} /> Avatar</h3>
          <div className="avatar-current-row">
            <Avatar profile={profile} size="large" />
            <div className="avatar-controls">
              <label className="secondary-button avatar-file-button">
                <ImageUp size={17} /> {avatarSource ? 'Wybierz inne zdjęcie' : 'Wybierz zdjęcie'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    chooseAvatar(event.target.files?.[0])
                    event.currentTarget.value = ''
                  }}
                />
              </label>
              <small>JPG, PNG lub WebP, maksymalnie 2 MB.</small>
            </div>
          </div>

          {avatarSource && <AvatarCropper ref={cropperRef} src={avatarSource} />}

          <div className="dialog-actions left-actions">
            <button className="secondary-button" type="button" disabled={busy || !avatarSource} onClick={() => void saveAvatar()}>
              <Save size={17} /> Zapisz wykadrowany avatar
            </button>
            {avatarSource && (
              <button className="secondary-button" type="button" disabled={busy} onClick={clearAvatarSource}>
                <X size={17} /> Anuluj kadr
              </button>
            )}
            {profile.avatar_path && (
              <button className="danger-button" type="button" disabled={busy} onClick={() => void removeAvatar()}>
                <Trash2 size={17} /> Usuń avatar
              </button>
            )}
          </div>
        </section>

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
            <input type="password" inputMode="numeric" maxLength={6} value={newPin} onChange={(event) => setNewPin(normalizePin(event.target.value))} placeholder="6 cyfr" autoComplete="new-password" />
          </label>
          <label>
            Powtórz nowy PIN
            <input type="password" inputMode="numeric" maxLength={6} value={confirmPin} onChange={(event) => setConfirmPin(normalizePin(event.target.value))} placeholder="6 cyfr" autoComplete="new-password" />
          </label>
          <button className="secondary-button" disabled={busy}><KeyRound size={17} /> Zmień PIN</button>
        </form>

        {message && <p className="form-message" role="status">{message}</p>}
      </section>
    </div>
  )
}
