import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { colors } from '../theme'
import { Carrier, CARRIER_LABELS } from '@dom/shared'
import PageShell from '../components/shared/PageShell'
import StatCard from '../components/shared/StatCard'
import { getDispatchReport, getOrderPipeline, type OrderPipeline } from '../api/dispatch'

type PresetId = 'today' | 'yesterday' | '7' | '30' | 'custom'
const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'today',     label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7',         label: 'Last 7 Days' },
  { id: '30',        label: 'Last 30 Days' },
  { id: 'custom',    label: 'Custom' },
]

function todayManila(): string {
  const ms = Date.now() + 8 * 60 * 60 * 1000
  return new Date(ms).toISOString().slice(0, 10)
}

function shiftDate(dateStr: string, days: number): string {
  const ms = new Date(`${dateStr}T00:00:00.000Z`).getTime() + days * 24 * 60 * 60 * 1000
  return new Date(ms).toISOString().slice(0, 10)
}

function getCarrierLabel(carrierName: string): string {
  return CARRIER_LABELS[carrierName as Carrier] ?? carrierName.replace(/_/g, ' ')
}

const OutboundIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="15" height="13" rx="2" />
    <path d="M16 8h4l3 5v3h-7V8z" />
    <circle cx="5.5" cy="18.5" r="2.5" />
    <circle cx="18.5" cy="18.5" r="2.5" />
  </svg>
)

// ─── Order pipeline funnel ────────────────────────────────────────────────────
const PIPELINE_STAGES = [
  { key: 'inbound',        label: 'Inbound',         color: '#2563eb', bg: '#eff6ff' },
  { key: 'pickerComplete', label: 'Picker Complete', color: '#6366f1', bg: '#eef2ff' },
  { key: 'packerComplete', label: 'Packer Complete', color: '#7c3aed', bg: '#f5f3ff' },
  { key: 'outbound',       label: 'Outbound',        color: '#16a34a', bg: '#f0fdf4' },
] as const

function PipelineFunnel({ data, loading }: { data?: OrderPipeline; loading: boolean }) {
  const values = PIPELINE_STAGES.map((s) => (data ? data[s.key] : 0))
  return (
    <div className="acc-card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '18px 20px', marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Order Pipeline</h3>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
          Inbound → Packer Complete are warehouse milestones (distinct orders that reached each stage). <b>Outbound</b> counts only parcels the Outbound Admin actually scanned out in this range — packed but un-scanned orders are not included. Of those, <b>old orders</b> were packed on an earlier day and shipped now (backlog).
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, flexWrap: 'wrap' }}>
        {PIPELINE_STAGES.map((s, i) => {
          const value = values[i]
          const delta = i === 0 ? null : value - values[i - 1]
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'stretch', flex: '1 1 150px', minWidth: 150 }}>
              {i > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 6px', flexShrink: 0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                  {delta !== null && (
                    <span style={{
                      marginTop: 4, fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                      padding: '1px 7px', borderRadius: 999,
                      color: delta < 0 ? '#b45309' : delta > 0 ? '#2563eb' : '#16a34a',
                      background: delta < 0 ? '#fffbeb' : delta > 0 ? '#eff6ff' : '#f0fdf4',
                      border: `1px solid ${delta < 0 ? '#fde68a' : delta > 0 ? '#bfdbfe' : '#bbf7d0'}`,
                    }}>
                      {delta > 0 ? `+${delta}` : delta}
                    </span>
                  )}
                </div>
              )}
              <div style={{ flex: 1, background: s.bg, border: `1px solid ${s.color}22`, borderTop: `3px solid ${s.color}`, borderRadius: 12, padding: '14px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: s.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
                <div style={{ marginTop: 6, fontSize: 28, fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                  {loading ? '—' : value}
                </div>
                {s.key === 'outbound' && !loading && data && data.oldOrders > 0 && (
                  <div style={{
                    marginTop: 8, display: 'inline-block', fontSize: 10.5, fontWeight: 700,
                    color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a',
                    borderRadius: 999, padding: '2px 9px', fontVariantNumeric: 'tabular-nums',
                  }}>
                    incl. {data.oldOrders} old {data.oldOrders === 1 ? 'order' : 'orders'}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function OutboundReport() {
  const user = useAuthStore((s) => s.user)
  const today = todayManila()
  // Default to "Today" so the figures line up with the Outbound board (which also
  // lands on today) — selecting the same single day on both now yields identical counts.
  const [presetId, setPresetId] = useState<PresetId>('today')
  const [customFrom, setCustomFrom] = useState<string>(shiftDate(today, -6))
  const [customTo, setCustomTo] = useState<string>(today)

  const { from, to } = useMemo(() => {
    switch (presetId) {
      case 'today':     return { from: today, to: today }
      case 'yesterday': { const y = shiftDate(today, -1); return { from: y, to: y } }
      case '7':         return { from: shiftDate(today, -6), to: today }
      case '30':        return { from: shiftDate(today, -29), to: today }
      case 'custom':    return { from: customFrom, to: customTo }
    }
  }, [presetId, customFrom, customTo, today])

  const isSingleDay = from === to

  const { data, isLoading } = useQuery({
    queryKey: ['dispatch-report', from, to],
    queryFn: () => getDispatchReport(from, to),
  })

  const { data: pipeline, isLoading: pipelineLoading } = useQuery({
    queryKey: ['dispatch-pipeline', from, to],
    queryFn: () => getOrderPipeline(from, to),
  })

  const carriers = data?.carriers ?? []
  const totals = data?.totals ?? { total: 0, inHouse: 0, external: 0 }
  const maxTotal = carriers.reduce((m, c) => Math.max(m, c.total), 0)

  const headerStats = (
    <>
      <StatCard label="Total Parcels" value={totals.total} color={colors.primary} />
      <StatCard label="In-house" value={totals.inHouse} color={colors.success} />
      <StatCard label="External" value={totals.external} color="#f59e0b" />
    </>
  )

  return (
    <PageShell
      icon={OutboundIcon}
      title="Outbound Report"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
      stats={headerStats}
    >
      {/* Date range — Incident-style presets */}
      <div className="page-hero" style={{ marginBottom: 20 }}>
        <div className="page-hero-content">
          <div className="page-hero-label">Date Range</div>
          <div className="page-hero-title">{isSingleDay ? from : `${from} → ${to}`}</div>
        </div>
        <div className="page-hero-actions">
          <div className="preset-btn-group">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" onClick={() => setPresetId(p.id)} className={`preset-btn${presetId === p.id ? ' preset-btn--active' : ''}`}>{p.label}</button>
            ))}
          </div>
          {presetId === 'custom' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: 'none', fontWeight: 600, color: '#0f172a' }} />
              <span style={{ color: '#fff' }}>→</span>
              <input type="date" value={customTo} min={customFrom} max={today} onChange={(e) => setCustomTo(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: 'none', fontWeight: 600, color: '#0f172a' }} />
            </div>
          )}
        </div>
      </div>

      {/* Order pipeline funnel — reflects the same selected range */}
      <PipelineFunnel data={pipeline} loading={pipelineLoading} />

      {/* Per-carrier table */}
      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '60px 0', color: colors.textMuted, fontSize: 14 }}>
          <span className="spinner spinner-sm" />
          Loading report...
        </div>
      ) : carriers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: colors.textSecondary, fontSize: 14 }}>
          No parcels dispatched in this range.
        </div>
      ) : (
        <div className="data-table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th('left')}>Courier</th>
                <th style={th('right')}>Total</th>
                <th style={th('right')}>In-house</th>
                <th style={th('right')}>External</th>
                <th style={{ ...th('left'), width: '34%' }}>Share</th>
              </tr>
            </thead>
            <tbody>
              {carriers.map((c) => (
                <tr key={c.carrier}>
                  <td style={td('left')}><span style={{ fontWeight: 600, color: colors.textPrimary }}>{getCarrierLabel(c.carrier)}</span></td>
                  <td style={{ ...td('right'), fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{c.total}</td>
                  <td style={{ ...td('right'), fontVariantNumeric: 'tabular-nums', color: colors.success }}>{c.inHouse}</td>
                  <td style={{ ...td('right'), fontVariantNumeric: 'tabular-nums', color: '#b45309' }}>{c.external}</td>
                  <td style={td('left')}>
                    <div style={{ height: 8, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: `${maxTotal > 0 ? Math.round((c.total / maxTotal) * 100) : 0}%`, height: '100%', background: colors.primary, borderRadius: 999 }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  )
}

function th(align: 'left' | 'right'): React.CSSProperties {
  return { padding: '11px 14px', textAlign: align, fontSize: 11, fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }
}
function td(align: 'left' | 'right'): React.CSSProperties {
  return { padding: '11px 14px', textAlign: align, fontSize: 13, verticalAlign: 'middle' }
}
