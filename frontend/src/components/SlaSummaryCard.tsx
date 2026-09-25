import NumberTicker from './shared/NumberTicker'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SlaSummary {
  d0: number
  d1: number
  d2: number
  d3: number
  d4: number
  escalatedToday?: number
}

interface SlaSummaryCardProps {
  slaSummary: SlaSummary
  loading?: boolean
}

// ─── SLA config ───────────────────────────────────────────────────────────────

const SLA_KEYS = ['d0', 'd1', 'd2', 'd3', 'd4'] as const
type SlaKey = typeof SLA_KEYS[number]

const SLA_COLOR: Record<SlaKey, string> = {
  d0: '#10b981',
  d1: '#f59e0b',
  d2: '#f97316',
  d3: '#ef4444',
  d4: '#dc2626',
}

const SLA_LABEL: Record<SlaKey, string> = {
  d0: 'On Time',
  d1: '4 – 8 h',
  d2: '8 – 12 h',
  d3: '12 – 16 h',
  d4: '16 h+',
}

const SLA_BADGE: Record<SlaKey, string> = {
  d0: 'D0', d1: 'D1', d2: 'D2', d3: 'D3', d4: 'D4',
}

const SIZE = 168
const STROKE = 18
const R = (SIZE - STROKE) / 2
const CIRC = 2 * Math.PI * R
const GAP = 2 // px gap between segments

// ─── Component ────────────────────────────────────────────────────────────────

export default function SlaSummaryCard({ slaSummary, loading = false }: SlaSummaryCardProps) {
  const slaTotal = SLA_KEYS.reduce((s, k) => s + slaSummary[k], 0)
  const escalatedToday = slaSummary.escalatedToday ?? 0
  const onTimePct = slaTotal > 0 ? Math.round((slaSummary.d0 / slaTotal) * 100) : 0
  const peak = Math.max(1, ...SLA_KEYS.map((k) => slaSummary[k]))

  // Donut segments — each one starts where the previous ended.
  const visible = SLA_KEYS.filter((k) => slaSummary[k] > 0)
  let offset = 0
  const segments = visible.map((key) => {
    const len = (slaSummary[key] / slaTotal) * CIRC
    const dash = Math.max(0, len - (visible.length > 1 ? GAP : 0))
    const seg = { key, dash, offset }
    offset += len
    return seg
  })

  return (
    <div className="db-card" style={{ height: '100%', boxSizing: 'border-box' }}>
      <div className="db-card-head">
        <div>
          <h3 className="db-card-title">SLA Breakdown</h3>
          <p className="db-card-sub">Open orders by delay level</p>
        </div>
        {escalatedToday > 0 && (
          <span className="db-pill db-pill--warn">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
            {loading ? '—' : escalatedToday} escalated today
          </span>
        )}
      </div>

      <div className="db-sla">
        {/* Donut */}
        <div className="db-donut" role="img" aria-label={`${slaTotal} open orders, ${onTimePct}% on time`}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
            <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#eef2f7" strokeWidth={STROKE} />
            {!loading && segments.map((s) => (
              <circle
                key={s.key}
                cx={SIZE / 2} cy={SIZE / 2} r={R}
                fill="none"
                stroke={SLA_COLOR[s.key]}
                strokeWidth={STROKE}
                strokeDasharray={`${s.dash} ${CIRC}`}
                strokeDashoffset={-s.offset}
              >
                <title>{`${SLA_BADGE[s.key]} (${SLA_LABEL[s.key]}): ${slaSummary[s.key]} orders`}</title>
              </circle>
            ))}
          </svg>
          <div className="db-donut-center">
            <div className="db-donut-value">{loading ? '—' : <NumberTicker value={slaTotal} />}</div>
            <div className="db-donut-label">open orders</div>
            {!loading && slaTotal > 0 && (
              <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: SLA_COLOR.d0 }}>
                {onTimePct}% on time
              </div>
            )}
          </div>
        </div>

        {/* Rows */}
        <div className="db-sla-list">
          {SLA_KEYS.map((key) => {
            const count = slaSummary[key]
            const pct = slaTotal > 0 ? ((count / slaTotal) * 100).toFixed(1) : '0.0'
            const alert = key === 'd4' && count > 0
            return (
              <div key={key} className={`db-sla-row${alert ? ' db-sla-row--alert' : ''}`}>
                <span className="db-sla-badge" style={{ color: SLA_COLOR[key], background: `${SLA_COLOR[key]}1a` }}>
                  {SLA_BADGE[key]}
                </span>
                <span className="db-sla-label">{SLA_LABEL[key]}</span>
                <span className="db-floor-track">
                  <span style={{ width: `${loading ? 0 : (count / peak) * 100}%`, background: SLA_COLOR[key] }} />
                </span>
                <span className="db-num" style={alert ? { color: '#dc2626' } : undefined}>
                  {loading ? '—' : count}
                </span>
                <span className="db-sla-pct">{loading ? '—' : `${pct}%`}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
