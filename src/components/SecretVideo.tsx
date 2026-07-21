import { useEffect, useRef } from 'react'

interface SecretVideoProps {
  active: boolean
  onFinish: () => void
}

export function SecretVideo({ active, onFinish }: SecretVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (!active) return

    const video = videoRef.current
    if (!video) return

    video.currentTime = 0

    void video.play().catch((error) => {
      console.error('Nie udało się uruchomić filmu SonGoku.mp4:', error)
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onFinish()
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      video.pause()
      video.currentTime = 0
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [active, onFinish])

  if (!active) return null

  return (
    <div
      className="secret-video-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Ukryte wideo"
      onClick={onFinish}
    >
      <video
        ref={videoRef}
        className="secret-video-player"
        src={`${import.meta.env.BASE_URL}video/SonGoku.mp4`}
        autoPlay
        playsInline
        preload="auto"
        onEnded={onFinish}
        onClick={(event) => event.stopPropagation()}
        onError={() => {
          console.error('Nie udało się załadować filmu SonGoku.mp4')
          onFinish()
        }}
      />

      <button
        className="secret-video-close"
        type="button"
        onClick={onFinish}
        aria-label="Zamknij film"
      >
        ×
      </button>
    </div>
  )
}
