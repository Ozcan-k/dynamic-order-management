import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'
import { colors, radius, shadow, font } from '../theme'
import PageShell from '../components/shared/PageShell'
import SectionHeader from '../components/shared/SectionHeader'
import NumberTicker from '../components/shared/NumberTicker'
import OrderPipelineFunnel from '../components/shared/OrderPipelineFunnel'
import { getSocket } from '../lib/socket'
import { getManilaDateString } from '../lib/manila'
import { getOrderPipeline } from '../api/dispatch'
import SlaSummaryCard from '../components/SlaSummaryCard'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardStats {
  inboundTotal: number
  outboundTotal: number
  remainingCount: number
  carryoverCount: number
  pickerSummary: { inbound: number; assigned: number; inProgress: number; complete: number }
  packerSummary: { unassigned: number; assigned: number; inProgress: number; complete: number }
  slaSummary: { d0: number; d1: number; d2: number; d3: number; d4: number; escalatedToday: number }
}

interface RangeTotals {
  startDate: string
  endDate: string
  inboundTotal: number
  outboundTotal: number
}

type PresetKey = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom'

const PRESET_LABELS: Record<PresetKey, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  month: 'This month',
  custom: 'Custom',
}

function getGreeting(now: Date): string {
  const h = Number(now.toLocaleTimeString('en-GB', { hour: '2-digit', timeZone: 'Asia/Manila' }).slice(0, 2))
  if (h < 5)  return 'Still awake'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  if (h < 22) return 'Good evening'
  return 'Good night'
}

function addDaysIso(d: string, n: number): string {
  const dt = new Date(`${d}T00:00:00+08:00`)
  dt.setUTCDate(dt.getUTCDate() + n)
  return new Date(dt.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function computePresetRange(key: PresetKey, today: string): [string, string] {
  switch (key) {
    case 'today':     return [today, today]
    case 'yesterday': { const y = addDaysIso(today, -1); return [y, y] }
    case '7d':        return [addDaysIso(today, -6), today]
    case '30d':       return [addDaysIso(today, -29), today]
    case 'month':     return [today.slice(0, 8) + '01', today]
    default:          return [today, today]
  }
}

function formatShort(d: string): string {
  return new Date(`${d}T00:00:00+08:00`).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', timeZone: 'Asia/Manila',
  })
}

interface OutboundStats {
  dispatchedToday: number
  outboundTotal: number
  missingCount: number
  d4Count: number
  pipeline: {
    inboundQueue: number
    pickerActive: number
    pickerComplete: number
    dispatched: number
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const DashboardIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
)

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.xl,
      boxShadow: shadow.card,
      ...style,
    }}>
      {children}
    </div>
  )
}

function MetricCard({
  label, value, color, subtitle, animate,
}: {
  label: string; value: number | string; color: string; subtitle?: string; animate?: boolean
}) {
  const isNumeric = typeof value === 'number'
  return (
    <div style={{
      background: colors.surfaceAlt,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.lg,
      padding: '14px 16px',
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{
        fontSize: '26px', fontWeight: 700, color,
        fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
      }}>
        {animate && isNumeric ? <NumberTicker value={value as number} /> : value}
      </div>
      <div style={{ fontSize: font.md, color: colors.textSecondary, marginTop: '5px', fontWeight: 500 }}>
        {label}
      </div>
      {subtitle && (
        <div style={{ fontSize: font.xs, color: colors.textMuted, marginTop: '2px' }}>
          {subtitle}
        </div>
      )}
    </div>
  )
}

// ─── Order Summary tiles ──────────────────────────────────────────────────────

const PipelineGlyph = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
)
const AlertGlyph = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)
const CarryoverGlyph = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 2v6h6" /><path d="M3 13a9 9 0 1 0 3-7.7L3 8" />
  </svg>
)

function SummaryTile({
  label, value, color, subtitle, icon,
}: {
  label: string; value: number | string; color: string; subtitle?: string; icon: React.ReactNode
}) {
  const isNumeric = typeof value === 'number'
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: `linear-gradient(180deg, ${color}0d 0%, ${colors.surface} 60%)`,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.xl,
      padding: '18px 20px',
    }}>
      {/* accent rail */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: color }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{
          width: 34, height: 34, borderRadius: 10, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${color}1a`, color,
        }}>{icon}</span>
        <span style={{ fontSize: font.md, color: colors.textSecondary, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: '34px', fontWeight: 800, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {isNumeric ? <NumberTicker value={value as number} /> : value}
      </div>
      {subtitle && (
        <div style={{ fontSize: font.xs, color: colors.textMuted, marginTop: '6px' }}>{subtitle}</div>
      )}
    </div>
  )
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_STATS: DashboardStats = {
  inboundTotal: 0, outboundTotal: 0, remainingCount: 0, carryoverCount: 0,
  pickerSummary: { inbound: 0, assigned: 0, inProgress: 0, complete: 0 },
  packerSummary: { unassigned: 0, assigned: 0, inProgress: 0, complete: 0 },
  slaSummary: { d0: 0, d1: 0, d2: 0, d3: 0, d4: 0, escalatedToday: 0 },
}

const DEFAULT_OUTBOUND: OutboundStats = {
  dispatchedToday: 0, outboundTotal: 0, missingCount: 0, d4Count: 0,
  pipeline: { inboundQueue: 0, pickerActive: 0, pickerComplete: 0, dispatched: 0 },
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [now, setNow] = useState(new Date())
  const [colon, setColon] = useState(true)
  const todayStr = getManilaDateString()
  const [preset, setPreset] = useState<PresetKey>('today')
  const [rangeStart, setRangeStart] = useState<string>(todayStr)
  const [rangeEnd, setRangeEnd] = useState<string>(todayStr)

  const applyPreset = (key: PresetKey) => {
    setPreset(key)
    if (key === 'custom') return
    const [s, e] = computePresetRange(key, todayStr)
    setRangeStart(s); setRangeEnd(e)
  }
  const onStartChange = (v: string) => {
    if (!v) return
    setRangeStart(v)
    if (v > rangeEnd) setRangeEnd(v)
    setPreset('custom')
  }
  const onEndChange = (v: string) => {
    if (!v) return
    setRangeEnd(v)
    if (v < rangeStart) setRangeStart(v)
    setPreset('custom')
  }
  const rangeDays = Math.floor(
    (new Date(`${rangeEnd}T00:00:00+08:00`).getTime() -
     new Date(`${rangeStart}T00:00:00+08:00`).getTime()) / 86_400_000,
  ) + 1

  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date())
      setColon((v) => !v)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => (await api.get<DashboardStats>('/reports/dashboard')).data,
    refetchInterval: 10_000,
  })

  const { data: outboundData, isLoading: outboundLoading } = useQuery({
    queryKey: ['outbound-stats-dashboard'],
    queryFn: async () => (await api.get<OutboundStats>('/outbound/stats')).data,
    refetchInterval: 10_000,
  })

  const { data: rangeData, isLoading: rangeLoading } = useQuery({
    queryKey: ['range-totals', rangeStart, rangeEnd],
    queryFn: async () =>
      (await api.get<RangeTotals>(
        `/reports/range-totals?startDate=${rangeStart}&endDate=${rangeEnd}`,
      )).data,
    enabled: !!rangeStart && !!rangeEnd && rangeStart <= rangeEnd,
    refetchInterval: rangeEnd === todayStr ? 30_000 : false,
  })

  const { data: pipelineData, isLoading: pipelineLoading } = useQuery({
    queryKey: ['dashboard-pipeline', todayStr],
    queryFn: () => getOrderPipeline(todayStr, todayStr),
    refetchInterval: 15_000,
  })

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['outbound-stats-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['range-totals'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-pipeline'] })
    }
    socket.on('sla:escalated', handler)
    socket.on('order:stats_changed', handler)
    return () => {
      socket.off('sla:escalated', handler)
      socket.off('order:stats_changed', handler)
    }
  }, [queryClient])

  const stats = data ?? DEFAULT_STATS
  const outbound = outboundData ?? DEFAULT_OUTBOUND

  const [hh, mm] = now
    .toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Manila' })
    .split(':')
  const weekday = now.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Asia/Manila' })
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Manila' })
  const updatedStr = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' })
    : '—'

  const dash = (loading: boolean, v: number) => (loading ? '—' : v)

  return (
    <PageShell
      icon={<DashboardIcon />}
      title="Dashboard"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
    >

      {/* ── Hero banner (clock + greeting) ──────────────────────────── */}
      <div className="dashboard-hero">
        <div className="dashboard-hero-bg" aria-hidden="true" />
        <div className="dashboard-hero-inner">
          {/* Left: greeting */}
          <div className="dashboard-hero-greeting">
            <span className="dashboard-hero-eyebrow">{getGreeting(now)}</span>
            <h2 className="dashboard-hero-name">{user?.username ?? 'Admin'}</h2>
            <span className="dashboard-hero-subtitle">{weekday} · {dateStr}</span>
          </div>

          {/* Right: live clock */}
          <div className="dashboard-hero-clock">
            {/* Phase D v2.38.1: clock now uses Inter Variable with tabular-nums
                (already on .dashboard-hero-time in components.css) — Linear-style
                cleaner than the SF Mono fallback that was here. */}
            <div className="dashboard-hero-time">
              {hh}
              <span className={`dashboard-hero-colon${colon ? '' : ' dashboard-hero-colon--off'}`}>:</span>
              {mm}
            </div>
            <div className="dashboard-hero-live">
              <span className="dashboard-hero-live-dot" />
              <span className="dashboard-hero-live-label">Live</span>
              <span className="dashboard-hero-live-sep">·</span>
              <span className="dashboard-hero-live-updated">Updated {updatedStr}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Order Pipeline (identical to the Outbound Report funnel) ── */}
      <OrderPipelineFunnel
        data={pipelineData}
        loading={pipelineLoading}
        rangeLabel="Today"
        caption="Inbound → Packer Complete are warehouse milestones (distinct orders that reached each stage today). Outbound counts only parcels actually scanned out today; of those, old orders were packed earlier and shipped now (backlog)."
      />

      {/* ── Order Summary ─────────────────────────────────────────── */}
      <Card style={{ padding: '20px 24px', marginBottom: '20px' }}>
        <SectionHeader title="Order Summary" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <SummaryTile
            label="In Pipeline" value={dash(outboundLoading, outbound.missingCount)}
            color={colors.primary} subtitle="Not yet dispatched" icon={PipelineGlyph}
          />
          <SummaryTile
            label="D4 — Not Shipped" value={dash(outboundLoading, outbound.d4Count)}
            color={colors.danger} subtitle="Urgent dispatch needed" icon={AlertGlyph}
          />
          <SummaryTile
            label="Carryover Active" value={dash(isLoading, stats.carryoverCount)}
            color="#d97706" subtitle="From previous days" icon={CarryoverGlyph}
          />
        </div>
      </Card>

      {/* ── SLA Breakdown ─────────────────────────────────────────── */}
      <SlaSummaryCard slaSummary={stats.slaSummary} loading={isLoading} />

      {/* ── Volume Report ─────────────────────────────────────────── */}
      <Card style={{ padding: '20px 24px', marginTop: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <div>
            <SectionHeader title="Volume Report" />
            <div style={{ fontSize: 12, color: colors.textMuted, marginTop: -4 }}>
              {formatShort(rangeStart)} → {formatShort(rangeEnd)} · {rangeDays} day{rangeDays === 1 ? '' : 's'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['today','yesterday','7d','30d','month','custom'] as PresetKey[]).map((k) => {
              const active = preset === k
              return (
                <button
                  key={k}
                  onClick={() => applyPreset(k)}
                  style={{
                    padding: '6px 12px',
                    border: `1px solid ${active ? colors.primary : colors.border}`,
                    borderRadius: 8,
                    background: active ? colors.primary : '#fff',
                    color: active ? '#fff' : colors.textSecondary,
                    fontSize: 12,
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                    transition: 'background 0.12s, color 0.12s, border-color 0.12s',
                  }}
                >
                  {PRESET_LABELS[k]}
                </button>
              )
            })}
          </div>
        </div>

        {preset === 'custom' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            marginBottom: 14, padding: '10px 12px',
            background: colors.surfaceAlt, border: `1px solid ${colors.border}`, borderRadius: 8,
          }}>
            <label style={{ fontSize: 12, color: colors.textSecondary }}>From</label>
            <input
              type="date"
              value={rangeStart}
              max={todayStr}
              onChange={(e) => onStartChange(e.target.value)}
              style={{ padding: '6px 10px', border: `1px solid ${colors.border}`, borderRadius: 8, fontSize: 13 }}
            />
            <label style={{ fontSize: 12, color: colors.textSecondary }}>To</label>
            <input
              type="date"
              value={rangeEnd}
              max={todayStr}
              onChange={(e) => onEndChange(e.target.value)}
              style={{ padding: '6px 10px', border: `1px solid ${colors.border}`, borderRadius: 8, fontSize: 13 }}
            />
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <MetricCard
            label="Total Inbound" value={dash(rangeLoading, rangeData?.inboundTotal ?? 0)}
            color={colors.primary} subtitle={`${rangeStart} → ${rangeEnd}`}
            animate
          />
          <MetricCard
            label="Total Outbound" value={dash(rangeLoading, rangeData?.outboundTotal ?? 0)}
            color={colors.success} subtitle={`${rangeStart} → ${rangeEnd}`}
            animate
          />
        </div>
      </Card>

    </PageShell>
  )
}
