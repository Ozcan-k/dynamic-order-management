import { useEffect, useState } from 'react'

interface ScanCelebrationProps {
  show: boolean
  message?: string
  variant?: 'success' | 'error'
  onDone?: () => void
  durationMs?: number
}

const PARTICLE_COUNT = 18
const PARTICLE_COLORS = ['#22c55e', '#3b82f6', '#eab308', '#ec4899', '#06b6d4', '#f97316']

function makeParticles() {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = (Math.PI * 2 * i) / PARTICLE_COUNT + Math.random() * 0.3
    const distance = 90 + Math.random() * 90
    return {
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance,
      color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
      size: 6 + Math.random() * 6,
      rot: Math.random() * 360,
    }
  })
}

export default function ScanCelebration({
  show,
  message,
  variant = 'success',
  onDone,
  durationMs = 1100,
}: ScanCelebrationProps) {
  const [particles, setParticles] = useState(() => makeParticles())

  useEffect(() => {
    if (!show) return
    setParticles(makeParticles())
    const t = setTimeout(() => onDone?.(), durationMs)
    return () => clearTimeout(t)
  }, [show, durationMs, onDone])

  if (!show) return null

  const isError = variant === 'error'
  const accent = isError ? '#ef4444' : '#22c55e'

  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      {/* Soft radial glow behind */}
      <div style={{
        position: 'absolute',
        width: 260, height: 260, borderRadius: '50%',
        background: `radial-gradient(circle, ${accent}33 0%, transparent 70%)`,
        animation: 'celebrate-glow 900ms ease-out forwards',
      }} />

      {/* Particles — only for success */}
      {!isError && particles.map((p, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            width: p.size, height: p.size, borderRadius: '2px',
            background: p.color,
            transform: `translate(0,0) rotate(${p.rot}deg)`,
            animation: `celebrate-particle-${i} 1000ms cubic-bezier(0.16,1,0.3,1) forwards`,
          }}
        />
      ))}

      {/* Dynamically generated keyframes per particle */}
      {!isError && (
        <style>{particles.map((p, i) => `
          @keyframes celebrate-particle-${i} {
            0%   { transform: translate(0,0) rotate(${p.rot}deg); opacity: 1; }
            100% { transform: translate(${p.dx}px, ${p.dy}px) rotate(${p.rot + 360}deg); opacity: 0; }
          }
        `).join('\n')}</style>
      )}

      {/* Big check or cross icon */}
      <div
        style={{
          width: 128, height: 128, borderRadius: '50%',
          background: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 12px 48px ${accent}55, 0 0 0 6px ${accent}22`,
          animation: 'celebrate-pop 600ms cubic-bezier(0.16,1,0.3,1) forwards',
        }}
      >
        {isError ? (
          <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        ) : (
          <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" style={{
              strokeDasharray: 30, strokeDashoffset: 30,
              animation: 'celebrate-check 500ms 180ms cubic-bezier(0.65,0,0.35,1) forwards',
            }} />
          </svg>
        )}
      </div>

      {message && (
        <div style={{
          position: 'absolute',
          bottom: '28%',
          background: 'rgba(15,23,42,0.92)',
          color: '#fff',
          padding: '10px 18px',
          borderRadius: 999,
          fontSize: 14,
          fontWeight: 600,
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
          animation: 'celebrate-message 500ms 120ms ease-out both',
          maxWidth: '80vw',
          textAlign: 'center',
        }}>
          {message}
        </div>
      )}
    </div>
  )
}
