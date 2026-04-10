import { useRef, useEffect, useState } from 'react'

interface ScanInputProps {
  onScan: (trackingNumber: string) => void
  disabled?: boolean
}

export default function ScanInput({ onScan, disabled }: ScanInputProps) {
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

  return (
    <div style={{
      background: '#f8fafc', border: '1px solid #e2e8f0',
      borderRadius: '12px', padding: '18px 20px', marginBottom: '20px',
    }}>
      <label style={{
        display: 'block', marginBottom: '10px',
        fontWeight: 700, fontSize: '12px',
        color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        Scan / Enter Tracking Number
      </label>
      <div className="scan-input-row">
        <div style={{ position: 'relative', flex: 1 }}>
          <span style={{
            position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
            fontSize: '16px', pointerEvents: 'none',
          }}>🔍</span>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder="Scan barcode or type tracking number and press Enter..."
            style={{
              width: '100%', padding: '12px 14px 12px 40px',
              fontSize: '14px', fontFamily: 'monospace',
              border: '2px solid #3b82f6', borderRadius: '8px',
              outline: 'none', boxSizing: 'border-box',
              background: disabled ? '#f1f5f9' : '#fff',
              color: '#111827', letterSpacing: '0.03em',
              boxShadow: '0 0 0 3px rgba(59,130,246,0.1)',
            }}
            autoComplete="off"
          />
        </div>
        <button
          className="scan-add-btn"
          onClick={() => { if (value.trim()) { onScan(value.trim()); setValue('') } }}
          disabled={disabled || !value.trim()}
          style={{
            padding: '12px 20px', border: 'none', borderRadius: '8px',
            cursor: disabled || !value.trim() ? 'not-allowed' : 'pointer',
            background: disabled || !value.trim() ? '#e2e8f0' : '#3b82f6',
            color: disabled || !value.trim() ? '#94a3b8' : '#fff',
            fontWeight: 700, fontSize: '14px', whiteSpace: 'nowrap',
            transition: 'all 0.15s', flexShrink: 0,
          }}
        >
          Add Order
        </button>
      </div>
      <p style={{ marginTop: '8px', fontSize: '12px', color: '#94a3b8', margin: '8px 0 0' }}>
        Press <kbd style={{ background: '#e2e8f0', padding: '1px 6px', borderRadius: '4px', fontSize: '11px' }}>Enter</kbd> or use a barcode scanner — platform is auto-detected
      </p>
    </div>
  )
}
