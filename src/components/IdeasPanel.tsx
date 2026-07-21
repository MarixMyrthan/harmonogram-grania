import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Lightbulb,
  Plus,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react'
import { longDateLabel } from '../lib/date'
import { findUpcomingDates } from '../lib/upcomingDates'
import { supabase } from '../lib/supabase'
import type {
  Availability,
  MeetingIdea,
  MeetingIdeaVote,
  MeetingIdeaVoteValue,
  Profile,
} from '../types'

interface IdeasPanelProps {
  profiles: Profile[]
  availability: Availability[]
  ideas: MeetingIdea[]
  votes: MeetingIdeaVote[]
  currentUserId: string
  isAdmin: boolean
  onClose: () => void
  onDataChanged: () => Promise<void>
}

export function IdeasPanel({
  profiles,
  availability,
  ideas,
  votes,
  currentUserId,
  isAdmin,
  onClose,
  onDataChanged,
}: IdeasPanelProps) {
  const candidateDates = useMemo(
    () => findUpcomingDates(profiles, availability),
    [availability, profiles],
  )
  const [title, setTitle] = useState('')
  const [day, setDay] = useState(candidateDates[0]?.day || '')
  const [creating, setCreating] = useState(false)
  const [busyIdeaId, setBusyIdeaId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const profileById = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles],
  )
  const votesByIdea = useMemo(() => {
    const result = new Map<string, MeetingIdeaVote[]>()

    for (const vote of votes) {
      const list = result.get(vote.idea_id) || []
      list.push(vote)
      result.set(vote.idea_id, list)
    }

    return result
  }, [votes])
  const requiredUpVotes = 4

  useEffect(() => {
    if (candidateDates.some((candidate) => candidate.day === day)) return
    setDay(candidateDates[0]?.day || '')
  }, [candidateDates, day])

  const refresh = async () => {
    setRefreshing(true)
    setError(null)

    try {
      await onDataChanged()
    } catch {
      setError('Nie udało się odświeżyć propozycji gier.')
    } finally {
      setRefreshing(false)
    }
  }

  const addIdea = async (event: FormEvent) => {
    event.preventDefault()
    const normalizedTitle = title.trim()

    if (!normalizedTitle || creating) return
    if (!candidateDates.some((candidate) => candidate.day === day)) {
      setError('Wybrany termin nie jest już dostępny na liście najbliższych terminów grania.')
      return
    }

    setCreating(true)
    setError(null)

    const { error: insertError } = await supabase.from('meeting_ideas').insert({
      author_id: currentUserId,
      day,
      title: normalizedTitle,
    })

    if (insertError) {
      setError(
        insertError.code === '23505'
          ? 'Taka gra dla tego terminu już istnieje.'
          : 'Nie udało się dodać gry.',
      )
    } else {
      setTitle('')
      await onDataChanged()
    }

    setCreating(false)
  }

  const setVote = async (
    ideaId: string,
    nextVote: MeetingIdeaVoteValue,
  ) => {
    if (busyIdeaId) return
    setBusyIdeaId(ideaId)
    setError(null)

    const currentVote = (votesByIdea.get(ideaId) || []).find(
      (vote) => vote.user_id === currentUserId,
    )

    const result = currentVote?.vote === nextVote
      ? await supabase
          .from('meeting_idea_votes')
          .delete()
          .eq('idea_id', ideaId)
          .eq('user_id', currentUserId)
      : await supabase.from('meeting_idea_votes').upsert(
          {
            idea_id: ideaId,
            user_id: currentUserId,
            vote: nextVote,
          },
          { onConflict: 'idea_id,user_id' },
        )

    if (result.error) {
      setError('Nie udało się zapisać głosu.')
    } else {
      await onDataChanged()
    }

    setBusyIdeaId(null)
  }

  const deleteIdea = async (idea: MeetingIdea) => {
    if (!isAdmin || busyIdeaId) return
    if (!window.confirm(`Usunąć grę „${idea.title}”?`)) return

    setBusyIdeaId(idea.id)
    setError(null)

    const { error: deleteError } = await supabase
      .from('meeting_ideas')
      .delete()
      .eq('id', idea.id)

    if (deleteError) {
      setError('Nie udało się usunąć gry.')
    } else {
      await onDataChanged()
    }

    setBusyIdeaId(null)
  }

  return (
    <div className="dialog-backdrop ideas-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="ideas-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ideas-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="ideas-header">
          <div>
            <p className="eyebrow"><Lightbulb size={15} /> Wspólne granie</p>
            <h2 id="ideas-title">Gry – głosowanie</h2>
          </div>
          <div className="ideas-header-actions">
            <button
              className="icon-button"
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              aria-label="Odśwież gry"
              title="Odśwież gry"
            >
              <RefreshCw size={18} className={refreshing ? 'spin' : ''} />
            </button>
            <button className="icon-button" type="button" onClick={onClose} aria-label="Zamknij głosowanie">
              <X size={20} />
            </button>
          </div>
        </header>

        <form className="idea-composer" onSubmit={(event) => void addIdea(event)}>
          <label>
            <span>Proponowana gra</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value.slice(0, 100))}
              placeholder="Np. Monster Hunter, GTA V albo Genshin Impact"
              maxLength={100}
              disabled={creating || candidateDates.length === 0}
            />
            <small className="character-count">{title.length}/100</small>
          </label>

          <label>
            <span>Termin</span>
            <select
              value={day}
              onChange={(event) => setDay(event.target.value)}
              disabled={creating || candidateDates.length === 0}
            >
              {candidateDates.map((candidate) => (
                <option value={candidate.day} key={candidate.day}>
                  {longDateLabel(candidate.day)}
                </option>
              ))}
            </select>
          </label>

          {candidateDates.length === 0 && (
            <p className="form-message">
              Najpierw musi pojawić się co najmniej jeden możliwy termin grania w tabeli nad kalendarzem.
            </p>
          )}

          <button
            className="primary-button"
            type="submit"
            disabled={creating || !title.trim() || !day}
          >
            <Plus size={18} /> {creating ? 'Dodawanie…' : 'Dodaj grę'}
          </button>
        </form>

        {error && <p className="form-message" role="status">{error}</p>}

        <div className="idea-rules">
          <span><ThumbsUp size={15} /> Cztery głosy „tak” pokazują grę w tabeli.</span>
          <span><ThumbsDown size={15} /> Dwa głosy „nie” automatycznie usuwają grę.</span>
          <span>Ponowne kliknięcie aktywnego kciuka wycofuje głos.</span>
        </div>

        <div className="ideas-list" aria-live="polite">
          {ideas.length === 0 ? (
            <p className="empty-state">Brak aktywnych propozycji. Dodaj pierwszą grę.</p>
          ) : ideas.map((idea) => {
            const ideaVotes = votesByIdea.get(idea.id) || []
            const upCount = ideaVotes.filter((vote) => vote.vote === 'up').length
            const downCount = ideaVotes.filter((vote) => vote.vote === 'down').length
            const ownVote = ideaVotes.find((vote) => vote.user_id === currentUserId)?.vote
            const accepted = requiredUpVotes > 0 && upCount >= requiredUpVotes
            const busy = busyIdeaId === idea.id

            return (
              <article className={`idea-card${accepted ? ' accepted' : ''}`} key={idea.id}>
                <div className="idea-card-main">
                  <div className="idea-title-row">
                    <h3>{idea.title}</h3>
                    {accepted && <span className="idea-accepted-badge">Wybrana</span>}
                  </div>
                  <p className="idea-meta">
                    <CalendarDays size={15} /> {longDateLabel(idea.day)}
                    <span>·</span>
                    Dodał: {profileById.get(idea.author_id)?.display_name || 'Nieznany użytkownik'}
                  </p>
                </div>

                <div className="idea-actions">
                  <button
                    className={`idea-vote down${ownVote === 'down' ? ' active' : ''}`}
                    type="button"
                    onClick={() => void setVote(idea.id, 'down')}
                    disabled={busy}
                    aria-pressed={ownVote === 'down'}
                    aria-label={`Nie podoba mi się. Głosów: ${downCount}`}
                  >
                    <ThumbsDown size={19} /> <span>{downCount}</span>
                  </button>

                  <button
                    className={`idea-vote up${ownVote === 'up' ? ' active' : ''}`}
                    type="button"
                    onClick={() => void setVote(idea.id, 'up')}
                    disabled={busy}
                    aria-pressed={ownVote === 'up'}
                    aria-label={`Podoba mi się. Głosów: ${upCount}`}
                  >
                    <ThumbsUp size={19} /> <span>{upCount}/{requiredUpVotes}</span>
                  </button>

                  {isAdmin && (
                    <button
                      className="idea-delete"
                      type="button"
                      onClick={() => void deleteIdea(idea)}
                      disabled={busy}
                      aria-label={`Usuń grę ${idea.title}`}
                      title="Usuń grę jako administrator"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}
