import NumberTicker from './NumberTicker'
import type { OrderPipeline } from '../../api/dispatch'

// ─── Order pipeline funnel ────────────────────────────────────────────────────
// Shared between the Outbound Report and the Dashboard so both render an
// identical Inbound → Picker Complete → Packer Complete → Outbound funnel.

const PIPELINE_STAGES = [
  { key: 'inbound',        label: 'Inbound',         color: '#2563eb', bg: '#eff6ff' },
  { key: 'pickerComplete', label: 'Picker Complete', color: '#6366f1', bg: '#eef2ff' },
  { key: 'packerComplete', label: 'Packer Complete', color: '#7c3aed', bg: '#f5f3ff' },
  { key: 'outbound',       label: 'Outbound',        color: '#16a34a', bg: '#f0fdf4' },
] as const

const DEFAULT_CAPTION =
  'Inbound → Packer Complete are warehouse milestones (distinct orders that reached each stage). ' +
  'Outbound counts only parcels actually scanned out in this range — packed but un-scanned orders are not included. ' +
  'Of those, old orders were packed on an earlier day and shipped now (backlog).'

export interface OrderPipelineFunnelProps {
  data?: OrderPipeline
  loading: boolean
  /** Optional right-aligned label in the header (e.g. a date range). */
  rangeLabel?: string
  /** Caption under the title. Pass `null` to hide. Defaults to the standard explanation. */
  caption?: string | null
  /** When provided, the "N old orders" badge becomes a clickable drill-down. */
  onOldOrders?: () => void
}

export default function OrderPipelineFunnel({
  data, loading, rangeLabel, caption = DEFAULT_CAPTION, onOldOrders,
}: OrderPipelineFunnelProps) {
  const values = PIPELINE_STAGES.map((s) => (data ? data[s.key] : 0))
  const peak = Math.max(1, ...values)

  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16,
      padding: '20px 22px', marginBottom: 20,
      boxShadow: '0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em' }}>Order Pipeline</h3>
          {caption && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b', maxWidth: 720, lineHeight: 1.45 }}>{caption}</p>}
        </div>
        {rangeLabel && (
          <span style={{
            flexShrink: 0, fontSize: 12, fontWeight: 600, color: '#475569',
            background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 999, padding: '4px 12px',
            fontVariantNumeric: 'tabular-nums',
          }}>{rangeLabel}</span>
        )}
      </div>

      {/* Stages */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, flexWrap: 'wrap' }}>
        {PIPELINE_STAGES.map((s, i) => {
          const value = values[i]
          const delta = i === 0 ? null : value - values[i - 1]
          const fillPct = Math.round((value / peak) * 100)
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'stretch', flex: '1 1 150px', minWidth: 150 }}>
              {i > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 8px', flexShrink: 0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                  {delta !== null && (
                    <span style={{
                      marginTop: 5, fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                      padding: '1px 8px', borderRadius: 999,
                      color: delta < 0 ? '#b45309' : delta > 0 ? '#2563eb' : '#16a34a',
                      background: delta < 0 ? '#fffbeb' : delta > 0 ? '#eff6ff' : '#f0fdf4',
                      border: `1px solid ${delta < 0 ? '#fde68a' : delta > 0 ? '#bfdbfe' : '#bbf7d0'}`,
                    }}>
                      {delta > 0 ? `+${delta}` : delta}
                    </span>
                  )}
                </div>
              )}
              <div style={{
                flex: 1, minWidth: 0,
                background: `linear-gradient(180deg, ${s.bg} 0%, #ffffff 78%)`,
                border: `1px solid ${s.color}22`, borderTop: `3px solid ${s.color}`,
                borderRadius: 12, padding: '14px 12px 13px', textAlign: 'center',
                display: 'flex', flexDirection: 'column',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: s.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
                <div style={{ margin: '6px 0 0', fontSize: 30, fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                  {loading ? '—' : <NumberTicker value={value} />}
                </div>
                {/* mini volume bar — gives each stage a quick visual weight */}
                <div style={{ marginTop: 10, height: 5, background: '#eef2f7', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${loading ? 0 : fillPct}%`, height: '100%', background: s.color, borderRadius: 999, transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)' }} />
                </div>
                {/* old-orders badge on the Outbound stage */}
                {s.key === 'outbound' && !loading && data && data.oldOrders > 0 ? (
                  onOldOrders ? (
                    <button
                      type="button"
                      onClick={onOldOrders}
                      title="View these old orders"
                      style={{
                        marginTop: 9, alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                        fontSize: 10.5, fontWeight: 700, color: '#b45309', background: '#fffbeb',
                        border: '1px solid #fde68a', borderRadius: 999, padding: '3px 9px', fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {data.oldOrders} old {data.oldOrders === 1 ? 'order' : 'orders'}
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                    </button>
                  ) : (
                    <span style={{
                      marginTop: 9, alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 10.5, fontWeight: 700, color: '#b45309', background: '#fffbeb',
                      border: '1px solid #fde68a', borderRadius: 999, padding: '3px 9px', fontVariantNumeric: 'tabular-nums',
                    }}>
                      incl. {data.oldOrders} old
                    </span>
                  )
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
