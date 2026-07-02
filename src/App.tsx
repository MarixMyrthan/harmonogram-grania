import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { CalendarDays, ChevronLeft, ChevronRight, LogOut, RefreshCw, Settings, UsersRound } from 'lucide-react'
import { AuthScreen } from './components/AuthScreen'
import { CalendarView } from './components/CalendarView'
import { DayDialog } from './components/DayDialog'
import { ProfileDialog } from './components/ProfileDialog'
import { addMonths, endOfMonth, monthLabel, startOfMonth, toDateKey } from './lib/date'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { Availability, Profile } from './types'

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

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [month, setMonth] = useState(startOfMonth(new Date()))
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [availability, setAvailability] = useState<Availability[]>([])
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newCode, setNewCode] = useState<string | null>(() => sessionStorage.getItem('new-player-code'))

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

  const loadProfiles = useCallback(async () => {
    if (!session) return
    const { data, error: queryError } = await supabase.from('profiles').select('*').order('display_name')
    if (queryError) throw queryError
    setProfiles((data || []) as Profile[])
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

  const loadAll = useCallback(async () => {
    if (!session) return
    setLoading(true)
    setError(null)
    try {
      await Promise.all([loadProfiles(), loadAvailability()])
    } catch {
      setError('Nie udało się pobrać danych. Konto mogło zostać zablokowane albo sesja wygasła.')
    } finally {
      setLoading(false)
    }
  }, [loadAvailability, loadProfiles, session])

  useEffect(() => { void loadAll() }, [loadAll])

  useEffect(() => {
    if (!session) return
    const channel = supabase
      .channel('calendar-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'availability' }, () => void loadAvailability())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => void loadProfiles())
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [loadAvailability, loadProfiles, session])

  const currentProfile = useMemo(
    () => profiles.find((profile) => profile.id === session?.user.id),
    [profiles, session?.user.id],
  )

  const selectedAvailability = useMemo(
    () => availability.filter((entry) => entry.day === selectedDay),
    [availability, selectedDay],
  )

  const saveDay = async (selected: boolean, note: string) => {
    if (!session || !selectedDay) return
    setSaving(true)
    setError(null)
    const existing = availability.find((entry) => entry.day === selectedDay && entry.user_id === session.user.id)

    const result = selected
      ? await supabase.from('availability').upsert(
          { user_id: session.user.id, day: selectedDay, note: note || null },
          { onConflict: 'user_id,day' },
        )
      : existing
        ? await supabase.from('availability').delete().eq('id', existing.id)
        : { error: null }

    setSaving(false)
    if (result.error) {
      setError('Nie udało się zapisać terminu.')
      return
    }
    await loadAvailability()
    setSelectedDay(null)
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
    <div className="app-layout">
      <header className="topbar">
        <div className="brand-inline"><CalendarDays size={25} /><span>Harmonogram grania</span></div>
        <div className="topbar-actions">
          {currentProfile && (
            <button className="profile-button" type="button" onClick={() => setProfileOpen(true)}>
              <span className="avatar small">{currentProfile.display_name.slice(0, 1).toUpperCase()}</span>
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
          <div>
            <p className="eyebrow"><UsersRound size={15} /> {profiles.length} {profiles.length === 1 ? 'osoba' : 'osób'} w ekipie</p>
            <h1>Wybierz dzień, który Ci pasuje</h1>
            <p>Kliknij datę, zaznacz swoją dostępność i opcjonalnie dopisz godziny.</p>
          </div>
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
            onSelectDay={setSelectedDay}
          />

          <div className="legend">
            <span><i className="legend-dot own-dot" /> Zaznaczony przez Ciebie</span>
            <span><i className="legend-dot everyone-dot" /> Pasuje wszystkim</span>
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
          onClose={() => setSelectedDay(null)}
          onSave={saveDay}
        />
      )}

      {profileOpen && currentProfile && (
        <ProfileDialog
          profile={currentProfile}
          onClose={() => setProfileOpen(false)}
          onProfileUpdated={loadProfiles}
        />
      )}
    </div>
  )
}
