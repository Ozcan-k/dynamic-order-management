import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'
import { colors, radius, shadow, font } from '../theme'
import PageShell from '../components/shared/PageShell'
import StatCard from '../components/shared/StatCard'
import SectionHeader from '../components/shared/SectionHeader'
import { getSocket } from '../lib/socket'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardStats {
  inboundTotal: number
  outboundTotal: number
  remainingCount: number
  pickerSummary: { inbound: number; assigned: number; inProgress: number; complete: number }
  packerSummary: { unassigned: number; assigned: number; inProgress: number; complete: number }
  slaSummary: { d0: number; d1: number; d2: number; d3: number; d4: number }
}

interface OutboundStats {
  waitingCount: number
  dispatchedToday: number
  outboundTotal: number
  d4Count: number
  pipeline: {
    inboundQueue: number
    pickerActive: number
    pickerComplete: number
    packerComplete: number
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
  label, value, color, subtitle,
}: {
  label: string; value: number | string; color: string; subtitle?: string
}) {
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
        {value}
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
  label, count, color, sublabel, isLast = false,
}: {
  label: string; count: number; color: string; sublabel?: string; isLast?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
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
          {count}
        </div>
        <div style={{ fontSize: font.sizeSm, color: colors.textSecondary, marginTop: '5px', fontWeight: 600 }}>
          {label}
        </div>
        {sublabel && (
          <div style={{ fontSize: font.sizeXs, color: colors.textMuted, marginTop: '2px' }}>{sublabel}</div>
        )}
      </div>
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

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_STATS: DashboardStats = {
  inboundTotal: 0, outboundTotal: 0, remainingCount: 0,
  pickerSummary: { inbound: 0, assigned: 0, inProgress: 0, complete: 0 },
  packerSummary: { unassigned: 0, assigned: 0, inProgress: 0, complete: 0 },
  slaSummary: { d0: 0, d1: 0, d2: 0, d3: 0, d4: 0 },
}

const DEFAULT_OUTBOUND: OutboundStats = {
  waitingCount: 0, dispatchedToday: 0, outboundTotal: 0, d4Count: 0,
  pipeline: { inboundQueue: 0, pickerActive: 0, pickerComplete: 0, packerComplete: 0, dispatched: 0 },
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [now, setNow] = useState(new Date())
  const [colon, setColon] = useState(true)

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

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['outbound-stats-dashboard'] })
    }
    socket.on('sla:escalated', handler)
    return () => { socket.off('sla:escalated', handler) }
  }, [queryClient])

  const stats = data ?? DEFAULT_STATS
  const outbound = outboundData ?? DEFAULT_OUTBOUND
  const slaTotal = SLA_KEYS.reduce((s, k) => s + stats.slaSummary[k], 0)

  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const weekday = now.toLocaleDateString('en-GB', { weekday: 'long' })
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  const updatedStr = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : '—'

  const dash = (loading: boolean, v: number) => (loading ? '—' : v)

  return (
    <PageShell
      icon={<DashboardIcon />}
      title="Dashboard"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
      stats={
        <>
          <StatCard label="Total Scanned" value={dash(isLoading, stats.inboundTotal)} color={colors.primary} />
          <StatCard label="Dispatched" value={dash(isLoading, stats.outboundTotal)} color={colors.success} />
          <StatCard label="Remaining" value={dash(isLoading, stats.remainingCount)} color={colors.warning} />
          <StatCard label="D4 at Risk" value={dash(isLoading, stats.slaSummary.d4)} color={colors.danger} />
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
          />
          <PipelineStage
            label="Picking" count={outbound.pipeline.pickerActive}
            color="#8b5cf6" sublabel="In progress"
          />
          <PipelineStage
            label="Pick Done" count={outbound.pipeline.pickerComplete}
            color="#06b6d4" sublabel="Awaiting packer"
          />
          <PipelineStage
            label="Ready to Ship" count={outbound.pipeline.packerComplete}
            color={colors.warning} sublabel="Packed"
          />
          <PipelineStage
            label="Dispatched" count={outbound.pipeline.dispatched}
            color={colors.success} sublabel="All time" isLast
          />
        </div>
      </Card>

      {/* ── Picker + Packer Summary ───────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '20px',
        marginBottom: '20px',
      }}>
        {/* Picker */}
        <Card style={{ padding: '20px 24px' }}>
          <SectionHeader title="Picker Summary" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <MetricCard
              label="Inbound Queue" value={dash(isLoading, stats.pickerSummary.inbound)}
              color={colors.primary} subtitle="Awaiting assignment"
            />
            <MetricCard
              label="Assigned" value={dash(isLoading, stats.pickerSummary.assigned)}
              color="#8b5cf6" subtitle="Picker assigned"
            />
            <MetricCard
              label="In Progress" value={dash(isLoading, stats.pickerSummary.inProgress)}
              color={colors.warning} subtitle="Currently picking"
            />
            <MetricCard
              label="Completed" value={dash(isLoading, stats.pickerSummary.complete)}
              color={colors.success} subtitle="Ready for packing"
            />
          </div>
        </Card>

        {/* Packer */}
        <Card style={{ padding: '20px 24px' }}>
          <SectionHeader title="Packer Summary" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <MetricCard
              label="Unassigned" value={dash(isLoading, stats.packerSummary.unassigned)}
              color={colors.textSecondary} subtitle="No packer yet"
            />
            <MetricCard
              label="Assigned" value={dash(isLoading, stats.packerSummary.assigned)}
              color="#8b5cf6" subtitle="Packer assigned"
            />
            <MetricCard
              label="In Progress" value={dash(isLoading, stats.packerSummary.inProgress)}
              color={colors.warning} subtitle="Currently packing"
            />
            <MetricCard
              label="Completed" value={dash(isLoading, stats.packerSummary.complete)}
              color={colors.success} subtitle="Ready to dispatch"
            />
          </div>
        </Card>
      </div>

      {/* ── Outbound Summary ──────────────────────────────────────── */}
      <Card style={{ padding: '20px 24px', marginBottom: '20px' }}>
        <SectionHeader title="Outbound Summary" />
        <div className="stats-grid">
          <MetricCard
            label="Dispatched Today" value={dash(outboundLoading, outbound.dispatchedToday)}
            color={colors.success} subtitle="Since midnight"
          />
          <MetricCard
            label="Waiting to Ship" value={dash(outboundLoading, outbound.waitingCount)}
            color={colors.primary} subtitle="Packing complete"
          />
          <MetricCard
            label="D4 — Not Shipped" value={dash(outboundLoading, outbound.d4Count)}
            color={colors.danger} subtitle="Urgent dispatch needed"
          />
          <MetricCard
            label="Total Dispatched" value={dash(outboundLoading, outbound.outboundTotal)}
            color="#0891b2" subtitle="All time"
          />
        </div>
      </Card>

      {/* ── SLA Breakdown ─────────────────────────────────────────── */}
      <Card style={{ padding: '20px 24px' }}>
        <SectionHeader title="SLA Breakdown" count={slaTotal} />

        {/* Segmented bar */}
        <div style={{ marginBottom: '18px' }}>
          <div style={{
            display: 'flex', height: '18px',
            borderRadius: radius.full, overflow: 'hidden',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)',
            background: colors.border,
          }}>
            {slaTotal > 0
              ? SLA_KEYS.map((key) => {
                  const pct = (stats.slaSummary[key] / slaTotal) * 100
                  if (pct === 0) return null
                  return (
                    <div
                      key={key}
                      title={`${SLA_BADGE[key]} (${SLA_LABEL[key]}): ${stats.slaSummary[key]} orders — ${pct.toFixed(1)}%`}
                      style={{
                        width: `${pct}%`,
                        background: SLA_COLOR[key],
                        transition: 'width 0.4s ease',
                        cursor: 'default',
                      }}
                    />
                  )
                })
              : null
            }
          </div>
        </div>

        {/* SLA legend cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: '10px',
        }}>
          {SLA_KEYS.map((key) => {
            const count = stats.slaSummary[key]
            const pct = slaTotal > 0 ? ((count / slaTotal) * 100).toFixed(1) : '0.0'
            const isD4 = key === 'd4'
            return (
              <div key={key} style={{
                background: isD4 && count > 0 ? '#fff5f5' : colors.surfaceAlt,
                border: `1px solid ${isD4 && count > 0 ? '#fecaca' : colors.border}`,
                borderRadius: radius.md,
                padding: '12px 14px',
                borderLeft: `3px solid ${SLA_COLOR[key]}`,
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', marginBottom: '6px',
                }}>
                  <span style={{
                    fontSize: font.sizeSm, color: SLA_COLOR[key],
                    fontWeight: 700, letterSpacing: '0.03em',
                  }}>
                    {SLA_BADGE[key]}
                  </span>
                  <span style={{
                    fontSize: font.sizeXs, color: colors.textMuted,
                    background: colors.border, borderRadius: radius.full,
                    padding: '1px 7px', fontWeight: 600,
                  }}>
                    {pct}%
                  </span>
                </div>
                <div style={{
                  fontSize: '22px', fontWeight: 800,
                  color: isD4 && count > 0 ? colors.danger : colors.textPrimary,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {count}
                </div>
                <div style={{ fontSize: font.sizeXs, color: colors.textSecondary, marginTop: '3px' }}>
                  {SLA_LABEL[key]}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

    </PageShell>
  )
}
