import { useCallback, useEffect, useRef, useState } from 'react'
import { decodeFrame, needsConfirmation, preloadDecoders, type Region, type ScanKind } from './decoder'

export interface CameraScannerOptions {
  /** Called with each accepted code. In single mode the camera is already closed when this runs. */
  onDetected: (code: string) => void
  /** Keep the camera open after a read (bulk scanning). The same code is ignored for `repeatMs`. */
  continuous?: boolean
  /** Shorter reads are ignored (partial reads such as "HAR" seen in the packer logs). */
  minLength?: number
  repeatMs?: number
  /** `waybill` (default): courier barcodes. `qr`: stock labels, QR only. */
  kind?: ScanKind
}

export interface CameraScanner {
  videoRef: React.RefObject<HTMLVideoElement>
  /** The on-screen guide. Decoding concentrates on this area of the picture. */
  frameRef: React.RefObject<HTMLDivElement>
  isOpen: boolean
  error: string | null
  /** Last accepted code (continuous mode shows it in the overlay). */
  lastCode: string | null
  open: () => Promise<void>
  close: () => void
  torch: { supported: boolean; on: boolean; toggle: () => void }
  zoom: { supported: boolean; level: number; cycle: () => void }
}

type TrackCaps = MediaTrackCapabilities & { torch?: boolean; zoom?: { min: number; max: number }; focusMode?: string[] }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function cameraErrorText(err: unknown): string {
  const name = (err as { name?: string })?.name
  if (name === 'NotAllowedError') return 'Camera permission denied. Please allow camera access.'
  if (name === 'NotFoundError') return 'No camera found on this device.'
  if (name === 'NotReadableError') return 'The camera is in use by another app. Close it and try again.'
  return 'Could not open camera.'
}

/** Map the guide element (CSS pixels over an object-fit: cover video) to video pixels, with a margin around it. */
function regionOf(video: HTMLVideoElement, frame: HTMLElement | null): Region {
  const vw = video.videoWidth, vh = video.videoHeight
  const full = { x: 0, y: 0, w: vw, h: vh }
  if (!frame) return full
  const vr = video.getBoundingClientRect(), fr = frame.getBoundingClientRect()
  if (!vr.width || !vr.height || !fr.width) return full
  const scale = Math.max(vr.width / vw, vr.height / vh)
  const offX = (vr.width - vw * scale) / 2, offY = (vr.height - vh * scale) / 2
  const mx = fr.width * 0.08, my = fr.height * 0.15
  const x0 = Math.max(0, (fr.left - mx - vr.left - offX) / scale)
  const y0 = Math.max(0, (fr.top - my - vr.top - offY) / scale)
  const x1 = Math.min(vw, (fr.right + mx - vr.left - offX) / scale)
  const y1 = Math.min(vh, (fr.bottom + my - vr.top - offY) / scale)
  if (x1 - x0 < 32 || y1 - y0 < 16) return full
  return { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) }
}

/**
 * Shared camera barcode scanner for every scan screen (replaces the per-page @zxing/browser copies).
 * Usage: render `<video ref={scanner.videoRef}>` and the guide with `ref={scanner.frameRef}` while `scanner.isOpen`.
 */
export function useCameraScanner({ onDetected, continuous = false, minLength = 6, repeatMs = 2500, kind = 'waybill' }: CameraScannerOptions): CameraScanner {
  const videoRef = useRef<HTMLVideoElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const runRef = useRef(0)
  const cbRef = useRef(onDetected)
  cbRef.current = onDetected
  const optsRef = useRef({ continuous, minLength, repeatMs, kind })
  optsRef.current = { continuous, minLength, repeatMs, kind }

  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastCode, setLastCode] = useState<string | null>(null)
  const [torchSupported, setTorchSupported] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [zoomLevels, setZoomLevels] = useState<number[]>([])
  const [zoomIndex, setZoomIndex] = useState(0)

  const close = useCallback(() => {
    runRef.current++
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setIsOpen(false)
    setTorchOn(false)
    setZoomIndex(0)
  }, [])

  const open = useCallback(async () => {
    setError(null)
    setLastCode(null)
    preloadDecoders(optsRef.current.kind)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
    } catch (err) {
      setError(cameraErrorText(err))
      return
    }
    streamRef.current = stream
    const track = stream.getVideoTracks()[0]
    const caps = (track?.getCapabilities?.() ?? {}) as TrackCaps
    if (caps.focusMode?.includes('continuous')) {
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {})
    }
    setTorchSupported(!!caps.torch)
    const z = caps.zoom
    setZoomLevels(z && z.max >= 1.5 ? [Math.max(1, z.min), Math.min(2, z.max), ...(z.max >= 3 ? [3] : [])] : [])
    setIsOpen(true)
  }, [])

  // Attach the stream once the <video> is rendered, then read frames until closed.
  useEffect(() => {
    if (!isOpen) return
    const video = videoRef.current
    const stream = streamRef.current
    if (!video || !stream) return
    const run = ++runRef.current
    video.srcObject = stream
    video.play().catch(() => {})

    let attempt = 0
    let pending: { text: string; at: number } | null = null
    let last: { text: string; at: number } | null = null

    void (async () => {
      while (runRef.current === run) {
        if (video.readyState < 2 || !video.videoWidth) { await sleep(80); continue }
        const { minLength: min, continuous: keepOpen, repeatMs: repeat, kind: k } = optsRef.current
        const hit = await decodeFrame(video, regionOf(video, frameRef.current), attempt++, min, k)
        if (runRef.current !== run) break
        if (hit) {
          const now = Date.now()
          if (needsConfirmation(hit.format) && !(pending && pending.text === hit.text && now - pending.at < 1500)) {
            pending = { text: hit.text, at: now }
          } else if (!(last && last.text === hit.text && now - last.at < repeat)) {
            pending = null
            last = { text: hit.text, at: now }
            setLastCode(hit.text)
            if (!keepOpen) {
              close()
              cbRef.current(hit.text)
              break
            }
            cbRef.current(hit.text)
          }
        }
        await sleep(keepOpen ? 90 : 40)
      }
    })()

    // runRef is a run counter, not a DOM ref: reading its latest value here is the point (stop only this run's loop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { if (runRef.current === run) runRef.current++ }
  }, [isOpen, close])

  useEffect(() => () => close(), [close])

  const toggleTorch = useCallback(() => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const next = !torchOn
    track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      .then(() => setTorchOn(next))
      .catch(() => setTorchSupported(false))
  }, [torchOn])

  const cycleZoom = useCallback(() => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track || zoomLevels.length < 2) return
    const next = (zoomIndex + 1) % zoomLevels.length
    track.applyConstraints({ advanced: [{ zoom: zoomLevels[next] } as MediaTrackConstraintSet] })
      .then(() => setZoomIndex(next))
      .catch(() => setZoomLevels([]))
  }, [zoomIndex, zoomLevels])

  return {
    videoRef,
    frameRef,
    isOpen,
    error,
    lastCode,
    open,
    close,
    torch: { supported: torchSupported, on: torchOn, toggle: toggleTorch },
    zoom: { supported: zoomLevels.length > 1, level: zoomLevels[zoomIndex] ?? 1, cycle: cycleZoom },
  }
}
