import { SALES_TARGET_INFO, type TargetProgress, type TargetStatus } from '@dom/shared'
import { STATUS_META, fmtValue, overallColor, pctText } from './targetFormat'

// Monthly targets UI kit (v2.94.0): status chip, progress bar with a pace marker, overall ring.

export function StatusChip({ status }: { status: TargetStatus | null }) {
  if (!status) return <span className="tg-chip tg-chip--off">Not tracked</span>
  const m = STATUS_META[status]
  return <span className="tg-chip" style={{ color: m.color, background: m.bg }}>{m.label}</span>
}

/** One metric row: label, bar (fill = actual, tick = where the pace says it should be today). */
export function TargetBar({ p, compact }: { p: TargetProgress; compact?: boolean }) {
  const info = SALES_TARGET_INFO[p.metric]
  if (p.target === null) {
    return (
      <div className="tg-row is-off">
        <div className="tg-row-top"><span className="tg-row-label">{info.label}</span><span className="tg-row-val">Not tracked</span></div>
        <div className="tg-track" />
      </div>
    )
  }
  const color = p.status ? STATUS_META[p.status].color : '#94a3b8'
  const fill = Math.min(100, (p.pct ?? 0) * 100)
  const tick = p.expected != null ? Math.min(100, (p.expected / p.target) * 100) : null
  const title = `${info.label}: ${fmtValue(p.metric, p.actual)} of ${fmtValue(p.metric, p.target)} (${pctText(p.pct)})`
    + (p.expected != null ? ` · expected by today ${fmtValue(p.metric, p.expected)}` : '')
    + (p.projected != null ? ` · month-end projection ${fmtValue(p.metric, p.projected)}` : '')
  return (
    <div className="tg-row" title={title}>
      <div className="tg-row-top">
        <span className="tg-row-label">{info.label}</span>
        <span className="tg-row-val">
          <b>{fmtValue(p.metric, p.actual, compact)}</b>
          <span> / {fmtValue(p.metric, p.target, compact)}</span>
          <em style={{ color }}>{pctText(p.pct)}</em>
        </span>
      </div>
      <div className="tg-track" role="img" aria-label={title}>
        <i style={{ width: `${fill}%`, background: color }} />
        {tick != null && <span className="tg-tick" style={{ left: `${tick}%` }} />}
      </div>
      {!compact && p.projected != null && (
        <small className="tg-row-sub">
          {p.status === 'MET' ? 'Target reached' : `Projected ${fmtValue(p.metric, p.projected, true)} by month-end`}
          {p.expected != null && p.status !== 'MET' ? ` · pace ${fmtValue(p.metric, p.expected, true)} by today` : ''}
        </small>
      )}
    </div>
  )
}

/** Small ring for the overall achievement. */
export function OverallRing({ value, size = 56 }: { value: number | null; size?: number }) {
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  const v = Math.min(1, value ?? 0)
  const color = overallColor(value)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Overall ${pctText(value)}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={6} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
        strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size / 4.2} fontWeight={800} fill="#0f172a">{pctText(value)}</text>
    </svg>
  )
}
