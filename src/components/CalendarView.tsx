import { useMemo } from 'react'
import { Check, CircleHelp, Mail, Pin, UsersRound, X } from 'lucide-react'
import type { Availability, Profile } from '../types'
import { buildMonthGrid, toDateKey, WEEKDAYS } from '../lib/date'

interface CalendarViewProps {
  month: Date
  profiles: Profile[]
  availability: Availability[]
  currentUserId: string
  protectedDays: string[]
  showProtectionMarks: boolean
  onSelectDay: (day: string) => void
}

function getDayClass(entries: Availability[], profileCount: number): string {
  if (entries.length === 0) return ''
  if (entries.some((entry) => entry.status === 'unavailable')) return ' unavailable-day'
  if (entries.length === profileCount && entries.some((entry) => entry.status === 'unsure')) {
    return ' unsure-day'
  }
  if (entries.length === profileCount) return ' everyone'
  return ' partial'
}

function getDayDescription(entries: Availability[], profileCount: number): string {
  if (entries.length === 0) return 'brak odpowiedzi'
  if (entries.some((entry) => entry.status === 'unavailable')) {
    return entries.length < profileCount
      ? 'ktoś nie da rady, część graczy jeszcze nie odpowiedziała'
      : 'ktoś nie da rady'
  }
  if (entries.some((entry) => entry.status === 'unsure')) {
    return entries.length < profileCount
      ? 'ktoś jeszcze nie wie, część graczy jeszcze nie odpowiedziała'
      : 'ktoś jeszcze nie wie'
  }
  if (entries.length === profileCount) return 'wszystkim pasuje'
  return `${entries.length} z ${profileCount} graczy zaznaczyło „Pasuje mi”`
}

export function CalendarView({
  month,
  profiles,
  availability,
  currentUserId,
  protectedDays,
  showProtectionMarks,
  onSelectDay,
}: CalendarViewProps) {
  const cells = useMemo(() => buildMonthGrid(month), [month])
  const today = toDateKey(new Date())
  const protectedDaySet = useMemo(() => new Set(protectedDays), [protectedDays])
  const byDay = useMemo(() => {
    const map = new Map<string, Availability[]>()
    for (const entry of availability) {
      const list = map.get(entry.day) || []
      list.push(entry)
      map.set(entry.day, list)
    }
    return map
  }, [availability])

  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles])

  return (
    <div className="calendar-shell">
      <div className="weekday-row">
        {WEEKDAYS.map((weekday) => <div key={weekday}>{weekday}</div>)}
      </div>
      <div className="calendar-grid">
        {cells.map((date, index) => {
          if (!date) return <div className="calendar-day empty" key={`empty-${index}`} aria-hidden="true" />
          const key = toDateKey(date)
          const entries = (byDay.get(key) || []).filter((entry) => profileById.has(entry.user_id))
          const ownEntry = entries.find((entry) => entry.user_id === currentUserId)
          const statusClass = getDayClass(entries, profiles.length)
          const visibleEntries = entries.slice(0, 5)
          const hiddenCount = Math.max(0, entries.length - visibleEntries.length)
          const protectedFromCleanup = protectedDaySet.has(key)

          return (
            <button
              type="button"
              className={`calendar-day${statusClass}${ownEntry ? ' own' : ''}${key === today ? ' today' : ''}${protectedFromCleanup ? ' cleanup-protected' : ''}`}
              key={key}
              onClick={() => onSelectDay(key)}
              aria-label={`${key}: ${getDayDescription(entries, profiles.length)}${protectedFromCleanup ? ', chroniony przed automatycznym usunięciem' : ''}`}
            >
              <span className="day-number">{date.getDate()}</span>
              {ownEntry && (
                <span className="own-mark" title="Twoja odpowiedź">
                  {ownEntry.status === 'available' && <Check size={14} />}
                  {ownEntry.status === 'unsure' && <CircleHelp size={14} />}
                  {ownEntry.status === 'unavailable' && <X size={14} />}
                </span>
              )}
              {showProtectionMarks && protectedFromCleanup && (
                <span className="retention-mark" title="Termin nie zostanie usunięty automatycznie">
                  <Pin size={13} />
                </span>
              )}
              <div className="day-summary">
                <span className="person-count"><UsersRound size={14} /> {entries.length}/{profiles.length}</span>
                <div className="mini-names">
                  <div className="mini-name-list">
                    {visibleEntries.map((entry) => {
                      const hasExtraInfo = Boolean(entry.note?.trim())

                      return (
                        <span
                          className={`status-pill status-${entry.status}`}
                          key={entry.user_id}
                          title={hasExtraInfo ? 'Dodano godziny lub uwagę' : undefined}
                        >
                          {profileById.get(entry.user_id)?.display_name}
                          {hasExtraInfo && <Mail className="note-indicator" size={11} aria-hidden="true" />}
                        </span>
                      )
                    })}
                  </div>
                  {hiddenCount > 0 && (
                    <span
                      className="more-people-count"
                      title={`Pozostałych graczy: ${hiddenCount}`}
                      aria-label={`Pozostałych graczy: ${hiddenCount}`}
                    >
                      +{hiddenCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
