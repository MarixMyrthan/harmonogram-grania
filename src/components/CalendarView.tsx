import { useMemo } from 'react'
import { Check, UsersRound } from 'lucide-react'
import type { Availability, Profile } from '../types'
import { buildMonthGrid, toDateKey, WEEKDAYS } from '../lib/date'

interface CalendarViewProps {
  month: Date
  profiles: Profile[]
  availability: Availability[]
  currentUserId: string
  onSelectDay: (day: string) => void
}

export function CalendarView({ month, profiles, availability, currentUserId, onSelectDay }: CalendarViewProps) {
  const cells = useMemo(() => buildMonthGrid(month), [month])
  const today = toDateKey(new Date())
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
          const own = entries.some((entry) => entry.user_id === currentUserId)
          const everyone = profiles.length > 0 && entries.length === profiles.length

          return (
            <button
              type="button"
              className={`calendar-day${own ? ' own' : ''}${everyone ? ' everyone' : ''}${key === today ? ' today' : ''}`}
              key={key}
              onClick={() => onSelectDay(key)}
              aria-label={`${key}: ${entries.length} z ${profiles.length} osób`}
            >
              <span className="day-number">{date.getDate()}</span>
              {own && <span className="own-mark" title="Ten dzień Ci pasuje"><Check size={14} /></span>}
              <div className="day-summary">
                <span className="person-count"><UsersRound size={14} /> {entries.length}/{profiles.length}</span>
                <div className="mini-names">
                  {entries.slice(0, 3).map((entry) => (
                    <span key={entry.user_id}>{profileById.get(entry.user_id)?.display_name}</span>
                  ))}
                  {entries.length > 3 && <span>+{entries.length - 3}</span>}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
