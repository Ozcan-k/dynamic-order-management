import { useRef, useEffect, useState } from 'react'
import { colors } from '../theme'
import CameraOverlay from './scanner/CameraOverlay'
import { useCameraScanner } from '../lib/scanner/useCameraScanner'
import { playBeep, unlockAudio, vibrate } from '../lib/scanner/feedback'

interface ScanInputProps {
  onScan: (trackingNumber: string) => void
  disabled?: boolean
  buttonLabel?: string
  enableCamera?: boolean
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

  // ── Camera ───────────────────────────────────────────────────────────────────
  const scanner = useCameraScanner({
    onDetected: (code) => { playBeep(true); vibrate(100); onScan(code) },
  })
  const cameraError = scanner.error
  const openCamera = () => { unlockAudio(); void scanner.open() }

  useEffect(() => {
    inputRef.current?.focus()
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

      <CameraOverlay scanner={scanner} color="#3b82f6" title="Scan Barcode" />
    </>
  )
}
