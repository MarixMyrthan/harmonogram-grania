import { FormEvent, useState } from 'react'
import { CalendarDays, KeyRound, LogIn, UserPlus } from 'lucide-react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { isValidPin, normalizePin, normalizePlayerCode, playerCodeToEmail } from '../lib/auth'
import { supabase } from '../lib/supabase'

type Mode = 'login' | 'activate'

interface ActivationResponse {
  playerCode?: string
  error?: string
}

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login')
  const [playerCode, setPlayerCode] = useState('')
  const [activationCode, setActivationCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const switchMode = (next: Mode) => {
    setMode(next)
    setMessage(null)
    setPin('')
    setConfirmPin('')
  }

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault()
    setMessage(null)

    const normalizedCode = normalizePlayerCode(playerCode)
    if (!normalizedCode || !isValidPin(pin)) {
      setMessage('Wpisz kod gracza i 6-cyfrowy PIN.')
      return
    }

    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: playerCodeToEmail(normalizedCode),
      password: pin,
    })
    setBusy(false)

    if (error) setMessage('Nieprawidłowy kod gracza lub PIN.')
  }

  const handleActivation = async (event: FormEvent) => {
    event.preventDefault()
    setMessage(null)

    if (!activationCode.trim() || displayName.trim().length < 2) {
      setMessage('Wpisz kod aktywacyjny i nazwę wyświetlaną.')
      return
    }
    if (!isValidPin(pin)) {
      setMessage('PIN musi składać się dokładnie z 6 cyfr.')
      return
    }
    if (pin !== confirmPin) {
      setMessage('Wpisane PIN-y nie są takie same.')
      return
    }

    setBusy(true)
    const { data, error } = await supabase.functions.invoke<ActivationResponse>('activate-player', {
      body: {
        activationCode: activationCode.trim().toUpperCase(),
        displayName: displayName.trim(),
        pin,
      },
    })

    if (error || !data?.playerCode) {
      let errorMessage = data?.error

    if (error instanceof FunctionsHttpError) {
      try {
      const payload = await error.context.json() as ActivationResponse
      errorMessage = payload.error
    } catch {
      // Jeżeli odpowiedź nie zawiera JSON, pokażemy komunikat ogólny.
    }
  }

  console.error('Activation error:', error)
  setBusy(false)
  setMessage(errorMessage || 'Nie udało się aktywować konta. Sprawdź kod i spróbuj ponownie.')
  return
}

    sessionStorage.setItem('new-player-code', data.playerCode)
    const signInResult = await supabase.auth.signInWithPassword({
      email: playerCodeToEmail(data.playerCode),
      password: pin,
    })
    setBusy(false)

    if (signInResult.error) {
      setMode('login')
      setPlayerCode(data.playerCode)
      setMessage(`Konto utworzone. Twój kod gracza to ${data.playerCode}. Zaloguj się ustawionym PIN-em.`)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="brand-icon"><CalendarDays size={32} /></div>
        <h1 id="auth-title">Harmonogram grania</h1>
        <p className="auth-lead">Zaznacz dni, które Ci pasują, i zobacz dostępność całej ekipy.</p>

        <div className="segmented" role="tablist" aria-label="Rodzaj logowania">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>
            <LogIn size={17} /> Logowanie
          </button>
          <button type="button" className={mode === 'activate' ? 'active' : ''} onClick={() => switchMode('activate')}>
            <UserPlus size={17} /> Pierwsze wejście
          </button>
        </div>

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="form-stack">
            <label>
              Kod gracza
              <input
                value={playerCode}
                onChange={(event) => setPlayerCode(event.target.value.toUpperCase())}
                placeholder="np. GRACZ-1A2B3C4D"
                autoComplete="username"
                spellCheck={false}
              />
            </label>
            <label>
              PIN
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={pin}
                onChange={(event) => setPin(normalizePin(event.target.value))}
                placeholder="6 cyfr"
                autoComplete="current-password"
              />
            </label>
            {message && <p className="form-message" role="alert">{message}</p>}
            <button className="primary-button" disabled={busy}>
              <KeyRound size={18} /> {busy ? 'Logowanie…' : 'Zaloguj się'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleActivation} className="form-stack">
            <label>
              Jednorazowy kod aktywacyjny
              <input
                value={activationCode}
                onChange={(event) => setActivationCode(event.target.value.toUpperCase())}
                placeholder="AKTYWUJ-…"
                autoComplete="one-time-code"
                spellCheck={false}
              />
            </label>
            <label>
              Twoja nazwa
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="np. Patyl"
                maxLength={40}
                autoComplete="nickname"
              />
            </label>
            <label>
              Ustaw PIN
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={pin}
                onChange={(event) => setPin(normalizePin(event.target.value))}
                placeholder="6 cyfr"
                autoComplete="new-password"
              />
            </label>
            <label>
              Powtórz PIN
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={confirmPin}
                onChange={(event) => setConfirmPin(normalizePin(event.target.value))}
                placeholder="6 cyfr"
                autoComplete="new-password"
              />
            </label>
            {message && <p className="form-message" role="alert">{message}</p>}
            <button className="primary-button" disabled={busy}>
              <UserPlus size={18} /> {busy ? 'Aktywowanie…' : 'Aktywuj konto'}
            </button>
          </form>
        )}
      </section>
    </main>
  )
}
