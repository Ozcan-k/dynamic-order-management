import { forwardRef, type CSSProperties } from 'react'

interface ScanFrameProps {
  color?: string
  /** Position of the guide; defaults to a wide band a little above the middle of the screen. */
  style?: CSSProperties
  /** Brief green flash after a read (continuous mode). */
  flash?: boolean
}

/**
 * The scan guide over the camera picture. Wide and tall enough for a whole courier label barcode (Flash / J&T / SPX
 * waybills are long Code128 symbols); the decoder reads this area first (`scanner.frameRef`).
 */
const ScanFrame = forwardRef<HTMLDivElement, ScanFrameProps>(function ScanFrame({ color = '#22c55e', style, flash }, ref) {
  const corner = (pos: CSSProperties): CSSProperties => ({ position: 'absolute', width: 52, height: 52, borderColor: color, borderStyle: 'solid', borderWidth: 0, ...pos })
  return (
    <div
      ref={ref}
      style={{
        position: 'absolute', left: '50%', top: '44%', transform: 'translate(-50%, -50%)',
        width: '96%', maxWidth: '720px', height: 'clamp(200px, 38vh, 380px)',
        pointerEvents: 'none', borderRadius: '10px',
        transition: 'background 0.15s', background: flash ? 'rgba(34,197,94,0.22)' : 'transparent',
        ...style,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, borderRadius: '10px', boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)' }} />
      <div style={corner({ top: 0, left: 0, borderTopWidth: 5, borderLeftWidth: 5, borderTopLeftRadius: 10 })} />
      <div style={corner({ top: 0, right: 0, borderTopWidth: 5, borderRightWidth: 5, borderTopRightRadius: 10 })} />
      <div style={corner({ bottom: 0, left: 0, borderBottomWidth: 5, borderLeftWidth: 5, borderBottomLeftRadius: 10 })} />
      <div style={corner({ bottom: 0, right: 0, borderBottomWidth: 5, borderRightWidth: 5, borderBottomRightRadius: 10 })} />
      <div
        className="scan-frame-line"
        style={{ position: 'absolute', top: '50%', left: '2%', right: '2%', height: '2px', background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
      />
      <style>{`
        .scan-frame-line { animation: scanFrameLine 1.6s ease-in-out infinite; }
        @keyframes scanFrameLine { 0%,100% { opacity: .35; transform: translateY(-60px) } 50% { opacity: 1; transform: translateY(60px) } }
        @media (prefers-reduced-motion: reduce) { .scan-frame-line { animation: none; } }
      `}</style>
    </div>
  )
})

export default ScanFrame
