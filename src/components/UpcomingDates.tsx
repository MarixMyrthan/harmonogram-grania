import { CalendarCheck2, Mail } from 'lucide-react'
import { useMemo } from 'react'
import { longDateLabel } from '../lib/date'
import { findUpcomingDates } from '../lib/upcomingDates'
import type {
  Availability,
  MeetingIdea,
  MeetingIdeaVote,
  Profile,
} from '../types'

interface UpcomingDatesProps {
  profiles: Profile[]
  availability: Availability[]
  ideas: MeetingIdea[]
  votes: MeetingIdeaVote[]
}

export function UpcomingDates({
  profiles,
  availability,
  ideas,
  votes,
}: UpcomingDatesProps) {
  const dates = useMemo(
    () => findUpcomingDates(profiles, availability),
    [availability, profiles],
  )

  const profileById = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles],
  )

  const acceptedIdeasByDay = useMemo(() => {
    const upCountByIdea = new Map<string, number>()

    for (const vote of votes) {
      if (vote.vote !== 'up') continue
      upCountByIdea.set(vote.idea_id, (upCountByIdea.get(vote.idea_id) || 0) + 1)
    }

    const byDay = new Map<string, MeetingIdea[]>()

    for (const idea of ideas) {
      if (profiles.length === 0 || (upCountByIdea.get(idea.id) || 0) < 4) continue
      const list = byDay.get(idea.day) || []
      list.push(idea)
      byDay.set(idea.day, list)
    }

    return byDay
  }, [ideas, profiles.length, votes])

  return (
    <section
      className="upcoming-card"
      aria-labelledby="upcoming-dates-title"
    >
      <div className="upcoming-card-heading">
        <div>
          <p className="eyebrow">
            <CalendarCheck2 size={15} /> Najbliższy termin
          </p>

          <h1 id="upcoming-dates-title">
            Najbliższe możliwe sesje
          </h1>
        </div>
      </div>

      {dates.length === 0 ? (
        <p className="upcoming-empty">
          Nie ma jeszcze przyszłego dnia, na który odpowiedzieli wszyscy
          i nikt nie wybrał „Nie da rady”.
        </p>
      ) : (
        <div className="upcoming-table-wrap">
          <table className="upcoming-table">
            <thead>
              <tr>
                <th>Gra</th>
                <th>Termin</th>
                <th>Gracze</th>
              </tr>
            </thead>

            <tbody>
              {dates.map((date) => {
                const acceptedIdeas = acceptedIdeasByDay.get(date.day) || []

                return (
                  <tr key={date.day}>
                    <td className="upcoming-ideas-cell">
                      {acceptedIdeas.length === 0 ? (
                        <span className="upcoming-no-idea">—</span>
                      ) : (
                        <div className="upcoming-idea-list">
                          {acceptedIdeas.map((idea) => (
                            <span className="upcoming-idea-chip" key={idea.id}>
                              {idea.title}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>

                    <td>
                      <time dateTime={date.day}>
                        {longDateLabel(date.day)}
                      </time>
                    </td>

                    <td>
                      <div className="mini-names upcoming-participants">
                        <div className="mini-name-list">
                          {date.entries.map((entry) => {
                            const hasExtraInfo = Boolean(
                              entry.note?.trim(),
                            )

                            return (
                              <span
                                className={`status-pill status-${entry.status}`}
                                key={entry.user_id}
                                title={
                                  hasExtraInfo
                                    ? 'Dodano godziny lub uwagę'
                                    : undefined
                                }
                              >
                                {
                                  profileById.get(entry.user_id)
                                    ?.display_name
                                }

                                {hasExtraInfo && (
                                  <Mail
                                    className="note-indicator"
                                    size={11}
                                    aria-hidden="true"
                                  />
                                )}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
