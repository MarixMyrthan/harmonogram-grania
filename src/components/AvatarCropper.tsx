import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { Move, RotateCcw, ZoomIn } from 'lucide-react'

const CROP_SIZE = 280
const OUTPUT_SIZE = 512
const MIN_ZOOM = 1
const MAX_ZOOM = 3

type Point = { x: number; y: number }
type ImageSize = { width: number; height: number }

export interface AvatarCropperHandle {
  crop: () => Promise<File>
}

interface AvatarCropperProps {
  src: string
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getMetrics(imageSize: ImageSize, zoom: number) {
  const baseScale = Math.max(CROP_SIZE / imageSize.width, CROP_SIZE / imageSize.height)
  const scale = baseScale * zoom
  const width = imageSize.width * scale
  const height = imageSize.height * scale

  return {
    scale,
    width,
    height,
    maxX: Math.max(0, (width - CROP_SIZE) / 2),
    maxY: Math.max(0, (height - CROP_SIZE) / 2),
  }
}

function clampOffset(offset: Point, imageSize: ImageSize | null, zoom: number): Point {
  if (!imageSize) return { x: 0, y: 0 }
  const { maxX, maxY } = getMetrics(imageSize, zoom)
  return {
    x: clamp(offset.x, -maxX, maxX),
    y: clamp(offset.y, -maxY, maxY),
  }
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image()
  image.decoding = 'async'
  image.src = src

  if (image.decode) {
    await image.decode()
    return image
  }

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('Nie udało się odczytać zdjęcia.'))
  })
  return image
}

async function canvasToAvatarFile(canvas: HTMLCanvasElement): Promise<File> {
  const createBlob = (type: string, quality?: number) => new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, quality)
  })

  const webp = await createBlob('image/webp', 0.9)
  if (webp) return new File([webp], `avatar-${Date.now()}.webp`, { type: 'image/webp' })

  const png = await createBlob('image/png')
  if (!png) throw new Error('Nie udało się przygotować avatara.')
  return new File([png], `avatar-${Date.now()}.png`, { type: 'image/png' })
}

export const AvatarCropper = forwardRef<AvatarCropperHandle, AvatarCropperProps>(function AvatarCropper({ src }, ref) {
  const [imageSize, setImageSize] = useState<ImageSize | null>(null)
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null)

  useEffect(() => {
    setImageSize(null)
    setZoom(MIN_ZOOM)
    setOffset({ x: 0, y: 0 })
  }, [src])

  const metrics = useMemo(
    () => imageSize ? getMetrics(imageSize, zoom) : null,
    [imageSize, zoom],
  )

  const resetPosition = () => {
    setZoom(MIN_ZOOM)
    setOffset({ x: 0, y: 0 })
  }

  const changeZoom = (nextZoom: number) => {
    const normalized = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM)
    setZoom(normalized)
    setOffset((current) => clampOffset(current, imageSize, normalized))
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()

    const deltaX = event.clientX - drag.x
    const deltaY = event.clientY - drag.y
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    setOffset((current) => clampOffset({ x: current.x + deltaX, y: current.y + deltaY }, imageSize, zoom))
  }

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    changeZoom(zoom + (event.deltaY < 0 ? 0.1 : -0.1))
  }

  useImperativeHandle(ref, () => ({
    crop: async () => {
      if (!imageSize || !metrics) throw new Error('Zdjęcie nie jest jeszcze gotowe.')
      const image = await loadImage(src)
      const left = CROP_SIZE / 2 - metrics.width / 2 + offset.x
      const top = CROP_SIZE / 2 - metrics.height / 2 + offset.y
      const sourceX = -left / metrics.scale
      const sourceY = -top / metrics.scale
      const sourceSize = CROP_SIZE / metrics.scale

      const canvas = document.createElement('canvas')
      canvas.width = OUTPUT_SIZE
      canvas.height = OUTPUT_SIZE
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Przeglądarka nie obsługuje edycji obrazu.')

      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        0,
        0,
        OUTPUT_SIZE,
        OUTPUT_SIZE,
      )

      return canvasToAvatarFile(canvas)
    },
  }), [imageSize, metrics, offset.x, offset.y, src])

  return (
    <div className="avatar-cropper">
      <div
        className="avatar-crop-viewport"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onWheel={handleWheel}
        role="img"
        aria-label="Podgląd kadrowania avatara. Przeciągnij zdjęcie, aby zmienić położenie."
      >
        <img
          src={src}
          alt=""
          draggable={false}
          onLoad={(event) => {
            const nextSize = {
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            }
            setImageSize(nextSize)
            setOffset({ x: 0, y: 0 })
          }}
          style={metrics ? {
            width: `${metrics.width}px`,
            height: `${metrics.height}px`,
            transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
          } : undefined}
        />
        <span className="avatar-crop-guide" aria-hidden="true" />
        <span className="avatar-drag-hint" aria-hidden="true"><Move size={17} /> Przeciągnij</span>
      </div>

      <div className="avatar-crop-controls">
        <label className="zoom-control">
          <span><ZoomIn size={17} /> Powiększenie</span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step="0.01"
            value={zoom}
            onChange={(event) => changeZoom(Number(event.target.value))}
          />
        </label>
        <button className="secondary-button compact" type="button" onClick={resetPosition}>
          <RotateCcw size={16} /> Wyśrodkuj
        </button>
      </div>
      <small>Przeciągnij zdjęcie myszką lub palcem i użyj suwaka, aby ustawić kadr.</small>
    </div>
  )
})
