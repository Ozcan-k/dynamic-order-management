import type { CSSProperties } from 'react'
import type { CameraScanner } from '../../lib/scanner/useCameraScanner'

/** Torch and zoom buttons; each shows only when the phone's camera supports it. */
export default function ScannerControls({ scanner, style }: { scanner: CameraScanner; style?: CSSProperties }) {
  const { torch, zoom } = scanner
  if (!torch.supported && !zoom.supported) return null
  const btn = (active: boolean): CSSProperties => ({
    minWidth: 52, height: 52, padding: '0 14px', borderRadius: 26, cursor: 'pointer',
    border: `1px solid ${active ? 'rgba(250,204,21,0.7)' : 'rgba(255,255,255,0.25)'}`,
    background: active ? 'rgba(250,204,21,0.25)' : 'rgba(15,23,42,0.6)',
    color: active ? '#fde047' : '#f1f5f9', fontSize: 15, fontWeight: 800,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  })
  return (
    <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 10, zIndex: 2, ...style }}>
      {zoom.supported && (
        <button type="button" onClick={zoom.cycle} aria-label={`Zoom ${zoom.level}x`} style={btn(zoom.level > 1)}>
          {Number.isInteger(zoom.level) ? zoom.level : zoom.level.toFixed(1)}×
        </button>
      )}
      {torch.supported && (
        <button type="button" onClick={torch.toggle} aria-label={torch.on ? 'Turn light off' : 'Turn light on'} aria-pressed={torch.on} style={btn(torch.on)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2h12l-2 6H8L6 2z" /><path d="M8 8v4l2 10h4l2-10V8" /><line x1="12" y1="12" x2="12" y2="15" />
          </svg>
        </button>
      )}
    </div>
  )
}
