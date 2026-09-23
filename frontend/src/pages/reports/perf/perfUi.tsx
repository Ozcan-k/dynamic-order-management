import type { ReactNode } from 'react'
import {
  AttendanceStatus,
  PERF_MAX_RANGE_DAYS,
  PERF_STATUS_LABEL,
  type PerfDay,
  type PerfDayOutcome,
  type PerfRole,
  type PerfStatus,
} from '@dom/shared'
import { addDays } from '../../../components/shared/DateNavigator'

// ─── Colours (semantic status + role accent) ─────────────────────────────────
// Status colours are reserved for met / near / below — never used as a series colour.

export const OUTCOME_COLOR: Record<PerfDayOutcome, { fill: string; bg: string; ink: string; label: string }> = {
  MET: { fill: '#16a34a', bg: '#dcfce7', ink: '#166534', label: 'Met target' },
  NEAR: { fill: '#f59e0b', bg: '#fef3c7', ink: '#92400e', label: 'Near target (90–99%)' },
  BELOW: { fill: '#dc2626', bg: '#fee2e2', ink: '#991b1b', label: 'Below 90% of target' },
  OFF: { fill: '#cbd5e1', bg: '#f8fafc', ink: '#94a3b8', label: 'Off / no work' },
  IN_PROGRESS: { fill: '#93c5fd', bg: '#eff6ff', ink: '#1d4ed8', label: 'Today (in progress)' },
}

export const STATUS_OUTCOME: Record<PerfStatus, PerfDayOutcome> = {
  TARGET_ACHIEVED: 'MET',
  NEAR_TARGET: 'NEAR',
  BELOW_TARGET: 'BELOW',
  NO_ACTIVITY: 'OFF',
}

export const ROLE_ACCENT: Record<PerfRole, { main: string; soft: string; ink: string }> = {
  PICKER: { main: '#2563eb', soft: '#eff6ff', ink: '#1e3a8a' },
  PACKER: { main: '#0e7490', soft: '#ecfeff', ink: '#164e63' },
}

export const ROLE_LABEL: Record<PerfRole, { one: string; many: string }> = {
  PICKER: { one: 'Picker', many: 'Pickers' },
  PACKER: { one: 'Packer', many: 'Packers' },
}

/** Neutral comparison ink (team average) and the target line. */
export const TEAM_INK = '#64748b'
export const TARGET_INK = '#0f172a'
export const GRID_STROKE = '#94a3b8'

export const ATTENDANCE_SHORT: Record<AttendanceStatus, string> = {
  [AttendanceStatus.PRESENT]: 'P',
  [AttendanceStatus.HALF_DAY]: '½',
  [AttendanceStatus.ABSENT]: 'AB',
  [AttendanceStatus.DAY_OFF]: 'OFF',
  [AttendanceStatus.VACATION_LEAVE]: 'VL',
  [AttendanceStatus.SICK_LEAVE]: 'SL',
  [AttendanceStatus.MATERNITY_LEAVE]: 'ML',
}

export const ATTENDANCE_TEXT: Record<AttendanceStatus, string> = {
  [AttendanceStatus.PRESENT]: 'Present',
  [AttendanceStatus.HALF_DAY]: 'Half Day',
  [AttendanceStatus.ABSENT]: 'Absent',
  [AttendanceStatus.DAY_OFF]: 'Day Off',
  [AttendanceStatus.VACATION_LEAVE]: 'Vacation Leave',
  [AttendanceStatus.SICK_LEAVE]: 'Sick Leave',
  [AttendanceStatus.MATERNITY_LEAVE]: 'Maternity Leave',
}

// ─── Formatting ──────────────────────────────────────────────────────────────

export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US')
export const fmt1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
export const fmtPct = (ratio: number) => `${(ratio * 100).toFixed(1)}%`
/** Active days can be fractional (Half Day = 0.5). */
export const fmtDays = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const WEEKDAY_SHORT = WEEKDAYS

function utc(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`)
}
export function shortDate(dateStr: string): string {
  const d = utc(dateStr)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}
export function longDate(dateStr: string): string {
  const d = utc(dateStr)
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}
export function weekdayOf(dateStr: string): string {
  return WEEKDAYS[utc(dateStr).getUTCDay()]
}
export function rangeLabel(from: string, to: string): string {
  const a = utc(from)
  const b = utc(to)
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear()
  const left = `${MONTHS[a.getUTCMonth()]} ${a.getUTCDate()}${sameYear ? '' : `, ${a.getUTCFullYear()}`}`
  return `${left} – ${MONTHS[b.getUTCMonth()]} ${b.getUTCDate()}, ${b.getUTCFullYear()}`
}
export function dayCount(from: string, to: string): number {
  return Math.round((utc(to).getTime() - utc(from).getTime()) / 86_400_000) + 1
}
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Round axis: steps of 50 up to 300, 100 above — so the target (210 / 280) sits between clean gridlines. */
function niceStep(max: number): number {
  return max <= 300 ? 50 : max <= 700 ? 100 : 200
}
export function niceMax(max: number): number {
  const step = niceStep(max)
  return Math.ceil(max / step) * step
}
export function niceTicks(max: number): number[] {
  const step = niceStep(max)
  const top = niceMax(max)
  const out: number[] = []
  for (let v = 0; v <= top; v += step) out.push(v)
  return out
}

/** Delta of a value vs a reference, as a signed ratio (0.05 = +5%). */
export function relDelta(value: number, ref: number): number {
  return ref > 0 ? value / ref - 1 : 0
}

// ─── Date range ──────────────────────────────────────────────────────────────

export type RangePreset = 'last7' | 'last14' | 'last30' | 'thisMonth' | 'lastMonth' | 'custom'
export interface PerfRange {
  preset: RangePreset
  from: string
  to: string
}

const PRESETS: { key: Exclude<RangePreset, 'custom'>; label: string }[] = [
  { key: 'last7', label: '7D' },
  { key: 'last14', label: '14D' },
  { key: 'last30', label: '30D' },
  { key: 'thisMonth', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
]

/**
 * "Last N days" ends YESTERDAY so every day in the window is complete — a
 * running day would drag averages down. "This Month" runs to today (today is
 * shown but excluded from every total).
 */
export function presetRange(preset: Exclude<RangePreset, 'custom'>, today: string): PerfRange {
  const yesterday = addDays(today, -1)
  const d = utc(today)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const iso = (dt: Date) => dt.toISOString().slice(0, 10)
  switch (preset) {
    case 'last7': return { preset, from: addDays(yesterday, -6), to: yesterday }
    case 'last14': return { preset, from: addDays(yesterday, -13), to: yesterday }
    case 'last30': return { preset, from: addDays(yesterday, -29), to: yesterday }
    case 'thisMonth': {
      const first = iso(new Date(Date.UTC(y, m, 1)))
      // on the 1st, "this month" would be today only → fall back to yesterday's month
      return first === today
        ? { preset, from: iso(new Date(Date.UTC(y, m - 1, 1))), to: yesterday }
        : { preset, from: first, to: today }
    }
    case 'lastMonth':
      return { preset, from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) }
  }
}

export function RangePicker({ value, today, onChange }: { value: PerfRange; today: string; onChange: (r: PerfRange) => void }) {
  const minFrom = addDays(value.to, -(PERF_MAX_RANGE_DAYS - 1))
  return (
    <>
      <div className="preset-btn-group" role="group" aria-label="Date range">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`preset-btn${value.preset === p.key ? ' preset-btn--active' : ''}`}
            aria-pressed={value.preset === p.key}
            onClick={() => onChange(presetRange(p.key, today))}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className={`preset-btn${value.preset === 'custom' ? ' preset-btn--active' : ''}`}
          aria-pressed={value.preset === 'custom'}
          onClick={() => onChange({ ...value, preset: 'custom' })}
        >
          Custom
        </button>
      </div>
      {value.preset === 'custom' && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input
            type="date"
            className="perf-date-input"
            aria-label="From date"
            value={value.from}
            min={minFrom}
            max={value.to}
            onChange={(e) => e.target.value && onChange({ preset: 'custom', from: e.target.value, to: value.to })}
          />
          <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>→</span>
          <input
            type="date"
            className="perf-date-input"
            aria-label="To date"
            value={value.to}
            min={value.from}
            max={today}
            onChange={(e) => {
              const to = e.target.value
              if (!to) return
              // keep the window inside the server limit
              const from = dayCount(value.from, to) > PERF_MAX_RANGE_DAYS ? addDays(to, -(PERF_MAX_RANGE_DAYS - 1)) : value.from
              onChange({ preset: 'custom', from, to })
            }}
          />
        </div>
      )}
    </>
  )
}

// ─── Small components ────────────────────────────────────────────────────────

const PILL_ICON: Record<PerfDayOutcome, ReactNode> = {
  MET: <path d="M5 12.5l4.2 4.2L19 7" />,
  NEAR: <path d="M5 12h14" />,
  BELOW: <path d="M12 5v14M6 13l6 6 6-6" />,
  OFF: <circle cx="12" cy="12" r="3" />,
  IN_PROGRESS: <path d="M12 7v5l3 2" />,
}

export function OutcomeIcon({ outcome, size = 12 }: { outcome: PerfDayOutcome; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PILL_ICON[outcome]}
    </svg>
  )
}

const STATUS_SHORT: Record<PerfStatus, string> = {
  TARGET_ACHIEVED: 'Achieved',
  NEAR_TARGET: 'Near',
  BELOW_TARGET: 'Below',
  NO_ACTIVITY: 'No activity',
}

export function StatusPill({ status, short = false }: { status: PerfStatus; short?: boolean }) {
  const outcome = STATUS_OUTCOME[status]
  return (
    <span className={`perf-pill perf-pill--${outcome}`} title={short ? PERF_STATUS_LABEL[status] : undefined}>
      <OutcomeIcon outcome={outcome} />
      {short ? STATUS_SHORT[status] : PERF_STATUS_LABEL[status]}
    </span>
  )
}

export function OutcomePill({ day }: { day: PerfDay }) {
  const label = day.outcome === 'OFF'
    ? (day.attendance ? ATTENDANCE_TEXT[day.attendance] : 'No work')
    : day.outcome === 'IN_PROGRESS' ? 'In progress'
    : day.outcome === 'MET' ? 'Met' : day.outcome === 'NEAR' ? 'Near' : 'Below'
  return (
    <span className={`perf-pill perf-pill--${day.outcome}`}>
      <OutcomeIcon outcome={day.outcome} />
      {label}
    </span>
  )
}

export function Delta({ value, suffix = '' }: { value: number; suffix?: string }) {
  const pct = Math.round(value * 1000) / 10
  const dir = pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat'
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■'
  return (
    <span className={`perf-delta perf-delta--${dir}`}>
      <span aria-hidden="true" style={{ fontSize: 8 }}>{arrow}</span>
      {pct > 0 ? '+' : ''}{pct.toFixed(1)}%{suffix}
    </span>
  )
}

export function KpiTile({
  label, value, unit, sub, color, icon, progress,
}: {
  label: string
  value: ReactNode
  unit?: string
  sub?: ReactNode
  color?: string
  icon?: ReactNode
  /** 0–1+ ratio shown as a thin progress track (capped at 100%). */
  progress?: number
}) {
  return (
    <div className="perf-kpi" style={color ? ({ ['--kpi' as string]: color } as React.CSSProperties) : undefined}>
      <div className="perf-kpi-label">
        {icon && <span className="perf-kpi-icon">{icon}</span>}
        {label}
      </div>
      <div className="perf-kpi-value">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      {sub && <div className="perf-kpi-sub">{sub}</div>}
      {progress !== undefined && (
        <div className="perf-kpi-track" role="presentation">
          <span style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
        </div>
      )}
    </div>
  )
}

export function Card({ title, sub, actions, flush, children }: {
  title: string
  sub?: ReactNode
  actions?: ReactNode
  flush?: boolean
  children: ReactNode
}) {
  return (
    <section className="perf-card">
      <header className="perf-card-head">
        <div>
          <h3 className="perf-card-title">{title}</h3>
          {sub && <p className="perf-card-sub">{sub}</p>}
        </div>
        {actions}
      </header>
      <div className={flush ? 'perf-card-body--flush' : 'perf-card-body'}>{children}</div>
    </section>
  )
}

export function OutcomeLegend({ showLeave = false, showHalf = false }: { showLeave?: boolean; showHalf?: boolean }) {
  return (
    <div className="perf-legend">
      {(['MET', 'NEAR', 'BELOW'] as const).map((o) => (
        <span key={o} className="perf-legend-item">
          <span className="perf-swatch" style={{ background: OUTCOME_COLOR[o].fill }} />
          {OUTCOME_COLOR[o].label}
        </span>
      ))}
      {showLeave && (
        <span className="perf-legend-item">
          <span className="perf-swatch" style={{ background: '#e2e8f0' }} />
          Off / leave (excluded)
        </span>
      )}
      {showHalf && (
        <span className="perf-legend-item">
          <b style={{ fontSize: 11 }}>½</b> Half day (half target)
        </span>
      )}
    </div>
  )
}

/**
 * Legend-less ring (the caller renders its own labelled list). Segments are
 * separated by a small surface gap; hovering a segment shows a native tooltip.
 */
export function MixRing({ segments, centerValue, centerLabel, size = 172, thickness = 22 }: {
  segments: { label: string; value: number; color: string }[]
  centerValue: ReactNode
  centerLabel: string
  size?: number
  thickness?: number
}) {
  const total = segments.reduce((a, b) => a + b.value, 0)
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const nonZero = segments.filter((x) => x.value > 0).length
  const gap = nonZero > 1 ? 3 : 0
  let acc = 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
      aria-label={segments.map((x) => `${x.label} ${x.value}`).join(', ')} style={{ display: 'block' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={thickness} />
      {total > 0 && segments.map((seg) => {
        if (seg.value === 0) return null
        const len = (seg.value / total) * c
        const start = acc
        acc += len
        return (
          <circle key={seg.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={seg.color} strokeWidth={thickness}
            strokeDasharray={`${Math.max(0, len - gap)} ${c}`} strokeDashoffset={-start}
            transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray .6s ease' }}>
            <title>{`${seg.label}: ${seg.value} (${((seg.value / total) * 100).toFixed(1)}%)`}</title>
          </circle>
        )
      })}
      <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 26, fontWeight: 800, fill: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
        {centerValue}
      </text>
      <text x="50%" y="62%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 10, fontWeight: 700, fill: '#64748b', letterSpacing: '.07em' }}>
        {centerLabel.toUpperCase()}
      </text>
    </svg>
  )
}

/** Dark tooltip shell used by every recharts chart in these tabs. */
export function TipShell({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="perf-tip">
      <div className="perf-tip-title">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="perf-tip-row">
          <span>
            {r.color && <i className="perf-tip-dot" style={{ background: r.color }} />}
            {r.label}
          </span>
          <b>{r.value}</b>
        </div>
      ))}
    </div>
  )
}

export function LoadingBlock() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} aria-busy="true" aria-label="Loading">
      <div className="perf-kpis">
        {Array.from({ length: 5 }, (_, i) => <div key={i} className="perf-skeleton" style={{ height: 104 }} />)}
      </div>
      <div className="perf-skeleton" style={{ height: 320 }} />
      <div className="perf-skeleton" style={{ height: 380 }} />
    </div>
  )
}

export function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="perf-note" role="alert" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }}>
      <strong style={{ color: '#991b1b' }}>Could not load the report.</strong> {message}
    </div>
  )
}

export function apiError(err: unknown): string {
  const e = err as { response?: { data?: { error?: string } }; message?: string }
  return e?.response?.data?.error ?? e?.message ?? 'Please try again.'
}

// ─── Icons (inline, stroke) ──────────────────────────────────────────────────

const ico = (d: ReactNode) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
)
export const Icons = {
  target: ico(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></>),
  box: ico(<><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /></>),
  avg: ico(<><path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 15l4-4 3 3 5-6" /></>),
  check: ico(<><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.8 2.8L16 10" /></>),
  hit: ico(<><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /><circle cx="12" cy="12" r="5" /></>),
  calendar: ico(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  star: ico(<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />),
  users: ico(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></>),
  download: ico(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></>),
}
