import type React from 'react'
import { colors } from '../../theme'

// ─── Date helpers (Manila TZ) ───────────────────────────────────────────────

export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00+08:00`)
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) // YYYY-MM-DD
}

export function formatDisplayDate(dateStr: string): { day: string; month: string; year: string; weekday: string } {
  const d = new Date(`${dateStr}T12:00:00+08:00`)
  return {
    weekday: d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'Asia/Manila' }),
    day:     d.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'Asia/Manila' }),
    month:   d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'Asia/Manila' }),
    year:    d.toLocaleDateString('en-GB', { year: 'numeric', timeZone: 'Asia/Manila' }),
  }
}

export function daysBetween(fromStr: string, toStr: string): number {
  const a = new Date(`${fromStr}T12:00:00+08:00`).getTime()
  const b = new Date(`${toStr}T12:00:00+08:00`).getTime()
  return Math.round((b - a) / 86_400_000)
}

export function formatRelative(dateStr: string, todayStr: string): string {
  const diff = daysBetween(dateStr, todayStr)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff === -1) return 'Tomorrow'
  if (diff > 0)    return `${diff} days ago`
  return `in ${-diff} days`
}

// ─── Component ──────────────────────────────────────────────────────────────

interface DateNavigatorProps {
  value: string              // YYYY-MM-DD or '' (today)
  todayStr: string
  onChange: (v: string) => void
  minDate?: string           // YYYY-MM-DD — cannot navigate earlier than this
}

export default function DateNavigator({ value, todayStr, onChange, minDate }: DateNavigatorProps) {
  const activeDate = value || todayStr
  const isToday = activeDate === todayStr
  const atMin = !!minDate && activeDate <= minDate
  const { weekday, day, month, year } = formatDisplayDate(activeDate)

  const navBtn: React.CSSProperties = {
    width: 32, height: 32, borderRadius: 8,
    border: `1px solid ${colors.border}`,
    background: '#fff', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: colors.textSecondary, flexShrink: 0,
    transition: 'background 0.12s, border-color 0.12s',
  }

  function goPrev() {
    const prev = addDays(activeDate, -1)
    if (minDate && prev < minDate) return
    onChange(prev)
  }

  function goNext() {
    if (isToday) return
    const next = addDays(activeDate, 1)
    onChange(next === todayStr ? '' : next)
  }

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 0,
      background: '#fff', border: `1px solid ${colors.border}`,
      borderRadius: 10, overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      {/* Prev day */}
      <button
        onClick={goPrev}
        disabled={atMin}
        style={{ ...navBtn, borderRadius: 0, border: 'none', borderRight: `1px solid ${colors.border}`,
          opacity: atMin ? 0.3 : 1, cursor: atMin ? 'not-allowed' : 'pointer' }}
        title={atMin ? 'Earliest available date' : 'Previous day'}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>

      {/* Date display — clicking opens native date input */}
      <label style={{ position: 'relative', cursor: 'pointer' }}>
        <div style={{
          padding: '6px 16px', minWidth: 148, textAlign: 'center',
          background: isToday ? '#f0fdf4' : '#fafafa',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: isToday ? '#15803d' : colors.textMuted, marginBottom: 1 }}>
            {isToday ? '● Today' : weekday}
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: isToday ? '#15803d' : colors.textPrimary, letterSpacing: '-0.3px' }}>
            {day} {month} <span style={{ fontWeight: 500, color: colors.textSecondary, fontSize: 13 }}>{year}</span>
          </div>
        </div>
        <input
          type="date"
          value={activeDate}
          max={todayStr}
          min={minDate}
          onChange={e => {
            if (!e.target.value) return
            onChange(e.target.value === todayStr ? '' : e.target.value)
          }}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}
        />
      </label>

      {/* Next day — disabled when today */}
      <button
        onClick={goNext}
        disabled={isToday}
        style={{ ...navBtn, borderRadius: 0, border: 'none', borderLeft: `1px solid ${colors.border}`,
          opacity: isToday ? 0.3 : 1, cursor: isToday ? 'not-allowed' : 'pointer' }}
        title="Next day"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>

      {/* Today shortcut — only when not today */}
      {!isToday && (
        <button
          onClick={() => onChange('')}
          style={{ ...navBtn, borderRadius: 0, border: 'none', borderLeft: `1px solid ${colors.border}`,
            padding: '0 12px', width: 'auto', fontSize: 11, fontWeight: 700, color: colors.primary,
            background: '#eff6ff', gap: 4 }}
        >
          Today
        </button>
      )}
    </div>
  )
}
