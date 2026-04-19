import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'
import { colors } from '../theme'
import { Carrier, CARRIER_LABELS } from '@dom/shared'
import { getManilaDateString } from '../lib/manila'
import PageShell from '../components/shared/PageShell'
import StatCard from '../components/shared/StatCard'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ShopCount {
  shopName: string
  count: number
}

interface CarrierGroup {
  carrierName: string
  totalOrders: number
  shops: ShopCount[]
}

interface OutboundStats {
  waitingCount: number
  dispatchedToday: number
  inboundTotal: number
  outboundTotal: number
  missingCount: number
  d4Count: number
  historical?: boolean
}

// ─── Carrier display config — dynamic palette ────────────────────────────────

interface CarrierStyle {
  headerBg: string
  headerText: string
  badgeBg: string
  badgeText: string
  border: string
}

// 10-color palette — new carriers auto-assigned by name hash
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

function getCarrierStyle(carrierName: string): CarrierStyle {
  return COLOR_PALETTE[hashCarrier(carrierName)]
}

function getCarrierLabel(carrierName: string): string {
  return CARRIER_LABELS[carrierName as Carrier] ?? carrierName.replace(/_/g, ' ')
}

// ─── Icons ───────────────────────────────────────────────────────────────────

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

// ─── Carrier Card ─────────────────────────────────────────────────────────────

function CarrierCard({ group }: { group: CarrierGroup }) {
  const style = getCarrierStyle(group.carrierName)
  const label = getCarrierLabel(group.carrierName)

  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${style.border}`,
      borderRadius: '14px',
      overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    }}>
      {/* Card header */}
      <div style={{
        background: style.headerBg,
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: 32, height: 32,
            background: 'rgba(255,255,255,0.18)',
            borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: style.headerText,
            flexShrink: 0,
          }}>
            <TruckIcon />
          </div>
          <span style={{
            fontWeight: 700, fontSize: '14px',
            color: style.headerText,
            letterSpacing: '-0.2px',
          }}>
            {label}
          </span>
        </div>
        {/* Total badge */}
        <div style={{
          background: 'rgba(255,255,255,0.22)',
          borderRadius: '20px',
          padding: '4px 12px',
          display: 'flex', alignItems: 'center', gap: '5px',
          flexShrink: 0,
        }}>
          <span style={{ fontWeight: 800, fontSize: '18px', color: style.headerText, lineHeight: 1 }}>
            {group.totalOrders}
          </span>
          <span style={{ fontSize: '11px', color: `${style.headerText}cc`, fontWeight: 500 }}>orders</span>
        </div>
      </div>

      {/* Shop list */}
      <div style={{ padding: '10px 0' }}>
        {group.shops.map((shop, i) => (
          <div
            key={shop.shopName}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '9px 18px',
              borderBottom: i < group.shops.length - 1 ? `1px solid #f1f5f9` : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#94a3b8', display: 'flex' }}>
                <ShopIcon />
              </span>
              <span style={{
                fontSize: '13px', fontWeight: 500,
                color: colors.textPrimary,
              }}>
                {shop.shopName.replace(/_/g, ' ')}
              </span>
            </div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              minWidth: 28, height: 22,
              background: style.badgeBg, color: style.badgeText,
              borderRadius: '20px', fontSize: '12px', fontWeight: 700,
              padding: '0 8px',
            }}>
              {shop.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

// ─── Date Navigator ───────────────────────────────────────────────────────────

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00+08:00`)
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) // YYYY-MM-DD
}

function formatDisplayDate(dateStr: string): { day: string; month: string; year: string; weekday: string } {
  const d = new Date(`${dateStr}T12:00:00+08:00`)
  return {
    weekday: d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'Asia/Manila' }),
    day:     d.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'Asia/Manila' }),
    month:   d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'Asia/Manila' }),
    year:    d.toLocaleDateString('en-GB', { year: 'numeric', timeZone: 'Asia/Manila' }),
  }
}

function daysBetween(fromStr: string, toStr: string): number {
  const a = new Date(`${fromStr}T12:00:00+08:00`).getTime()
  const b = new Date(`${toStr}T12:00:00+08:00`).getTime()
  return Math.round((b - a) / 86_400_000)
}

function formatRelative(dateStr: string, todayStr: string): string {
  const diff = daysBetween(dateStr, todayStr)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff === -1) return 'Tomorrow'
  if (diff > 0)    return `${diff} days ago`
  return `in ${-diff} days`
}

interface DateNavigatorProps {
  value: string        // YYYY-MM-DD or '' (today)
  todayStr: string
  onChange: (v: string) => void
}

function DateNavigator({ value, todayStr, onChange }: DateNavigatorProps) {
  const activeDate = value || todayStr
  const isToday = activeDate === todayStr
  const { weekday, day, month, year } = formatDisplayDate(activeDate)

  const navBtn: React.CSSProperties = {
    width: 32, height: 32, borderRadius: 8,
    border: `1px solid ${colors.border}`,
    background: '#fff', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: colors.textSecondary, flexShrink: 0,
    transition: 'background 0.12s, border-color 0.12s',
  }

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 0,
      background: '#fff', border: `1px solid ${colors.border}`,
      borderRadius: 10, overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      {/* Prev day */}
      <button
        onClick={() => onChange(addDays(activeDate, -1))}
        style={{ ...navBtn, borderRadius: 0, border: 'none', borderRight: `1px solid ${colors.border}` }}
        title="Previous day"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>

      {/* Date display — clicking opens native date input */}
      <label style={{ position: 'relative', cursor: 'pointer' }}>
        <div style={{
          padding: '6px 16px', minWidth: 148, textAlign: 'center',
          background: isToday ? '#f0fdf4' : '#fafafa',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: isToday ? '#15803d' : colors.textMuted, marginBottom: 1 }}>
            {isToday ? '● Today' : weekday}
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: isToday ? '#15803d' : colors.textPrimary, letterSpacing: '-0.3px' }}>
            {day} {month} <span style={{ fontWeight: 500, color: colors.textSecondary, fontSize: 13 }}>{year}</span>
          </div>
        </div>
        <input
          type="date"
          value={activeDate}
          max={todayStr}
          onChange={e => {
            if (!e.target.value) return
            onChange(e.target.value === todayStr ? '' : e.target.value)
          }}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}
        />
      </label>

      {/* Next day — disabled when today */}
      <button
        onClick={() => { if (!isToday) onChange(activeDate === addDays(todayStr, -1) ? '' : addDays(activeDate, 1)) }}
        disabled={isToday}
        style={{ ...navBtn, borderRadius: 0, border: 'none', borderLeft: `1px solid ${colors.border}`,
          opacity: isToday ? 0.3 : 1, cursor: isToday ? 'not-allowed' : 'pointer' }}
        title="Next day"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>

      {/* Today shortcut — only when not today */}
      {!isToday && (
        <button
          onClick={() => onChange('')}
          style={{ ...navBtn, borderRadius: 0, border: 'none', borderLeft: `1px solid ${colors.border}`,
            padding: '0 12px', width: 'auto', fontSize: 11, fontWeight: 700, color: colors.primary,
            background: '#eff6ff', gap: 4 }}
        >
          Today
        </button>
      )}
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function Outbound() {
  const user = useAuthStore((s) => s.user)
  const todayStr = getManilaDateString()
  const [selectedDate, setSelectedDate] = useState<string>('')  // '' = today
  const [carrierSort, setCarrierSort] = useState<'name' | 'volume'>('volume')
  const isHistorical = selectedDate !== ''
  const activeDate = selectedDate || todayStr
  const dateParam = isHistorical ? `?date=${selectedDate}` : ''

  const { data: groups, isLoading: groupsLoading } = useQuery({
    queryKey: ['outbound-grouped', selectedDate],
    queryFn: async () => {
      const res = await api.get<CarrierGroup[]>(`/outbound/grouped${dateParam}`)
      return res.data
    },
    refetchInterval: isHistorical ? false : 10_000,
  })

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['outbound-stats', selectedDate],
    queryFn: async () => {
      const res = await api.get<OutboundStats>(`/outbound/stats${dateParam}`)
      return res.data
    },
    refetchInterval: isHistorical ? false : 10_000,
  })

  const isLoading = groupsLoading || statsLoading
  const carrierGroups = groups ?? []
  const sortedCarrierGroups = useMemo(() => {
    const list = [...carrierGroups]
    if (carrierSort === 'name') {
      list.sort((a, b) => getCarrierLabel(a.carrierName).localeCompare(getCarrierLabel(b.carrierName)))
    } else {
      list.sort((a, b) => b.totalOrders - a.totalOrders)
    }
    return list
  }, [carrierGroups, carrierSort])

  const dispatchedCount = statsData?.dispatchedToday ?? 0
  const { weekday, day, month, year } = formatDisplayDate(activeDate)
  const displayLabel = isHistorical ? `${day} ${month} ${year}` : 'Today'
  const relativeLabel = isHistorical ? `${weekday} · ${formatRelative(activeDate, todayStr)}` : null

  const headerStats = isHistorical ? (
    <StatCard label={`Dispatched — ${displayLabel}`} value={dispatchedCount} color={colors.success} />
  ) : (
    <>
      <StatCard label="Total Inbound" value={statsData?.inboundTotal ?? 0} color={colors.primary} />
      <StatCard label="Dispatched Today" value={statsData?.dispatchedToday ?? 0} color={colors.success} />
      <StatCard label="In Pipeline" value={statsData?.missingCount ?? 0} color="#f59e0b" />
    </>
  )

  return (
    <PageShell
      icon={OutboundIcon}
      title="Outbound Panel"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
      stats={headerStats}
    >
      {/* Section header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '20px', gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: colors.textPrimary, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span>{isHistorical ? `Shipments — ${displayLabel}` : "Today's Shipments"}</span>
            {relativeLabel && (
              <span style={{
                fontSize: 11, fontWeight: 600,
                color: colors.textSecondary,
                background: colors.surfaceAlt,
                border: `1px solid ${colors.border}`,
                padding: '2px 8px', borderRadius: 999,
                letterSpacing: '0.02em',
              }}>
                {relativeLabel}
              </span>
            )}
          </h3>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: colors.textSecondary }}>
            {isHistorical
              ? `${dispatchedCount} order${dispatchedCount !== 1 ? 's' : ''} dispatched · grouped by carrier`
              : 'Orders dispatched today · grouped by carrier'}
          </p>
        </div>

        <DateNavigator value={selectedDate} todayStr={todayStr} onChange={setSelectedDate} />
      </div>

      {/* Content */}
      {isLoading ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '12px', padding: '60px 0', color: colors.textMuted, fontSize: '14px',
        }}>
          <span className="spinner spinner-sm" />
          Loading shipments...
        </div>
      ) : carrierGroups.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '60px 20px', textAlign: 'center',
        }}>
          <div style={{
            width: 56, height: 56,
            background: 'linear-gradient(135deg, #f1f5f9, #e2e8f0)',
            borderRadius: '14px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: '16px', color: '#94a3b8',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="3" width="15" height="13" rx="2" />
              <path d="M16 8h4l3 5v3h-7V8z" />
              <circle cx="5.5" cy="18.5" r="2.5" />
              <circle cx="18.5" cy="18.5" r="2.5" />
            </svg>
          </div>
          <div style={{ fontWeight: 700, fontSize: '15px', color: colors.textPrimary, marginBottom: '6px' }}>
            {isHistorical ? `No orders dispatched on ${displayLabel}` : 'No orders dispatched today'}
          </div>
          <div style={{ fontSize: '13px', color: colors.textSecondary }}>
            {isHistorical
              ? 'Use the navigator above to try a different date.'
              : 'Orders will appear here automatically when packers complete them.'}
          </div>
        </div>
      ) : (
        <>
          {/* Sort pill */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            marginBottom: 12, gap: 10, flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Sort
            </span>
            <div style={{
              display: 'inline-flex',
              background: '#fff',
              border: `1px solid ${colors.border}`,
              borderRadius: 999,
              padding: 3,
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}>
              {([
                { k: 'volume', label: 'Volume' },
                { k: 'name',   label: 'Name' },
              ] as const).map(opt => {
                const active = carrierSort === opt.k
                return (
                  <button
                    key={opt.k}
                    onClick={() => setCarrierSort(opt.k)}
                    style={{
                      border: 'none',
                      background: active ? colors.primary : 'transparent',
                      color: active ? '#fff' : colors.textSecondary,
                      fontSize: 12, fontWeight: 700,
                      padding: '6px 14px',
                      borderRadius: 999,
                      cursor: 'pointer',
                      transition: 'background 0.15s, color 0.15s',
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '16px',
          }}>
            {sortedCarrierGroups.map((group) => (
              <CarrierCard key={group.carrierName} group={group} />
            ))}
          </div>
        </>
      )}
    </PageShell>
  )
}
