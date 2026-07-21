import { useCallback, useEffect, useRef, useState } from 'react'

interface SonGokuTriggerProps {
  onActivate: () => void
  onLongPress: () => void
}

const HOLD_TIME_MS = 5000
const MOVE_TOLERANCE_PX = 14

export function SonGokuTrigger({ onActivate, onLongPress }: SonGokuTriggerProps) {
  const [holding, setHolding] = useState(false)
  const timerRef = useRef<number | null>(null)
  const longPressFiredRef = useRef(false)
  const canceledRef = useRef(false)
  const suppressClickRef = useRef(false)
  const pointerIdRef = useRef<number | null>(null)
  const startPointRef = useRef<{ x: number; y: number } | null>(null)

  const clearHold = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }

    setHolding(false)
    startPointRef.current = null
  }, [])

  useEffect(() => clearHold, [clearHold])

  const startHold = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || timerRef.current !== null) return

    pointerIdRef.current = event.pointerId
    startPointRef.current = { x: event.clientX, y: event.clientY }
    longPressFiredRef.current = false
    canceledRef.current = false
    suppressClickRef.current = false
    setHolding(true)

    event.currentTarget.setPointerCapture(event.pointerId)

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      longPressFiredRef.current = true
      suppressClickRef.current = true
      setHolding(false)
      navigator.vibrate?.(35)
      onLongPress()
    }, HOLD_TIME_MS)
  }

  const moveHold = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== event.pointerId || timerRef.current === null) return

    const startPoint = startPointRef.current
    if (!startPoint) return

    const movedX = event.clientX - startPoint.x
    const movedY = event.clientY - startPoint.y

    if (Math.hypot(movedX, movedY) > MOVE_TOLERANCE_PX) {
      canceledRef.current = true
      suppressClickRef.current = true
      clearHold()
    }
  }

  const finishHold = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== event.pointerId) return

    const fired = longPressFiredRef.current
    const canceled = canceledRef.current

    clearHold()
    pointerIdRef.current = null

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (fired || canceled) suppressClickRef.current = true
  }

  const cancelHold = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== event.pointerId) return

    canceledRef.current = true
    suppressClickRef.current = true
    clearHold()
    pointerIdRef.current = null
  }

  const activateFromClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      event.preventDefault()
      return
    }

    onActivate()
  }

  return (
    <button
      className={`goku-secret-trigger${holding ? ' holding' : ''}`}
      type="button"
      aria-label="Logo Harmonogramu grania"
      onPointerDown={startHold}
      onPointerMove={moveHold}
      onPointerUp={finishHold}
      onPointerCancel={cancelHold}
      onLostPointerCapture={cancelHold}
      onContextMenu={(event) => event.preventDefault()}
      onClick={activateFromClick}
    >
      <img
        className="goku-secret-icon"
        src={`${import.meta.env.BASE_URL}icons/SonGoku.gif`}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <svg className="goku-hold-ring" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="18" pathLength="100" />
      </svg>
    </button>
  )
}
