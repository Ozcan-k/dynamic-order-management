import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { colors } from '../theme'
import { Carrier, CARRIER_LABELS } from '@dom/shared'
import { getManilaDateString } from '../lib/manila'
import { addDays } from '../components/shared/DateNavigator'
import PageShell from '../components/shared/PageShell'
import StatCard from '../components/shared/StatCard'
import { getDispatchGrouped, getDispatchStats, type CarrierGroup } from '../api/dispatch'

// ─── Carrier display config — dynamic palette ────────────────────────────────

interface CarrierStyle {
  headerBg: string
  headerText: string
  badgeBg: string
  badgeText: string
  border: string
}

const COLOR_PALETTE: CarrierStyle[] = [
  { headerBg: '#1d4ed8', headerText: '#fff', badgeBg: '#dbeafe', badgeText: '#1e40af', border: '#bfdbfe' },
  { headerBg: '#dc2626', headerText: '#fff', badgeBg: '#fee2e2', badgeText: '#b91c1c', border: '#fecaca' },
  { headerBg: '#15803d', headerText: '#fff', badgeBg: '#dcfce7', badgeText: '#166534', border: '#bbf7d0' },
  { headerBg: '#7c3aed', headerText: '#fff', badgeBg: '#ede9fe', badgeText: '#6d28d9', border: '#ddd6fe' },
  { headerBg: '#ea580c', headerText: '#fff', badgeBg: '#ffedd5', badgeText: '#c2410c', border: '#fed7aa' },
  { headerBg: '#0f766e', headerText: '#fff', badgeBg: '#ccfbf1', badgeText: '#115e59', border: '#99f6e4' },
  { headerBg: '#be185d', headerText: '#fff', badgeBg: '#fce7f3', badgeText: '#9d174d', border: '#fbcfe8' },
  { headerBg: '#4338ca', headerText: '#fff', badgeBg: '#e0e7ff', badgeText: '#3730a3', border: '#c7d2fe' },
  { headerBg: '#b45309', headerText: '#fff', badgeBg: '#fef3c7', badgeText: '#92400e', border: '#fde68a' },
  { headerBg: '#0e7490', headerText: '#fff', badgeBg: '#cffafe', badgeText: '#164e63', border: '#a5f3fc' },
]

function hashCarrier(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return h % COLOR_PALETTE.length
}
function getCarrierStyle(carrierName: string): CarrierStyle { return COLOR_PALETTE[hashCarrier(carrierName)] }
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

const TruckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="15" height="13" rx="2" />
    <path d="M16 8h4l3 5v3h-7V8z" />
    <circle cx="5.5" cy="18.5" r="2.5" />
    <circle cx="18.5" cy="18.5" r="2.5" />
  </svg>
)

const ShopIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
    <line x1="3" y1="6" x2="21" y2="6"/>
    <path d="M16 10a4 4 0 0 1-8 0"/>
  </svg>
)

function CarrierCard({ group }: { group: CarrierGroup }) {
  const style = getCarrierStyle(group.carrierName)
  const label = getCarrierLabel(group.carrierName)
  return (
    <div style={{ background: '#fff', border: `1px solid ${style.border}`, borderRadius: '14px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <div style={{ background: style.headerBg, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.18)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: style.headerText, flexShrink: 0 }}>
            <TruckIcon />
          </div>
          <span style={{ fontWeight: 700, fontSize: '14px', color: style.headerText, letterSpacing: '-0.2px' }}>{label}</span>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.22)', borderRadius: '20px', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
          <span style={{ fontWeight: 800, fontSize: '18px', color: style.headerText, lineHeight: 1 }}>{group.totalOrders}</span>
          <span style={{ fontSize: '11px', color: `${style.headerText}cc`, fontWeight: 500 }}>parcels</span>
        </div>
      </div>
      <div style={{ padding: '10px 0' }}>
        {group.shops.map((shop, i) => (
          <div key={shop.shopName} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 18px', borderBottom: i < group.shops.length - 1 ? `1px solid #f1f5f9` : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#94a3b8', display: 'flex' }}><ShopIcon /></span>
              <span style={{ fontSize: '13px', fontWeight: 500, color: colors.textPrimary }}>{shop.shopName.replace(/_/g, ' ')}</span>
            </div>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 28, height: 22, background: style.badgeBg, color: style.badgeText, borderRadius: '20px', fontSize: '12px', fontWeight: 700, padding: '0 8px' }}>
              {shop.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function OutboundBoard() {
  const user = useAuthStore((s) => s.user)
  const todayStr = getManilaDateString()
  const yesterdayStr = addDays(todayStr, -1)
  // '' = today (live polling); any YYYY-MM-DD = historical snapshot
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [carrierSort, setCarrierSort] = useState<'name' | 'volume'>('volume')

  const isHistorical = selectedDate !== ''
  const activeDate = selectedDate || todayStr
  const queryDate = isHistorical ? selectedDate : undefined

  const { data: groups, isLoading: groupsLoading } = useQuery({
    queryKey: ['dispatch-grouped', selectedDate],
    queryFn: () => getDispatchGrouped(queryDate),
    refetchInterval: isHistorical ? false : 10_000,
  })
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dispatch-stats', selectedDate],
    queryFn: () => getDispatchStats(queryDate),
    refetchInterval: isHistorical ? false : 10_000,
  })

  const isLoading = groupsLoading || statsLoading
  const carrierGroups = groups ?? []
  const sortedCarrierGroups = useMemo(() => {
    const list = [...carrierGroups]
    if (carrierSort === 'name') list.sort((a, b) => getCarrierLabel(a.carrierName).localeCompare(getCarrierLabel(b.carrierName)))
    else list.sort((a, b) => b.totalOrders - a.totalOrders)
    return list
  }, [carrierGroups, carrierSort])

  // Which preset is active
  const preset: 'today' | 'yesterday' | 'custom' =
    selectedDate === '' ? 'today' : selectedDate === yesterdayStr ? 'yesterday' : 'custom'

  const headerStats = (
    <>
      <StatCard label="Total Parcels" value={stats?.total ?? 0} color={colors.primary} />
      <StatCard label="In-house" value={stats?.inHouse ?? 0} color={colors.success} />
      <StatCard label="External" value={stats?.external ?? 0} color="#f59e0b" />
    </>
  )

  return (
    <PageShell
      icon={OutboundIcon}
      title="Outbound"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
      stats={headerStats}
    >
      {/* Date control — Incident-style pills (single day) */}
      <div className="page-hero" style={{ marginBottom: 20 }}>
        <div className="page-hero-content">
          <div className="page-hero-label">Dispatch Day</div>
          <div className="page-hero-title">
            {preset === 'today' ? `Today · ${todayStr}` : activeDate}
          </div>
        </div>
        <div className="page-hero-actions">
          <div className="preset-btn-group">
            <button type="button" className={`preset-btn${preset === 'today' ? ' preset-btn--active' : ''}`} onClick={() => setSelectedDate('')}>Today</button>
            <button type="button" className={`preset-btn${preset === 'yesterday' ? ' preset-btn--active' : ''}`} onClick={() => setSelectedDate(yesterdayStr)}>Yesterday</button>
            <button type="button" className={`preset-btn${preset === 'custom' ? ' preset-btn--active' : ''}`} onClick={() => setSelectedDate(activeDate === todayStr ? yesterdayStr : activeDate)}>Custom</button>
          </div>
          {preset === 'custom' && (
            <input
              type="date"
              value={activeDate}
              max={todayStr}
              onChange={(e) => setSelectedDate(e.target.value || '')}
              style={{ padding: '8px 10px', borderRadius: 8, border: 'none', fontWeight: 600, color: '#0f172a' }}
            />
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '60px 0', color: colors.textMuted, fontSize: '14px' }}>
          <span className="spinner spinner-sm" />
          Loading parcels...
        </div>
      ) : carrierGroups.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, background: 'linear-gradient(135deg, #f1f5f9, #e2e8f0)', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', color: '#94a3b8' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="3" width="15" height="13" rx="2" />
              <path d="M16 8h4l3 5v3h-7V8z" />
              <circle cx="5.5" cy="18.5" r="2.5" />
              <circle cx="18.5" cy="18.5" r="2.5" />
            </svg>
          </div>
          <div style={{ fontWeight: 700, fontSize: '15px', color: colors.textPrimary, marginBottom: '6px' }}>
            {preset === 'today' ? 'No parcels dispatched yet today' : `No parcels dispatched on ${activeDate}`}
          </div>
          <div style={{ fontSize: '13px', color: colors.textSecondary }}>
            Scan parcels from the handheld Outbound station to see them here.
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Sort</span>
            <div style={{ display: 'inline-flex', background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 999, padding: 3, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
              {([{ k: 'volume', label: 'Volume' }, { k: 'name', label: 'Name' }] as const).map((opt) => {
                const active = carrierSort === opt.k
                return (
                  <button key={opt.k} onClick={() => setCarrierSort(opt.k)} style={{ border: 'none', background: active ? colors.primary : 'transparent', color: active ? '#fff' : colors.textSecondary, fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 999, cursor: 'pointer', transition: 'background 0.15s, color 0.15s' }}>
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {sortedCarrierGroups.map((group) => <CarrierCard key={group.carrierName} group={group} />)}
          </div>
        </>
      )}
    </PageShell>
  )
}
