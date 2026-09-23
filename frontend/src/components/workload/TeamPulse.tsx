import type { PerfRole } from '@dom/shared'
import { ROLE_TEXT, STATE_META, type PulseSummary, type WorkloadFilter } from './model'

interface Props {
  role: PerfRole
  summary: PulseSummary
  loading: boolean
  onFilter: (f: WorkloadFilter) => void
}

const CHIPS: { id: WorkloadFilter; label: string; color: string }[] = [
  { id: 'WORKING', label: 'Working', color: STATE_META.WORKING.color },
  { id: 'IDLE', label: 'Idle', color: STATE_META.IDLE.color },
  { id: 'NOT_STARTED', label: 'Not started', color: STATE_META.NOT_STARTED.color },
  { id: 'OFF', label: 'Off / done', color: STATE_META.OFF.color },
]

/** One-line live summary under the clock — click a state to filter the workload cards below. */
export default function TeamPulse({ role, summary: s, loading, onFilter }: Props) {
  const text = ROLE_TEXT[role]
  const progress = s.target > 0 ? Math.min(1, s.completed / s.target) : 0
  const proj = s.target > 0 ? Math.min(1.1, s.projected / s.target) : 0

  function jump(f: WorkloadFilter) {
    onFilter(f)
    document.getElementById('workload-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <section className="wl-pulse" style={{ '--wl-accent': text.accent, '--wl-soft': text.accentSoft } as React.CSSProperties} aria-label={`${text.many} live summary`}>
      <div className="wl-pulse-title">
        <span className="wl-live"><i />LIVE</span>
        <strong>{text.many} on the floor</strong>
      </div>

      <div className="wl-pulse-states" role="group" aria-label="Filter workload by status">
        {CHIPS.map((c) => (
          <button key={c.id} type="button" className="wl-pchip" onClick={() => jump(c.id)} disabled={loading}>
            <i style={{ background: c.color }} />
            {c.label} <b>{loading ? '–' : s.counts[c.id]}</b>
          </button>
        ))}
      </div>

      <div className="wl-pulse-progress" title={s.target ? `Projected ${s.projected} of ${s.target} by shift end` : undefined}>
        <div className="wl-pulse-nums">
          <span><b>{s.completed.toLocaleString('en-US')}</b>{s.target > 0 && <> / {s.target.toLocaleString('en-US')}</>} {text.verb}</span>
          <span className="wl-pulse-meta">{s.pacePerHour.toFixed(0)}/h · last hr {s.lastHour}</span>
        </div>
        {s.target > 0 && (
          <div className="wl-track wl-track--sm">
            <span className="wl-fill" style={{ width: `${progress * 100}%` }} />
            {s.projected > 0 && <i className="wl-proj" style={{ left: `${Math.min(100, proj * 100)}%` }} />}
          </div>
        )}
      </div>

      <div className="wl-pulse-open">
        <span>In hand <b>{s.inHand}</b></span>
        <span>Queue <b>{s.queued}</b></span>
      </div>

      {(s.heaviest || s.available.length > 0) && (
        <div className="wl-pulse-balance" role="status">
          {s.heaviest && <span className="wl-bal-heavy">⚠ {s.heaviest.username} has {s.heaviest.active} open</span>}
          {s.available.length > 0 && (
            <span className="wl-bal-free">
              {s.heaviest ? '→ lightest: ' : 'Can take more: '}
              {s.available.slice(0, 3).map((v) => `${v.username} ${v.active}`).join(', ')}
              {s.available.length > 3 ? ` +${s.available.length - 3}` : ''}
            </span>
          )}
        </div>
      )}
    </section>
  )
}
