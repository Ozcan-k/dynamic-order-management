import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'
import { colors, radius, shadow, font } from '../theme'
import PageShell from '../components/shared/PageShell'
import StatCard from '../components/shared/StatCard'
import SectionHeader from '../components/shared/SectionHeader'
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
          <StatCard label="Total Scanned" value={dash(isLoading, stats.inboundTotal)} color={colors.primary} />
          <StatCard label="Dispatched" value={dash(isLoading, stats.outboundTotal)} color={colors.success} />
          <StatCard label="Remaining" value={dash(isLoading, stats.remainingCount)} color={colors.warning} />
          <StatCard label="Carryover Active" value={dash(isLoading, stats.carryoverCount)} color="#d97706" subtitle="From previous days" />
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
            label="In Pipeline" value={dash(outboundLoading, outbound.missingCount)}
            color={colors.primary} subtitle="Not yet dispatched"
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
      <SlaSummaryCard slaSummary={stats.slaSummary} loading={isLoading} />

    </PageShell>
  )
}
