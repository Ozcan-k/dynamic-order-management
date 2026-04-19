import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'
import { colors, radius, shadow, font } from '../theme'
import PageShell from '../components/shared/PageShell'
import StatCard from '../components/shared/StatCard'
import SectionHeader from '../components/shared/SectionHeader'
import NumberTicker from '../components/shared/NumberTicker'
import BorderBeam from '../components/shared/BorderBeam'
import { getSocket } from '../lib/socket'
import { getManilaDateString } from '../lib/manila'
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

interface DashboardTrends {
  days: number
  dates: string[]
  inbound: number[]
  outbound: number[]
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
      <div style={{ fontSize: font.sizeMd, color: colors.textSecondary, marginTop: '5px', fontWeight: 500 }}>
        {label}
      </div>
      {subtitle && (
        <div style={{ fontSize: font.sizeXs, color: colors.textMuted, marginTop: '2px' }}>
          {subtitle}
        </div>
      )}
    </div>
  )
}

function PipelineStage({
  label, count, color, sublabel, isLast = false, active = false,
}: {
  label: string; count: number; color: string; sublabel?: string; isLast?: boolean; active?: boolean
}) {
  const stageBox = (
    <div style={{
      flex: 1,
      background: colors.surfaceAlt,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.lg,
      padding: '14px 10px',
      textAlign: 'center',
      borderTop: `3px solid ${color}`,
      minWidth: 0,
    }}>
      <div style={{
        fontSize: '28px', fontWeight: 800, color,
        fontVariantNumeric: 'tabular-nums', lineHeight: 1,
      }}>
        <NumberTicker value={count} />
      </div>
      <div style={{ fontSize: font.sizeSm, color: colors.textSecondary, marginTop: '5px', fontWeight: 600 }}>
        {label}
      </div>
      {sublabel && (
        <div style={{ fontSize: font.sizeXs, color: colors.textMuted, marginTop: '2px' }}>{sublabel}</div>
      )}
    </div>
  )
  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
      {active
        ? <BorderBeam color={color} borderRadius={radius.lg} style={{ flex: 1, minWidth: 0 }}>{stageBox}</BorderBeam>
        : stageBox}
      {!isLast && (
        <div style={{
          padding: '0 6px',
          color: colors.borderStrong,
          fontSize: '20px',
          fontWeight: 300,
          flexShrink: 0,
          userSelect: 'none',
        }}>
          ›
        </div>
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

  const { data: trendData } = useQuery({
    queryKey: ['dashboard-trends'],
    queryFn: async () => (await api.get<DashboardTrends>('/reports/dashboard-trends?days=7')).data,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['outbound-stats-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['range-totals'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-trends'] })
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

  const hh = now.toLocaleTimeString('en-GB', { hour: '2-digit', timeZone: 'Asia/Manila' }).slice(0, 2)
  const mm = now.toLocaleTimeString('en-GB', { minute: '2-digit', timeZone: 'Asia/Manila' }).slice(-2)
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
      stats={
        <>
          <StatCard label="Total Scanned" value={dash(isLoading, stats.inboundTotal)} color={colors.primary} animate trend={trendData?.inbound} />
          <StatCard label="Dispatched" value={dash(isLoading, stats.outboundTotal)} color={colors.success} animate trend={trendData?.outbound} />
          <StatCard label="Remaining" value={dash(isLoading, stats.remainingCount)} color={colors.warning} animate />
          <StatCard label="Carryover Active" value={dash(isLoading, stats.carryoverCount)} color="#d97706" subtitle="From previous days" animate />
          <StatCard label="D4 at Risk" value={dash(isLoading, stats.slaSummary.d4)} color={colors.danger} animate />
        </>
      }
    >

      {/* ── Clock ─────────────────────────────────────────────────── */}
      <Card style={{ padding: '20px 28px', marginBottom: '20px' }}>
        <div className="clock-card-row">
          {/* Time + Date */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            {/* Clock icon */}
            <div style={{
              width: 44, height: 44, borderRadius: '12px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, boxShadow: '0 4px 12px rgba(59,130,246,0.3)',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            {/* Time */}
            <div>
              <div className="clock-time" style={{
                color: colors.textPrimary,
                fontFamily: font.mono,
              }}>
                {hh}
                <span style={{
                  opacity: colon ? 1 : 0.2,
                  transition: 'opacity 0.15s',
                  display: 'inline-block', width: '0.38em', textAlign: 'center',
                }}>:</span>
                {mm}
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                marginTop: '4px',
              }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: colors.textSecondary, letterSpacing: '0.02em' }}>
                  {weekday}
                </span>
                <span style={{ color: colors.border, fontSize: '12px' }}>·</span>
                <span style={{ fontSize: '13px', color: colors.textMuted }}>
                  {dateStr}
                </span>
              </div>
            </div>
          </div>

          {/* Live indicator */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: colors.surfaceAlt,
            border: `1px solid ${colors.border}`,
            borderRadius: '10px',
            padding: '8px 14px',
          }}>
            <span style={{
              display: 'inline-block', width: '8px', height: '8px',
              borderRadius: '50%', background: '#10b981',
              boxShadow: '0 0 0 3px rgba(16,185,129,0.2)',
              flexShrink: 0,
            }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#10b981', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Live
              </span>
              <span style={{ fontSize: '12px', color: colors.textMuted }}>
                Updated {updatedStr}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Order Pipeline ────────────────────────────────────────── */}
      <Card style={{ padding: '20px 24px', marginBottom: '20px' }}>
        <SectionHeader title="Order Pipeline" />
        <div style={{ display: 'flex', alignItems: 'stretch', gap: '4px', overflowX: 'auto' }}>
          <PipelineStage
            label="Inbound Queue" count={outbound.pipeline.inboundQueue}
            color={colors.primary} sublabel="Awaiting pick"
            active={outbound.pipeline.inboundQueue > 0}
          />
          <PipelineStage
            label="Picking" count={outbound.pipeline.pickerActive}
            color="#8b5cf6" sublabel="In progress"
            active={outbound.pipeline.pickerActive > 0}
          />
          <PipelineStage
            label="Pick Done" count={outbound.pipeline.pickerComplete}
            color="#06b6d4" sublabel="Awaiting packer"
            active={outbound.pipeline.pickerComplete > 0}
          />
          <PipelineStage
            label="Dispatched" count={outbound.pipeline.dispatched}
            color={colors.success} sublabel="All time" isLast
          />
        </div>
      </Card>

      {/* ── Outbound Summary ──────────────────────────────────────── */}
      <Card style={{ padding: '20px 24px', marginBottom: '20px' }}>
        <SectionHeader title="Outbound Summary" />
        <div className="stats-grid">
          <MetricCard
            label="Dispatched Today" value={dash(outboundLoading, outbound.dispatchedToday)}
            color={colors.success} subtitle="Since midnight" animate
          />
          <MetricCard
            label="In Pipeline" value={dash(outboundLoading, outbound.missingCount)}
            color={colors.primary} subtitle="Not yet dispatched" animate
          />
          <MetricCard
            label="D4 — Not Shipped" value={dash(outboundLoading, outbound.d4Count)}
            color={colors.danger} subtitle="Urgent dispatch needed" animate
          />
          <MetricCard
            label="Total Dispatched" value={dash(outboundLoading, outbound.outboundTotal)}
            color="#0891b2" subtitle="All time" animate
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
