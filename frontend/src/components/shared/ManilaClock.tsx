import { useEffect, useState } from 'react'

/**
 * ManilaClock — a compact live clock fixed to Asia/Manila (UTC+8, no DST).
 * Self-contained: owns its own 1s interval and styling so it can drop into any
 * page header/body. Extracted from the Dashboard hero clock.
 */
export default function ManilaClock() {
  const [now, setNow] = useState(() => new Date())
  const [colon, setColon] = useState(true)

  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date())
      setColon((v) => !v)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const [hh, mm] = now
    .toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Manila' })
    .split(':')
  const weekday = now.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Asia/Manila' })
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Manila' })

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '14px 20px',
        marginBottom: 20,
        borderRadius: 14,
        background: 'linear-gradient(120deg, #0f172a 0%, #1e293b 55%, #312e81 100%)',
        boxShadow: '0 6px 22px rgba(15,23,42,0.25)',
        color: '#fff',
        flexWrap: 'wrap',
      }}
    >
      {/* Time */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1, letterSpacing: '-1.5px', fontVariantNumeric: 'tabular-nums' }}>
          {hh}
          <span style={{ display: 'inline-block', width: '0.32em', textAlign: 'center', color: '#a5b4fc', opacity: colon ? 1 : 0.15, transition: 'opacity 0.12s ease-in-out' }}>:</span>
          {mm}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 0 3px rgba(52,211,153,0.22)' }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#a7f3d0', textTransform: 'uppercase' }}>Live</span>
        </div>
      </div>

      {/* Date */}
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{weekday}</div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{dateStr} · Asia/Manila</div>
      </div>
    </div>
  )
}
