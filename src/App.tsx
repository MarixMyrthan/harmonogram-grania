import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { CalendarDays, ChevronLeft, ChevronRight, Lightbulb, LogOut, MessageCircle, RefreshCw, Settings, ShieldCheck, UsersRound } from 'lucide-react'
import { AdminPanel } from './components/AdminPanel'
import { AuthScreen } from './components/AuthScreen'
import { Avatar } from './components/Avatar'
import { CalendarView } from './components/CalendarView'
import { ChatPanel } from './components/ChatPanel'
import { DayDialog } from './components/DayDialog'
import { IdeasPanel } from './components/IdeasPanel'
import { SecretPanel } from './components/SecretPanel'
import { SecretVideo } from './components/SecretVideo'
import { SonGokuTrigger } from './components/SonGokuTrigger'
import { ProfileDialog } from './components/ProfileDialog'
import { UpcomingDates } from './components/UpcomingDates'
import { addMonths, endOfMonth, longDateLabel, monthLabel, startOfMonth, toDateKey } from './lib/date'
import { detectClientInfo } from './lib/clientInfo'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { Availability, AvailabilityStatus, MeetingEvent, MeetingIdea, MeetingIdeaVote, Profile } from './types'

type TrackName = 'jackpot' | 'mario'

interface BlockedTrack {
  track: TrackName
  day?: string
}

function SetupError() {
  return (
    <main className="center-page">
      <section className="status-card">
        <CalendarDays size={36} />
        <h1>Brakuje konfiguracji Supabase</h1>
        <p>Skopiuj plik <code>.env.example</code> jako <code>.env</code> i uzupełnij adres projektu oraz klucz publishable.</p>
      </section>
    </main>
  )
}

function LoadingScreen() {
  return <main className="center-page"><RefreshCw className="spin" size={32} /><p>Ładowanie kalendarza…</p></main>
}

function AccessDenied() {
  return (
    <main className="center-page">
      <section className="status-card">
        <UsersRound size={36} />
        <h1>Brak dostępu do kalendarza</h1>
        <p>Konto jest nieaktywne albo nie ma przypisanego profilu. Skontaktuj się z administratorem grupy.</p>
        <button className="secondary-button" type="button" onClick={() => void supabase.auth.signOut()}>
          <LogOut size={18} /> Wyloguj się
        </button>
      </section>
    </main>
  )
}

async function attachAvatarUrls(rawProfiles: Profile[]): Promise<Profile[]> {
  return Promise.all(rawProfiles.map(async (profile) => {
    if (!profile.avatar_path) return { ...profile, colorblind_mode: Boolean(profile.colorblind_mode), avatar_url: null }

    const { data, error } = await supabase.storage
      .from('avatars')
      .createSignedUrl(profile.avatar_path, 60 * 60)

    return {
      ...profile,
      colorblind_mode: Boolean(profile.colorblind_mode),
      avatar_url: error ? null : data.signedUrl,
    }
  }))
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [month, setMonth] = useState(startOfMonth(new Date()))
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [availability, setAvailability] = useState<Availability[]>([])
  const [upcomingAvailability, setUpcomingAvailability] = useState<Availability[]>([])
  const [meetingIdeas, setMeetingIdeas] = useState<MeetingIdea[]>([])
  const [ideaVotes, setIdeaVotes] = useState<MeetingIdeaVote[]>([])
  const [protectedDays, setProtectedDays] = useState<string[]>([])
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [ideasOpen, setIdeasOpen] = useState(false)
  const [secretPanelOpen, setSecretPanelOpen] = useState(false)
  const [secretVideoActive, setSecretVideoActive] = useState(false)
  const [secretImageActive, setSecretImageActive] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [protectionBusy, setProtectionBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [blockedTrack, setBlockedTrack] = useState<BlockedTrack | null>(null)
  const [newCode, setNewCode] = useState<string | null>(() => sessionStorage.getItem('new-player-code'))
  const jackpotAudioRef = useRef<HTMLAudioElement | null>(null)
  const marioAudioRef = useRef<HTMLAudioElement | null>(null)
  const gokuAudioRef = useRef<HTMLAudioElement | null>(null)
  const rzydAudioRef = useRef<HTMLAudioElement | null>(null)
  const noticeTimerRef = useRef<number | null>(null)
  const playedEventsRef = useRef(new Set<string>())

  const showNotice = useCallback((message: string, duration = 5000) => {
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
    setNotice(message)
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null)
      setBlockedTrack(null)
    }, duration)
  }, [])

  const finishSecretVideo = useCallback(() => setSecretVideoActive(false), [])
  const closeSecretImage = useCallback(() => {
    const audio = gokuAudioRef.current

    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }

    setSecretImageActive(false)
  }, [])

  const triggerSecretPhrase = useCallback(() => {
    const audio = gokuAudioRef.current
    if (!audio) return

    audio.pause()
    audio.currentTime = 0
    audio.loop = false

    setSecretImageActive(true)

    audio.onended = () => {
      setSecretImageActive(false)
    }

    void audio.play().catch((error) => {
      console.error('Nie udało się odtworzyć SonGoku.mp3:', error)
      setSecretImageActive(false)
    })
  }, [])

  const triggerAudioSecret = useCallback(() => {
    const audio = rzydAudioRef.current
    if (!audio) return

    audio.pause()
    audio.currentTime = 0
    audio.loop = false

    void audio.play().catch((error) => {
      console.error('Nie udało się odtworzyć rzyd.mp3:', error)
    })
  }, [])

  useEffect(() => {
    if (!secretImageActive) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSecretImage()
      }
    }

    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [closeSecretImage, secretImageActive])

  useEffect(() => () => {
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthReady(true)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession) setNewCode(sessionStorage.getItem('new-player-code'))
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    jackpotAudioRef.current = new Audio(`${base}audio/JACKPOT.mp3`)
    marioAudioRef.current = new Audio(`${base}audio/Mario.mp3`)
    gokuAudioRef.current = new Audio(`${import.meta.env.BASE_URL}audio/SonGoku.mp3`)
    rzydAudioRef.current = new Audio(`${base}audio/rzyd.mp3`)

    for (const audio of [jackpotAudioRef.current, marioAudioRef.current, gokuAudioRef.current, rzydAudioRef.current]) {
      audio.preload = 'auto'
      audio.loop = false
    }

    const unlock = () => {
      window.removeEventListener('pointerdown', unlock, true)
      window.removeEventListener('keydown', unlock, true)

      const attempts = [jackpotAudioRef.current, marioAudioRef.current, gokuAudioRef.current, rzydAudioRef.current]
        .filter((audio): audio is HTMLAudioElement => Boolean(audio))
        .map(async (audio) => {
          const previousVolume = audio.volume
          audio.volume = 0
          try {
            // Oba play() są wywoływane podczas tej samej interakcji użytkownika.
            await audio.play()
          } catch {
            // Część przeglądarek odblokuje dźwięk dopiero przy właściwym odtworzeniu.
          } finally {
            audio.pause()
            audio.currentTime = 0
            audio.volume = previousVolume
          }
        })

      void Promise.allSettled(attempts)
    }

    window.addEventListener('pointerdown', unlock, true)
    window.addEventListener('keydown', unlock, true)

    return () => {
      window.removeEventListener('pointerdown', unlock, true)
      window.removeEventListener('keydown', unlock, true)
      jackpotAudioRef.current?.pause()
      marioAudioRef.current?.pause()
      gokuAudioRef.current?.pause()
      rzydAudioRef.current?.pause()
    }
  }, [])

  const playTrack = useCallback(async (track: TrackName, day?: string) => {
    const audio = track === 'jackpot' ? jackpotAudioRef.current : marioAudioRef.current
    if (!audio) return

    audio.pause()
    audio.currentTime = 0
    audio.loop = false

    try {
      await audio.play()
      setBlockedTrack(null)
      showNotice(
        track === 'jackpot'
          ? `🎉 JACKPOT! Wszyscy mogą grać w terminie${day ? `: ${longDateLabel(day)}` : ''}.`
          : '[contra]Konami code został wpisany poprawnie.',
        track === 'jackpot' ? 14_000 : 6000,
      )
    } catch {
      setBlockedTrack({ track, day })
      showNotice('Przeglądarka zablokowała automatyczne odtworzenie. Kliknij „Odtwórz”.', 12_000)
    }
  }, [showNotice])

  useEffect(() => {
    const sequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']
    let position = 0

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return

      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
      if (key === sequence[position]) {
        position += 1
        if (position === sequence.length) {
          position = 0
          void playTrack('mario')
        }
      } else {
        position = key === sequence[0] ? 1 : 0
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [playTrack])
  useEffect(() => {
    const praisePhrase = 'Ultra instynkt'
    let position = 0

    const handlePraiseKeys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null

      if (
        target?.matches(
          'input, textarea, select, [contenteditable="true"]',
        )
      ) {
        return
      }

      if (event.key.length !== 1) return

      if (event.key === praisePhrase[position]) {
        position += 1

        if (position === praisePhrase.length) {
          position = 0
          triggerSecretPhrase()
        }

        return
      }

      position = event.key === praisePhrase[0] ? 1 : 0
    }

    window.addEventListener('keydown', handlePraiseKeys)

    return () => {
      window.removeEventListener('keydown', handlePraiseKeys)
    }
  }, [triggerSecretPhrase])


  useEffect(() => {
    const audioPhrase = 'żyd'
    let position = 0

    const handleAudioSecretKeys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null

      if (
        target?.matches(
          'input, textarea, select, [contenteditable="true"]',
        )
      ) {
        return
      }

      if (event.key.length !== 1) return

      const key = event.key.toLocaleLowerCase('pl-PL')

      if (key === audioPhrase[position]) {
        position += 1

        if (position === audioPhrase.length) {
          position = 0
          triggerAudioSecret()
        }

        return
      }

      position = key === audioPhrase[0] ? 1 : 0
    }

    window.addEventListener('keydown', handleAudioSecretKeys)

    return () => {
      window.removeEventListener('keydown', handleAudioSecretKeys)
    }
  }, [triggerAudioSecret])

  const loadProfiles = useCallback(async () => {
    if (!session) return
    const { data, error: queryError } = await supabase.from('profiles').select('*').eq('is_active', true).order('display_name')
    if (queryError) throw queryError
    const resolved = await attachAvatarUrls((data || []) as Profile[])
    setProfiles(resolved)
  }, [session])

  const loadAvailability = useCallback(async () => {
    if (!session) return
    const from = toDateKey(startOfMonth(month))
    const to = toDateKey(endOfMonth(month))
    const { data, error: queryError } = await supabase
      .from('availability')
      .select('*')
      .gte('day', from)
      .lte('day', to)
      .order('day')
    if (queryError) throw queryError
    setAvailability((data || []) as Availability[])
  }, [month, session])

  const loadUpcomingAvailability = useCallback(async () => {
    if (!session) return
    const today = new Date()
    const { data, error: queryError } = await supabase
      .from('availability')
      .select('*')
      .gte('day', toDateKey(today))
      .order('day')

    if (queryError) throw queryError
    setUpcomingAvailability((data || []) as Availability[])
  }, [session])


  const loadIdeas = useCallback(async () => {
    if (!session) return

    const { data: ideasData, error: ideasError } = await supabase
      .from('meeting_ideas')
      .select('*')
      .gte('day', toDateKey(new Date()))
      .order('day')
      .order('created_at')

    if (ideasError) throw ideasError

    const resolvedIdeas = (ideasData || []) as MeetingIdea[]
    setMeetingIdeas(resolvedIdeas)

    if (resolvedIdeas.length === 0) {
      setIdeaVotes([])
      return
    }

    const { data: votesData, error: votesError } = await supabase
      .from('meeting_idea_votes')
      .select('*')
      .in('idea_id', resolvedIdeas.map((idea) => idea.id))

    if (votesError) throw votesError
    setIdeaVotes((votesData || []) as MeetingIdeaVote[])
  }, [session])

  const loadProtectedDays = useCallback(async () => {
    if (!session) return

    const { data, error: protectedDaysError } = await supabase.functions.invoke('admin-control', {
      body: { action: 'protected-days' },
    })

    if (protectedDaysError) {
      console.warn('Nie udało się pobrać chronionych terminów.', protectedDaysError)
      return
    }

    setProtectedDays(Array.isArray(data?.days) ? data.days.map(String) : [])
  }, [session])

  const loadAll = useCallback(async () => {
    if (!session) return
    setLoading(true)
    setError(null)
    try {
      await Promise.all([loadProfiles(), loadAvailability(), loadUpcomingAvailability(), loadIdeas()])
    } catch {
      setError('Nie udało się pobrać danych. Konto mogło zostać zablokowane albo sesja wygasła.')
    } finally {
      setLoading(false)
    }
  }, [loadAvailability, loadIdeas, loadProfiles, loadUpcomingAvailability, session])

  useEffect(() => { void loadAll() }, [loadAll])

  useEffect(() => {
    if (!session) return
    const channel = supabase
      .channel('meeting-calendar-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'availability' }, () => {
        void Promise.all([loadAvailability(), loadUpcomingAvailability()])
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => void loadProfiles())
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [loadAvailability, loadProfiles, loadUpcomingAvailability, session])


  useEffect(() => {
    if (!session) return

    const channel = supabase
      .channel('meeting-ideas-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_ideas' }, () => void loadIdeas())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_idea_votes' }, () => void loadIdeas())
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [loadIdeas, session])

  useEffect(() => {
    if (!session) return
    const channel = supabase
      .channel('meeting-jackpot-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'meeting_events' }, (payload) => {
        const event = payload.new as MeetingEvent
        if (event.event_type !== 'jackpot' || playedEventsRef.current.has(event.id)) return
        playedEventsRef.current.add(event.id)
        void playTrack('jackpot', event.day)
      })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [playTrack, session])

  useEffect(() => {
    if (!session) {
      setIsAdmin(false)
      setProtectedDays([])
      return
    }

    supabase.functions.invoke('admin-control', { body: { action: 'status' } })
      .then(({ data, error }) => {
        const admin = !error && Boolean(data?.isAdmin)
        setIsAdmin(admin)
        if (admin) void loadProtectedDays()
      })
      .catch(() => setIsAdmin(false))
  }, [loadProtectedDays, session])

  useEffect(() => {
    if (!session) return

    supabase.functions.invoke('admin-control', { body: { action: 'maintenance' } })
      .then(({ error: maintenanceError }) => {
        if (maintenanceError) console.warn('Nie udało się uruchomić porządków danych.', maintenanceError)
      })
      .catch((maintenanceError) => {
        console.warn('Nie udało się uruchomić porządków danych.', maintenanceError)
      })
  }, [session])

  useEffect(() => {
    if (!session) return

    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
    if (isLocal) return

    const clientInfoPromise = detectClientInfo()

    const touch = async () => {
      if (document.visibilityState !== 'visible') return

      const clientInfo = await clientInfoPromise
      const { error: touchError } = await supabase.functions.invoke('admin-control', {
        body: { action: 'touch', ...clientInfo },
      })

      if (touchError) console.warn('Nie udało się zapisać aktywności użytkownika.', touchError)
    }

    void touch()
    const timer = window.setInterval(() => void touch(), 45_000)
    const onVisibility = () => void touch()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onVisibility)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onVisibility)
    }
  }, [session])

  const currentProfile = useMemo(
    () => profiles.find((profile) => profile.id === session?.user.id),
    [profiles, session?.user.id],
  )

  const selectedAvailability = useMemo(
    () => availability.filter((entry) => entry.day === selectedDay),
    [availability, selectedDay],
  )

  const saveDay = async (status: AvailabilityStatus | null, note: string) => {
    if (!session || !selectedDay) return
    setSaving(true)
    setError(null)
    const existing = availability.find((entry) => entry.day === selectedDay && entry.user_id === session.user.id)

    const result = status
      ? await supabase.from('availability').upsert(
          {
            user_id: session.user.id,
            day: selectedDay,
            status,
            note: note || null,
          },
          { onConflict: 'user_id,day' },
        )
      : existing
        ? await supabase.from('availability').delete().eq('id', existing.id)
        : { error: null }

    setSaving(false)
    if (result.error) {
      setError('Nie udało się zapisać odpowiedzi.')
      return
    }
    await Promise.all([loadAvailability(), loadUpcomingAvailability()])
    setSelectedDay(null)
  }

  const toggleDayProtection = async (day: string, protectedFromCleanup: boolean) => {
    if (!isAdmin || protectionBusy) return

    setProtectionBusy(true)
    setError(null)

    const { error: protectionError } = await supabase.functions.invoke('admin-control', {
      body: {
        action: 'set-day-protection',
        day,
        protected: protectedFromCleanup,
      },
    })

    setProtectionBusy(false)

    if (protectionError) {
      setError('Nie udało się zmienić ochrony terminu przed automatycznym usunięciem.')
      return
    }

    setProtectedDays((current) => protectedFromCleanup
      ? [...new Set([...current, day])]
      : current.filter((item) => item !== day))
  }

  const dismissNewCode = () => {
    sessionStorage.removeItem('new-player-code')
    setNewCode(null)
  }

  if (!isSupabaseConfigured) return <SetupError />
  if (!authReady) return <LoadingScreen />
  if (!session) return <AuthScreen />
  if (loading && profiles.length === 0) return <LoadingScreen />
  if (!loading && !error && profiles.length === 0) return <AccessDenied />

  return (
    <div className={`app-layout${currentProfile?.colorblind_mode ? ' colorblind-mode' : ''}`}>
      <header className="topbar">
        <div className="brand-and-chat">
          <div className="brand-inline">
            <SonGokuTrigger
              onActivate={() => setSecretVideoActive(true)}
              onLongPress={() => setSecretPanelOpen(true)}
            />
            <span>Harmonogram grania</span>
          </div>
          <button className="chat-trigger" type="button" onClick={() => setChatOpen(true)}>
            <MessageCircle size={18} /><span>Czat</span>
          </button>
          <button className="ideas-trigger" type="button" onClick={() => setIdeasOpen(true)}>
            <Lightbulb size={18} /><span>Gry – głosowanie</span>
          </button>
        </div>
        <div className="topbar-actions">
          {isAdmin && (
            <button className="secondary-button compact admin-trigger" type="button" onClick={() => setAdminOpen(true)}>
              <ShieldCheck size={17} /><span>Administracja</span>
            </button>
          )}
          {currentProfile && (
            <button className="profile-button" type="button" onClick={() => setProfileOpen(true)}>
              <Avatar profile={currentProfile} size="small" />
              <span>{currentProfile.display_name}</span>
              <Settings size={17} />
            </button>
          )}
          <button className="icon-button" type="button" onClick={() => void supabase.auth.signOut()} aria-label="Wyloguj" title="Wyloguj"><LogOut size={20} /></button>
        </div>
      </header>

      <main className="main-content">
        {newCode && (
          <aside className="welcome-banner">
            <div>
              <strong>Konto aktywowane!</strong>
              <span>Zapisz swój kod gracza: <b>{newCode}</b></span>
            </div>
            <button type="button" onClick={dismissNewCode}>Zapisałem</button>
          </aside>
        )}

        <section className="page-heading">
          <UpcomingDates
            profiles={profiles}
            availability={upcomingAvailability}
            ideas={meetingIdeas}
            votes={ideaVotes}
          />
          <button className="secondary-button" type="button" onClick={() => void loadAll()} disabled={loading}>
            <RefreshCw size={17} className={loading ? 'spin' : ''} /> Odśwież
          </button>
        </section>

        {error && <div className="error-banner" role="alert">{error}</div>}

        <section className="calendar-card">
          <div className="calendar-toolbar">
            <button className="icon-button" type="button" onClick={() => setMonth((current) => addMonths(current, -1))} aria-label="Poprzedni miesiąc"><ChevronLeft /></button>
            <div>
              <h2>{monthLabel(month)}</h2>
              <button className="text-button" type="button" onClick={() => setMonth(startOfMonth(new Date()))}>Przejdź do bieżącego miesiąca</button>
            </div>
            <button className="icon-button" type="button" onClick={() => setMonth((current) => addMonths(current, 1))} aria-label="Następny miesiąc"><ChevronRight /></button>
          </div>

          <CalendarView
            month={month}
            profiles={profiles}
            availability={availability}
            currentUserId={session.user.id}
            protectedDays={protectedDays}
            showProtectionMarks={isAdmin}
            onSelectDay={setSelectedDay}
          />

          <div className="legend">
            <span><i className="legend-dot partial-dot" /> Częściowa dostępność</span>
            <span><i className="legend-dot everyone-dot" /> Wszystkim pasuje</span>
            <span><i className="legend-dot unsure-dot" /> Ktoś jeszcze nie wie</span>
            <span><i className="legend-dot unavailable-dot" /> Ktoś nie da rady</span>
          </div>
        </section>
      </main>

      {selectedDay && (
        <DayDialog
          day={selectedDay}
          profiles={profiles}
          availability={selectedAvailability}
          currentUserId={session.user.id}
          busy={saving}
          isAdmin={isAdmin}
          protectedFromCleanup={protectedDays.includes(selectedDay)}
          protectionBusy={protectionBusy}
          onClose={() => setSelectedDay(null)}
          onSave={saveDay}
          onToggleProtection={(protectedFromCleanup) => void toggleDayProtection(selectedDay, protectedFromCleanup)}
        />
      )}

      {profileOpen && currentProfile && (
        <ProfileDialog
          profile={currentProfile}
          onClose={() => setProfileOpen(false)}
          onProfileUpdated={loadProfiles}
        />
      )}

      {adminOpen && isAdmin && session && (
        <AdminPanel
          currentUserId={session.user.id}
          onClose={() => setAdminOpen(false)}
          onUsersChanged={loadProfiles}
        />
      )}

      {chatOpen && (
        <ChatPanel
          profiles={profiles}
          currentUserId={session.user.id}
          onClose={() => setChatOpen(false)}
        />
      )}


      {ideasOpen && (
        <IdeasPanel
          profiles={profiles}
          availability={upcomingAvailability}
          ideas={meetingIdeas}
          votes={ideaVotes}
          currentUserId={session.user.id}
          isAdmin={isAdmin}
          onClose={() => setIdeasOpen(false)}
          onDataChanged={loadIdeas}
        />
      )}

      {secretPanelOpen && (
        <SecretPanel
          onClose={() => setSecretPanelOpen(false)}
          onSecretPhrase={triggerSecretPhrase}
          onAudioSecret={triggerAudioSecret}
          onKonami={() => void playTrack('mario')}
        />
      )}

      <SecretVideo active={secretVideoActive} onFinish={finishSecretVideo} />

      {secretImageActive && (
        <div
          className="secret-image-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Ultra instynkt"
          onClick={closeSecretImage}
        >
          <img
            className="secret-image"
            src={`${import.meta.env.BASE_URL}images/SonGoku.jpg`}
            alt="Ultra instynkt"
            onClick={(event) => event.stopPropagation()}
            onError={closeSecretImage}
          />

          <button
            className="secret-image-close"
            type="button"
            onClick={closeSecretImage}
            aria-label="Zamknij obraz"
          >
            ×
          </button>
        </div>
      )}
      {notice && (
        <aside className="audio-notice" role="status">
          <span className="audio-notice-message">
            {notice.startsWith('[contra]') && (
              <img
                className="contra-code-icon"
                src={`${import.meta.env.BASE_URL}icons/ContraC.png`}
                alt="C"
              />
            )}
            {notice.replace('[contra]', '')}
          </span>
          {blockedTrack && (
            <button type="button" onClick={() => void playTrack(blockedTrack.track, blockedTrack.day)}>Odtwórz</button>
          )}
        </aside>
      )}
    </div>
  )
}
