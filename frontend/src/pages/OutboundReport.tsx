import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { colors } from '../theme'
import { Carrier, CARRIER_LABELS } from '@dom/shared'
import PageShell from '../components/shared/PageShell'
import StatCard from '../components/shared/StatCard'
import { getDispatchReport } from '../api/dispatch'

const PRESET_RANGES = [
  { id: '1',  label: '1 Day',   days: 1 },
  { id: '7',  label: '7 Days',  days: 7 },
  { id: '30', label: '1 Month', days: 30 },
] as const

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

export default function OutboundReport() {
  const user = useAuthStore((s) => s.user)
  const today = todayManila()
  const [presetId, setPresetId] = useState<string>('7')
  const [customFrom, setCustomFrom] = useState<string>(shiftDate(today, -29))
  const [customTo, setCustomTo] = useState<string>(today)

  const { from, to } = useMemo(() => {
    if (presetId === 'custom') return { from: customFrom, to: customTo }
    const days = PRESET_RANGES.find((p) => p.id === presetId)?.days ?? 7
    return { from: shiftDate(today, -(days - 1)), to: today }
  }, [presetId, customFrom, customTo, today])

  const { data, isLoading } = useQuery({
    queryKey: ['dispatch-report', from, to],
    queryFn: () => getDispatchReport(from, to),
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
          <div className="page-hero-title">{from} → {to}</div>
        </div>
        <div className="page-hero-actions">
          <div className="preset-btn-group">
            {PRESET_RANGES.map((p) => (
              <button key={p.id} type="button" onClick={() => setPresetId(p.id)} className={`preset-btn${presetId === p.id ? ' preset-btn--active' : ''}`}>{p.label}</button>
            ))}
            <button type="button" onClick={() => setPresetId('custom')} className={`preset-btn${presetId === 'custom' ? ' preset-btn--active' : ''}`}>Custom</button>
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
