import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'
import { colors } from '../theme'
import { Carrier, CARRIER_LABELS } from '@dom/shared'
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
}

// ─── Carrier display config ──────────────────────────────────────────────────

interface CarrierStyle {
  headerBg: string
  headerText: string
  badgeBg: string
  badgeText: string
  border: string
  countBg: string
}

const CARRIER_STYLES: Record<string, CarrierStyle> = {
  SPX:       { headerBg: '#1d4ed8', headerText: '#fff', badgeBg: '#dbeafe', badgeText: '#1e40af', border: '#bfdbfe', countBg: '#2563eb' },
  JT_EXPRESS:{ headerBg: '#dc2626', headerText: '#fff', badgeBg: '#fee2e2', badgeText: '#b91c1c', border: '#fecaca', countBg: '#ef4444' },
  FLASH:     { headerBg: '#ea580c', headerText: '#fff', badgeBg: '#ffedd5', badgeText: '#c2410c', border: '#fed7aa', countBg: '#f97316' },
  LEX:       { headerBg: '#7c3aed', headerText: '#fff', badgeBg: '#ede9fe', badgeText: '#6d28d9', border: '#ddd6fe', countBg: '#8b5cf6' },
  LBC:       { headerBg: '#15803d', headerText: '#fff', badgeBg: '#dcfce7', badgeText: '#166534', border: '#bbf7d0', countBg: '#16a34a' },
  NINJA_VAN: { headerBg: '#6d28d9', headerText: '#fff', badgeBg: '#f3e8ff', badgeText: '#7e22ce', border: '#e9d5ff', countBg: '#7c3aed' },
  OTHER:     { headerBg: '#475569', headerText: '#fff', badgeBg: '#f1f5f9', badgeText: '#334155', border: '#e2e8f0', countBg: '#64748b' },
}

function getCarrierStyle(carrierName: string): CarrierStyle {
  return CARRIER_STYLES[carrierName] ?? CARRIER_STYLES.OTHER
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

export default function Outbound() {
  const user = useAuthStore((s) => s.user)

  const { data: groups, isLoading: groupsLoading } = useQuery({
    queryKey: ['outbound-grouped'],
    queryFn: async () => {
      const res = await api.get<CarrierGroup[]>('/outbound/grouped')
      return res.data
    },
    refetchInterval: 10_000,
  })

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['outbound-stats'],
    queryFn: async () => {
      const res = await api.get<OutboundStats>('/outbound/stats')
      return res.data
    },
    refetchInterval: 10_000,
  })

  const isLoading = groupsLoading || statsLoading
  const carrierGroups = groups ?? []
  const totalToday = statsData?.dispatchedToday ?? 0

  const headerStats = (
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
        marginBottom: '20px',
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: colors.textPrimary }}>
            Today's Shipments
          </h3>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: colors.textSecondary }}>
            Orders dispatched today · grouped by carrier
          </p>
        </div>
        {totalToday > 0 && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: '#f0fdf4', border: '1px solid #bbf7d0',
            borderRadius: '20px', padding: '5px 14px',
          }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#16a34a' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#15803d' }}>
              {totalToday} dispatched
            </span>
          </div>
        )}
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
            marginBottom: '16px',
            color: '#94a3b8',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="3" width="15" height="13" rx="2" />
              <path d="M16 8h4l3 5v3h-7V8z" />
              <circle cx="5.5" cy="18.5" r="2.5" />
              <circle cx="18.5" cy="18.5" r="2.5" />
            </svg>
          </div>
          <div style={{ fontWeight: 700, fontSize: '15px', color: colors.textPrimary, marginBottom: '6px' }}>
            No orders dispatched today
          </div>
          <div style={{ fontSize: '13px', color: colors.textSecondary }}>
            Orders will appear here automatically when packers complete them.
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '16px',
        }}>
          {carrierGroups.map((group) => (
            <CarrierCard key={group.carrierName} group={group} />
          ))}
        </div>
      )}
    </PageShell>
  )
}
