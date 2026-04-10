import { useRef, useEffect, useState } from 'react'
import { colors } from '../theme'

interface ScanInputProps {
  onScan: (trackingNumber: string) => void
  disabled?: boolean
  buttonLabel?: string
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

export default function ScanInput({ onScan, disabled, buttonLabel }: ScanInputProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && value.trim()) {
      onScan(value.trim())
      setValue('')
    }
  }

  const canSubmit = !disabled && !!value.trim()

  return (
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
      <p style={{ marginTop: '8px', fontSize: '12px', color: colors.textMuted, margin: '8px 0 0' }}>
        Press <kbd style={{ background: colors.border, padding: '1px 6px', borderRadius: '4px', fontSize: '11px', color: colors.textSecondary }}>Enter</kbd> or use a barcode scanner — platform is auto-detected
      </p>
    </div>
  )
}
