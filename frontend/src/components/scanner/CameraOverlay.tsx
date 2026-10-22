import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { CameraScanner } from '../../lib/scanner/useCameraScanner'
import ScanFrame from './ScanFrame'
import ScannerControls from './ScannerControls'

interface CameraOverlayProps {
  scanner: CameraScanner
  color?: string
  title?: string
  hint?: string
  /** Continuous mode: a line under the guide, e.g. "12 scanned". */
  status?: ReactNode
  /** Label of the bottom button: "Cancel" for one scan, "Done" for bulk scanning. */
  closeLabel?: string
}

/** Full-screen camera for the handheld scan screens (rendered in a portal above everything). */
export default function CameraOverlay({ scanner, color = '#22c55e', title, hint = 'Hold the barcode inside the frame', status, closeLabel = 'Cancel' }: CameraOverlayProps) {
  const [flash, setFlash] = useState(false)
  useEffect(() => {
    if (!scanner.lastCode) return
    setFlash(true)
    const t = setTimeout(() => setFlash(false), 350)
    return () => clearTimeout(t)
  }, [scanner.lastCode])

  if (!scanner.isOpen) return null
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 10000, overflow: 'hidden' }}>
      <video ref={scanner.videoRef} playsInline muted autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      <ScanFrame ref={scanner.frameRef} color={color} flash={flash} />
      {title && (
        <div style={{ position: 'absolute', top: 22, left: 18, right: 150, color: '#f1f5f9', fontSize: 17, fontWeight: 800, textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>{title}</div>
      )}
      <ScannerControls scanner={scanner} />
      <div style={{ position: 'absolute', top: 'calc(44% + clamp(100px, 19vh, 190px) + 18px)', left: 16, right: 16, textAlign: 'center' }}>
        <p style={{ margin: 0, color: '#e2e8f0', fontSize: 16, fontWeight: 600, textShadow: '0 1px 4px rgba(0,0,0,0.7)' }}>{hint}</p>
        {status && <div style={{ marginTop: 10 }}>{status}</div>}
      </div>
      <button
        type="button"
        onClick={scanner.close}
        style={{
          position: 'absolute', bottom: 'max(36px, env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)',
          padding: '18px 72px', borderRadius: 16, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 18, fontWeight: 700,
          border: closeLabel === 'Cancel' ? '1px solid rgba(239,68,68,0.35)' : '1px solid rgba(34,197,94,0.45)',
          background: closeLabel === 'Cancel' ? 'rgba(239,68,68,0.18)' : 'rgba(34,197,94,0.22)',
          color: closeLabel === 'Cancel' ? '#f87171' : '#4ade80',
        }}
      >
        {closeLabel}
      </button>
    </div>,
    document.body,
  )
}
