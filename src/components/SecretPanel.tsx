import { FormEvent, useEffect, useRef, useState } from 'react'
import { LockKeyhole, X } from 'lucide-react'

interface SecretPanelProps {
  onClose: () => void
  onSecretPhrase: () => void
  onKonami: () => void
}

type ControllerKey = 'up' | 'down' | 'left' | 'right' | 'b' | 'a' | 'start'

const MOBILE_KONAMI: ControllerKey[] = [
  'up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'b', 'a', 'start',
]

const KEY_LABELS: Record<ControllerKey, string> = {
  up: 'Góra',
  down: 'Dół',
  left: 'Lewo',
  right: 'Prawo',
  b: 'B',
  a: 'A',
  start: 'Start',
}

export function SecretPanel({ onClose, onSecretPhrase, onKonami }: SecretPanelProps) {
  const [phrase, setPhrase] = useState('')
  const [phraseError, setPhraseError] = useState(false)
  const [controllerError, setControllerError] = useState(false)
  const [pressedKey, setPressedKey] = useState<ControllerKey | null>(null)
  const [showMobileController] = useState(() => {
    if (typeof window === 'undefined') return false

    return navigator.maxTouchPoints > 0
      && (window.matchMedia('(any-pointer: coarse)').matches || window.innerWidth <= 900)
  })
  const positionRef = useRef(0)
  const pressedTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
      if (pressedTimerRef.current !== null) window.clearTimeout(pressedTimerRef.current)
    }
  }, [onClose])

  const submitPhrase = (event: FormEvent) => {
    event.preventDefault()

    if (phrase === 'Ultra instynkt') {
      onClose()
      onSecretPhrase()
      return
    }

    setPhraseError(false)
    window.requestAnimationFrame(() => setPhraseError(true))
  }

  const pressControllerKey = (key: ControllerKey) => {
    if (pressedTimerRef.current !== null) window.clearTimeout(pressedTimerRef.current)
    setPressedKey(key)
    pressedTimerRef.current = window.setTimeout(() => setPressedKey(null), 150)

    const expected = MOBILE_KONAMI[positionRef.current]
    if (key === expected) {
      positionRef.current += 1

      if (positionRef.current === MOBILE_KONAMI.length) {
        positionRef.current = 0
        navigator.vibrate?.([35, 25, 60])
        onClose()
        onKonami()
      }
      return
    }

    positionRef.current = key === MOBILE_KONAMI[0] ? 1 : 0
    setControllerError(false)
    window.requestAnimationFrame(() => setControllerError(true))
  }

  return (
    <div className="dialog-backdrop secret-panel-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="secret-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="secret-panel-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="icon-button secret-panel-close" type="button" onClick={onClose} aria-label="Zamknij">
          <X size={21} />
        </button>

        <p className="eyebrow"><LockKeyhole size={15} /> Ukryte przejście</p>
        <h2 id="secret-panel-title">Sekret Son Goku</h2>

        <form className={`secret-phrase-form${phraseError ? ' invalid' : ''}`} onSubmit={submitPhrase}>
          <label>
            <span>Tajne hasło</span>
            <input
              value={phrase}
              onChange={(event) => {
                setPhrase(event.target.value)
                setPhraseError(false)
              }}
              placeholder="Wpisz hasło…"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button className="primary-button" type="submit" disabled={!phrase}>
            Otwórz
          </button>
          {phraseError && <p className="secret-error" role="status">To nie jest właściwe hasło.</p>}
        </form>

        {showMobileController && (
          <section className={`mobile-konami-section${controllerError ? ' invalid' : ''}`} aria-label="Kontroler kodu Konami">
            <p className="secret-controller-label">Kontroler</p>
            <div className="nintendo-controller">
              <img
                src={`${import.meta.env.BASE_URL}images/NintendoController.webp`}
                alt="Kontroler Nintendo"
                draggable={false}
              />

              {(Object.keys(KEY_LABELS) as ControllerKey[]).map((key) => (
                <button
                  className={`controller-hotspot controller-${key}${pressedKey === key ? ' pressed' : ''}`}
                  type="button"
                  key={key}
                  onClick={() => pressControllerKey(key)}
                  aria-label={KEY_LABELS[key]}
                />
              ))}
            </div>
          </section>
        )}
      </section>
    </div>
  )
}
