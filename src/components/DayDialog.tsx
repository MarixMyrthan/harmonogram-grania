import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Check, Clock3, Trash2, X } from 'lucide-react'
import type { Availability, Profile } from '../types'
import { longDateLabel } from '../lib/date'

interface DayDialogProps {
  day: string
  profiles: Profile[]
  availability: Availability[]
  currentUserId: string
  busy: boolean
  onClose: () => void
  onSave: (selected: boolean, note: string) => Promise<void>
}

export function DayDialog({
  day,
  profiles,
  availability,
  currentUserId,
  busy,
  onClose,
  onSave,
}: DayDialogProps) {
  const ownEntry = availability.find((entry) => entry.user_id === currentUserId)
  const [selected, setSelected] = useState(Boolean(ownEntry))
  const [note, setNote] = useState(ownEntry?.note || '')

  useEffect(() => {
    setSelected(Boolean(ownEntry))
    setNote(ownEntry?.note || '')
  }, [ownEntry, day])

  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles])
  const availablePeople = availability
    .map((entry) => ({ entry, profile: profileMap.get(entry.user_id) }))
    .filter((item): item is { entry: Availability; profile: Profile } => Boolean(item.profile))
    .sort((a, b) => a.profile.display_name.localeCompare(b.profile.display_name, 'pl'))

  const missingPeople = profiles.filter((profile) => !availability.some((entry) => entry.user_id === profile.id))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await onSave(selected, note.trim())
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="day-dialog-title" onMouseDown={(e) => e.stopPropagation()}>
        <button className="icon-button dialog-close" type="button" onClick={onClose} aria-label="Zamknij">
          <X size={21} />
        </button>
        <p className="eyebrow">Dostępność ekipy</p>
        <h2 id="day-dialog-title">{longDateLabel(day)}</h2>

        <div className="people-list">
          {availablePeople.length === 0 ? (
            <p className="empty-state">Nikt jeszcze nie zaznaczył tego dnia.</p>
          ) : availablePeople.map(({ profile, entry }) => (
            <article className="person-row" key={profile.id}>
              <span className="avatar">{profile.display_name.slice(0, 1).toUpperCase()}</span>
              <div>
                <strong>{profile.display_name}{profile.id === currentUserId ? ' (Ty)' : ''}</strong>
                <p>{entry.note || 'Bez dodatkowych uwag'}</p>
              </div>
              <Check className="success-icon" size={20} aria-label="Pasuje" />
            </article>
          ))}
        </div>

        {missingPeople.length > 0 && (
          <p className="missing-people">
            Nie zaznaczyli: {missingPeople.map((profile) => profile.display_name).join(', ')}
          </p>
        )}

        <form className="own-availability" onSubmit={submit}>
          <label className="check-card">
            <input type="checkbox" checked={selected} onChange={(event) => setSelected(event.target.checked)} />
            <span className="fake-check"><Check size={17} /></span>
            <span>
              <strong>Pasuje mi ten dzień</strong>
              <small>Możesz dopisać godziny lub inne informacje.</small>
            </span>
          </label>

          <label>
            <span className="label-with-icon"><Clock3 size={16} /> Uwagi</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, 200))}
              placeholder="np. od 19:00, najlepiej wieczorem…"
              rows={3}
              disabled={!selected}
            />
            <small className="character-count">{note.length}/200</small>
          </label>

          <button className={selected ? 'primary-button' : 'danger-button'} disabled={busy}>
            {selected ? <Check size={18} /> : <Trash2 size={18} />}
            {busy ? 'Zapisywanie…' : selected ? 'Zapisz mój termin' : 'Usuń moje zaznaczenie'}
          </button>
        </form>
      </section>
    </div>
  )
}
