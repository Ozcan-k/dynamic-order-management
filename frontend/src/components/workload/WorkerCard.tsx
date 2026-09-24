import { AttendanceStatus, type PerfRole } from '@dom/shared'
import { minutesLabel, ROLE_TEXT, STATE_META, type WorkerView } from './model'

const OUTCOME: Record<string, { label: string; color: string }> = {
  MET: { label: 'On track', color: '#15803d' },
  NEAR: { label: 'Near target', color: '#b45309' },
  BELOW: { label: 'Behind', color: '#b91c1c' },
}

const ATTENDANCE_BADGE: Partial<Record<AttendanceStatus, string>> = {
  [AttendanceStatus.HALF_DAY]: 'Half day',
  [AttendanceStatus.ABSENT]: 'Absent',
  [AttendanceStatus.DAY_OFF]: 'Day off',
  [AttendanceStatus.VACATION_LEAVE]: 'Vacation leave',
  [AttendanceStatus.SICK_LEAVE]: 'Sick leave',
  [AttendanceStatus.MATERNITY_LEAVE]: 'Maternity leave',
  [AttendanceStatus.PARTIAL_DAY]: 'Partial day',
}

function initials(name: string): string {
  const parts = name.replace(/[-_.]/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

interface Props {
  role: PerfRole
  worker: WorkerView
  currentHour: number | null
  onOpen: () => void
  onPrefetch?: () => void
}

export default function WorkerCard({ role, worker: w, currentHour, onOpen, onPrefetch }: Props) {
  const lw = w.live
  const meta = w.state ? STATE_META[w.state] : null
  const accent = ROLE_TEXT[role].accent
  const target = lw?.target ?? 0
  const done = w.completedToday
  const progress = target > 0 ? Math.min(1, done / target) : 0
  const projected = lw && target > 0 ? Math.min(1.15, lw.projected / target) : null
  const outcome = lw && target > 0 && lw.outcome in OUTCOME ? OUTCOME[lw.outcome] : null
  const attendance = lw?.attendance ? ATTENDANCE_BADGE[lw.attendance] : undefined
  const inHand = lw?.inHand ?? null
  const queued = lw ? Math.max(0, w.active - lw.inHand) : null

  // Hourly rhythm from the first active hour up to now
  const hourly = lw?.hourly ?? []
  const firstHour = hourly.findIndex((v) => v > 0)
  const lastHour = currentHour ?? (hourly.length ? hourly.length - 1 : -1)
  const bars = firstHour >= 0 && lastHour >= firstHour ? hourly.slice(firstHour, lastHour + 1) : []
  const barMax = Math.max(1, ...bars)

  const stateLabel = w.state === 'IDLE' && lw?.minutesSinceLast != null
    ? `Idle ${lw.minutesSinceLast}m`
    : meta?.label

  return (
    <button
      type="button"
      className={`wl-card${w.flag === 'HEAVY' ? ' wl-card--heavy' : ''}${w.flag === 'NEEDS_WORK' ? ' wl-card--free' : ''}${w.state === 'OFF' || w.state === 'NO_ACTIVITY' ? ' wl-card--off' : ''}`}
      style={{ '--wl-accent': accent } as React.CSSProperties}
      onClick={onOpen}
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
      aria-label={`${w.username}: ${stateLabel ?? 'status unknown'}, ${done} ${ROLE_TEXT[role].verb} today, ${w.active} open`}
    >
      <div className="wl-card-head">
        <span className="wl-avatar" aria-hidden="true">{initials(lw?.displayName || w.username)}</span>
        <div className="wl-card-name">
          <strong>{w.username}</strong>
          {lw?.linked && lw.displayName !== w.username && <span>{lw.displayName}{lw.empNo ? ` · ${lw.empNo}` : ''}</span>}
        </div>
        {meta && (
          <span className="wl-state" style={{ color: meta.color, background: meta.bg }}>
            <i style={{ background: meta.color }} className={w.state === 'WORKING' ? 'wl-blink' : undefined} />
            {stateLabel}
          </span>
        )}
      </div>

      {(attendance || w.flag) && (
        <div className="wl-badges">
          {attendance && <span className="wl-badge wl-badge--att">{attendance}</span>}
          {w.flag === 'HEAVY' && <span className="wl-badge wl-badge--heavy">Heavy queue</span>}
          {w.flag === 'NEEDS_WORK' && <span className="wl-badge wl-badge--free">Can take more</span>}
        </div>
      )}

      {lw && target > 0 ? (
        <div className="wl-progress">
          <div className="wl-progress-top">
            <span className="wl-done"><b>{done}</b> / {target}</span>
            {outcome && <span className="wl-outcome" style={{ color: outcome.color }}>{outcome.label}</span>}
          </div>
          <div className="wl-track" title={`Projected by shift end: ${lw.projected}`}>
            <span className="wl-fill" style={{ width: `${progress * 100}%` }} />
            {projected !== null && lw.completed > 0 && (
              <i className="wl-proj" style={{ left: `${Math.min(100, projected * 100)}%` }} />
            )}
          </div>
          {lw.completed > 0 && <div className="wl-proj-label">Projected {lw.projected} by shift end</div>}
        </div>
      ) : (
        <div className="wl-progress wl-progress--plain">
          <span className="wl-done"><b>{done}</b> {ROLE_TEXT[role].verb} today</span>
        </div>
      )}

      <div className="wl-chips">
        {inHand !== null && queued !== null ? (
          <>
            <span className={`wl-chip${inHand === 0 ? ' wl-chip--zero' : ''}`}>In hand <b>{inHand}</b></span>
            <span className={`wl-chip${queued === 0 ? ' wl-chip--zero' : ''}${w.flag === 'HEAVY' ? ' wl-chip--warn' : ''}`}>Queue <b>{queued}</b></span>
          </>
        ) : (
          <span className={`wl-chip${w.active === 0 ? ' wl-chip--zero' : ''}`}>Active <b>{w.active}</b></span>
        )}
        {(w.returned ?? 0) > 0 && <span className="wl-chip wl-chip--warn">↩ Returned <b>{w.returned}</b></span>}
      </div>

      {lw && (lw.completed > 0 || lw.lastAt) && (
        <div className="wl-foot">
          {bars.length > 0 && (
            <svg className="wl-bars" viewBox={`0 0 ${bars.length * 6} 22`} preserveAspectRatio="none" aria-hidden="true">
              {bars.map((v, i) => {
                const h = Math.max(v > 0 ? 2 : 0, (v / barMax) * 20)
                return <rect key={i} x={i * 6 + 0.5} y={22 - h} width={5} height={h} rx={1.5} fill={i === bars.length - 1 && currentHour !== null ? accent : `color-mix(in srgb, ${accent} 45%, #fff)`} />
              })}
            </svg>
          )}
          <span className="wl-foot-stats">
            <b>{lw.pacePerHour.toFixed(0)}</b>/h · last hr <b>{lw.lastHour}</b>
            {lw.minutesSinceLast != null && <> · {minutesLabel(lw.minutesSinceLast)}</>}
          </span>
        </div>
      )}
    </button>
  )
}
