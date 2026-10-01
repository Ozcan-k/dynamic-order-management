import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import PageShell from '../components/shared/PageShell'
import OrderPipelineFunnel from '../components/shared/OrderPipelineFunnel'
import { getDispatchReport, getOrderPipeline } from '../api/dispatch'
import { getCarrierStyle, getCarrierLabel } from '../components/shared/carrierStyle'
import {
  OutboundIcon, TruckIcon, HouseIcon, ExternalIcon, BoxesIcon, TrophyIcon, KpiTile,
} from '../components/outbound/obUi'
import { pct } from '../components/outbound/obFormat'

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

function daysInclusive(from: string, to: string): number {
  const ms = new Date(`${to}T00:00:00.000Z`).getTime() - new Date(`${from}T00:00:00.000Z`).getTime()
  return Math.max(1, Math.round(ms / 86_400_000) + 1)
}

export default function OutboundReport() {
  const navigate = useNavigate()
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
  const days = daysInclusive(from, to)

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
  const top = carriers[0]
  const avgPerDay = totals.total / days

  return (
    <PageShell
      icon={OutboundIcon}
      title="Outbound Report"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
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
              <input type="date" aria-label="From" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: 'none', fontWeight: 600, color: '#0f172a' }} />
              <span style={{ color: '#fff' }}>→</span>
              <input type="date" aria-label="To" value={customTo} min={customFrom} max={today} onChange={(e) => setCustomTo(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: 'none', fontWeight: 600, color: '#0f172a' }} />
            </div>
          )}
        </div>
      </div>

      <div className="ob-stack">
        <div className="ob-kpis">
          <KpiTile label="Parcels out" icon={<BoxesIcon />} accent="#2563eb" value={totals.total}
            foot={isSingleDay ? 'Scanned out this day' : <><strong>{avgPerDay.toFixed(avgPerDay < 10 ? 1 : 0)}</strong> per day · {days} days</>} />
          <KpiTile label="In-house" icon={<HouseIcon />} accent="#16a34a" value={totals.inHouse}
            foot={<><strong>{pct(totals.inHouse, totals.total)}</strong> of parcels · our orders</>} />
          <KpiTile label="External" icon={<ExternalIcon />} accent="#f59e0b" value={totals.external}
            foot={<><strong>{pct(totals.external, totals.total)}</strong> of parcels · not in system</>} />
          <KpiTile label="Top courier" icon={<TrophyIcon />} accent={top ? getCarrierStyle(top.carrier).headerBg : '#64748b'}
            textValue value={top ? getCarrierLabel(top.carrier) : '—'}
            foot={top ? <><strong>{pct(top.total, totals.total)}</strong> of parcels · {carriers.length} {carriers.length === 1 ? 'courier' : 'couriers'}</> : 'No couriers in range'} />
        </div>

        {/* Order pipeline funnel — reflects the same selected range */}
        <div className="ob-funnel-wrap">
        <OrderPipelineFunnel
          data={pipeline}
          loading={pipelineLoading}
          rangeLabel={isSingleDay ? from : `${from} → ${to}`}
          caption="Inbound → Packer Complete are warehouse milestones (distinct orders that reached each stage). Outbound counts only parcels the Outbound Admin actually scanned out in this range — packed but un-scanned orders are not included. Of those, old orders were packed on an earlier day and shipped now (backlog); tap the badge to see them."
          onOldOrders={() => navigate(`/outbound/report/old-orders?from=${from}&to=${to}`)}
        />
        </div>

        {/* Per-courier breakdown */}
        <section className="ob-card ob-card--flush">
          <div className="ob-card-head">
            <div>
              <h2 className="ob-card-title">Couriers</h2>
              <p className="ob-card-sub">Parcels scanned out per courier, split into in-house and external.</p>
            </div>
            <span className="ob-legend-inline">
              <span><i />In-house</span>
              <span><i className="ext" />External</span>
            </span>
          </div>

          {isLoading ? (
            <div className="ob-empty"><span className="spinner spinner-sm" />Loading report…</div>
          ) : carriers.length === 0 ? (
            <div className="ob-empty">
              <div className="ob-empty-icon"><TruckIcon size={24} /></div>
              <div className="ob-empty-title">No parcels dispatched in this range</div>
              Try a wider date range.
            </div>
          ) : (
            <div className="ob-rows">
              <div className="ob-row ob-row--head">
                <span>Courier</span>
                <span>In-house · External</span>
                <span style={{ textAlign: 'right' }}>Total</span>
                <span style={{ textAlign: 'right' }}>Share</span>
              </div>
              {carriers.map((c) => {
                const color = getCarrierStyle(c.carrier).headerBg
                const width = maxTotal > 0 ? (c.total / maxTotal) * 100 : 0
                return (
                  <div key={c.carrier} className="ob-row">
                    <span className="ob-row-name">
                      <span className="ob-dot" style={{ background: color }} />
                      <span>{getCarrierLabel(c.carrier)}</span>
                    </span>
                    <div className="ob-row-bar">
                      <div className="ob-split" style={{ width: `${Math.max(width, 3)}%` }}
                        title={`In-house ${c.inHouse} · External ${c.external}`}>
                        {c.inHouse > 0 && <span style={{ flexGrow: c.inHouse, background: color }} />}
                        {c.external > 0 && <span className="ob-split-ext" style={{ flexGrow: c.external, background: color }} />}
                      </div>
                      <div className="ob-split-caption">{c.inHouse} in-house · {c.external} external</div>
                    </div>
                    <span className="ob-row-total">{c.total}</span>
                    <span className="ob-row-share">{pct(c.total, totals.total)}</span>
                  </div>
                )
              })}
              <div className="ob-row ob-row-foot">
                <span className="ob-row-name">All couriers</span>
                <span className="ob-row-bar ob-split-caption" style={{ marginTop: 0 }}>{totals.inHouse} in-house · {totals.external} external</span>
                <span className="ob-row-total">{totals.total}</span>
                <span className="ob-row-share">100%</span>
              </div>
            </div>
          )}
        </section>
      </div>
    </PageShell>
  )
}
