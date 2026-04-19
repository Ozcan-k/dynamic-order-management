import { useRef, useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { colors } from '../theme'

interface ScanInputProps {
  onScan: (trackingNumber: string) => void
  disabled?: boolean
  buttonLabel?: string
  enableCamera?: boolean
}

function playBeep(success: boolean) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    if (success) {
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08)
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.35, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.2)
    } else {
      osc.frequency.setValueAtTime(300, ctx.currentTime)
      osc.type = 'square'
      gain.gain.setValueAtTime(0.2, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.3)
    }
  } catch {}
}

function vibrate(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern) } catch {}
}

const BarcodeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9V5a2 2 0 0 1 2-2h4" />
    <path d="M3 15v4a2 2 0 0 0 2 2h4" />
    <path d="M21 9V5a2 2 0 0 0-2-2h-4" />
    <path d="M21 15v4a2 2 0 0 1-2 2h-4" />
    <line x1="7" y1="12" x2="7" y2="12" strokeWidth="3" />
    <line x1="10" y1="9" x2="10" y2="15" strokeWidth="1.5" />
    <line x1="13" y1="9" x2="13" y2="15" strokeWidth="3" />
    <line x1="16" y1="9" x2="16" y2="15" strokeWidth="1.5" />
  </svg>
)

const CameraIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
)

export default function ScanInput({ onScan, disabled, buttonLabel, enableCamera }: ScanInputProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Camera state ─────────────────────────────────────────────────────────────
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const controlsRef = useRef<any>(null)
  const didScanRef = useRef(false)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // ── Camera: start reader when cameraOpen + stream ready ──────────────────────
  useEffect(() => {
    if (!cameraOpen) return
    if (!videoRef.current || !streamRef.current) return
    const video = videoRef.current
    video.srcObject = streamRef.current
    const reader = new BrowserMultiFormatReader()
    video.play().then(() => {
      reader.decodeFromStream(streamRef.current!, video, (result, _err, controls) => {
        if (controls && !controlsRef.current) controlsRef.current = controls
        if (result && !didScanRef.current) {
          didScanRef.current = true
          const code = result.getText()
          stopCamera()
          playBeep(true)
          vibrate(100)
          onScan(code)
        }
      }).then(controls => {
        if (!controlsRef.current) controlsRef.current = controls
      }).catch(() => {})
    }).catch(() => {
      setCameraError('Could not start video stream.')
      setCameraOpen(false)
    })
    return () => { (reader as any).stopAsyncDecode?.() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen])

  // ── Camera: cleanup on unmount ───────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    controlsRef.current?.stop()
    controlsRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraOpen(false)
    setCameraError(null)
    didScanRef.current = false
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  const openCamera = useCallback(async () => {
    setCameraError(null)
    didScanRef.current = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      setCameraOpen(true)
    } catch (err: any) {
      const msg =
        err?.name === 'NotAllowedError' ? 'Camera permission denied. Please allow camera access.' :
        err?.name === 'NotFoundError' ? 'No camera found on this device.' :
        'Could not open camera.'
      setCameraError(msg)
    }
  }, [])

  // ── Text input handlers ──────────────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && value.trim()) {
      onScan(value.trim())
      setValue('')
    }
  }

  const canSubmit = !disabled && !!value.trim()

  return (
    <>
      <div style={{
        background: '#f8fafc', border: `1px solid ${colors.border}`,
        borderRadius: '12px', padding: '18px 20px', marginBottom: '20px',
      }}>
        <label style={{
          display: 'block', marginBottom: '10px',
          fontWeight: 700, fontSize: '12px',
          color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          Scan / Enter Tracking Number
        </label>
        <div className="scan-input-row">
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{
              position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)',
              pointerEvents: 'none', color: colors.primary, display: 'flex',
            }}>
              <BarcodeIcon />
            </span>
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              placeholder="Scan barcode or type tracking number..."
              style={{
                width: '100%', padding: '11px 14px 11px 38px',
                fontSize: '14px', fontFamily: 'monospace',
                border: `2px solid ${colors.primary}`, borderRadius: '8px',
                outline: 'none', boxSizing: 'border-box',
                background: disabled ? '#f1f5f9' : '#fff',
                color: colors.textPrimary, letterSpacing: '0.03em',
                boxShadow: `0 0 0 3px ${colors.primaryRing}`,
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              autoComplete="off"
            />
          </div>
          {enableCamera && (
            <button
              onClick={openCamera}
              disabled={disabled}
              title="Scan with camera"
              style={{
                padding: '11px 14px', border: 'none', borderRadius: '8px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                background: disabled ? colors.border : '#0f172a',
                color: disabled ? colors.textMuted : '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'all 0.15s',
              }}
            >
              <CameraIcon />
            </button>
          )}
          <button
            className="scan-add-btn"
            onClick={() => { if (canSubmit) { onScan(value.trim()); setValue('') } }}
            disabled={!canSubmit}
            style={{
              padding: '11px 20px', border: 'none', borderRadius: '8px',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              background: canSubmit ? colors.primary : colors.border,
              color: canSubmit ? '#fff' : colors.textMuted,
              fontWeight: 700, fontSize: '14px', whiteSpace: 'nowrap',
              transition: 'all 0.15s', flexShrink: 0,
            }}
          >
            {buttonLabel ?? 'Add Order'}
          </button>
        </div>
        {cameraError && (
          <p style={{ marginTop: '8px', fontSize: '12px', color: '#dc2626', margin: '8px 0 0' }}>
            {cameraError}
          </p>
        )}
        <p style={{ marginTop: '8px', fontSize: '12px', color: colors.textMuted, margin: '8px 0 0' }}>
          Press <kbd style={{ background: colors.border, padding: '1px 6px', borderRadius: '4px', fontSize: '11px', color: colors.textSecondary }}>Enter</kbd> or use a barcode scanner — platform is auto-detected
        </p>
      </div>

      {/* Camera overlay — full screen, rendered via portal */}
      {cameraOpen && createPortal(
        <div style={{
          position: 'fixed', inset: 0, background: '#000',
          zIndex: 9999, display: 'flex', flexDirection: 'column',
        }}>
          {/* Header */}
          <div style={{
            padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(0,0,0,0.7)', flexShrink: 0,
          }}>
            <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '16px' }}>Scan Barcode</span>
            <button
              onClick={stopCamera}
              style={{
                background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '8px', color: '#f1f5f9', padding: '8px 16px',
                fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>

          {/* Video */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <video
              ref={videoRef}
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {/* Scan guide overlay */}
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: '70%', maxWidth: '280px', aspectRatio: '3/2',
                border: '2px solid rgba(59,130,246,0.8)',
                borderRadius: '12px',
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
              }} />
            </div>
          </div>

          {/* Hint */}
          <div style={{
            padding: '16px', background: 'rgba(0,0,0,0.7)', textAlign: 'center', flexShrink: 0,
          }}>
            <span style={{ color: '#94a3b8', fontSize: '14px' }}>Point the camera at the barcode</span>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
