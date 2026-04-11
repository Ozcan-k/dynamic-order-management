import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'
import { colors } from '../theme'
import PageShell from '../components/shared/PageShell'
import StatCard from '../components/shared/StatCard'
import SectionHeader from '../components/shared/SectionHeader'
import { getSocket } from '../lib/socket'

interface DashboardStats {
  inboundTotal: number
  outboundTotal: number
  remainingCount: number
  pickerSummary: {
    inbound: number
    assigned: number
    inProgress: number
    complete: number
  }
  packerSummary: {
    unassigned: number
    assigned: number
    inProgress: number
    complete: number
  }
  slaSummary: {
    d0: number
    d1: number
    d2: number
    d3: number
    d4: number
  }
}

const DashboardIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
)

const SLA_COLORS: Record<string, string> = {
  d0: '#10b981',
  d1: '#f59e0b',
  d2: '#f97316',
  d3: '#ef4444',
  d4: '#dc2626',
}

const SLA_LABELS: Record<string, string> = {
  d0: 'D0 — On Time',
  d1: 'D1 — 4–8h',
  d2: 'D2 — 8–12h',
  d3: 'D3 — 12–16h',
  d4: 'D4 — 16h+',
}

export default function Dashboard() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [now, setNow] = useState(new Date())

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Dashboard stats query — refetch every 10s
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const res = await api.get<DashboardStats>('/reports/dashboard')
      return res.data
    },
    refetchInterval: 10_000,
  })

  // Refresh stats on SLA escalation events
  useEffect(() => {
    const socket = getSocket()
    if (!socket) return
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    }
    socket.on('sla:escalated', handler)
    return () => { socket.off('sla:escalated', handler) }
  }, [queryClient])

  const stats = data ?? {
    inboundTotal: 0,
    outboundTotal: 0,
    remainingCount: 0,
    pickerSummary: { inbound: 0, assigned: 0, inProgress: 0, complete: 0 },
    packerSummary: { unassigned: 0, assigned: 0, inProgress: 0, complete: 0 },
    slaSummary: { d0: 0, d1: 0, d2: 0, d3: 0, d4: 0 },
  }

  const slaTotal = Object.values(stats.slaSummary).reduce((a, b) => a + b, 0)

  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <PageShell
      icon={<DashboardIcon />}
      title="Dashboard"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
      stats={
        <>
          <StatCard label="Total Scanned" value={isLoading ? '—' : stats.inboundTotal} color={colors.primary} />
          <StatCard label="Dispatched" value={isLoading ? '—' : stats.outboundTotal} color="#10b981" />
          <StatCard label="Remaining" value={isLoading ? '—' : stats.remainingCount} color="#f59e0b" />
        </>
      }
    >
      {/* Live clock */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '28px' }}>
        <span style={{ fontSize: '32px', fontWeight: 700, color: colors.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
          {timeStr}
        </span>
        <span style={{ fontSize: '14px', color: colors.textSecondary }}>{dateStr}</span>
      </div>

      {/* Picker Summary */}
      <SectionHeader title="Picker Summary" />
      <div className="stats-grid" style={{ marginBottom: '28px' }}>
        {[
          { label: 'Inbound Queue', value: stats.pickerSummary.inbound, color: colors.textSecondary },
          { label: 'Assigned', value: stats.pickerSummary.assigned, color: colors.primary },
          { label: 'In Progress', value: stats.pickerSummary.inProgress, color: '#f59e0b' },
          { label: 'Completed', value: stats.pickerSummary.complete, color: '#10b981' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: '8px',
            padding: '16px 20px',
          }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: '12px', color: colors.textSecondary, marginTop: '4px' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Packer Summary */}
      <SectionHeader title="Packer Summary" />
      <div className="stats-grid" style={{ marginBottom: '28px' }}>
        {[
          { label: 'Unassigned', value: stats.packerSummary.unassigned, color: colors.textSecondary },
          { label: 'Assigned', value: stats.packerSummary.assigned, color: colors.primary },
          { label: 'In Progress', value: stats.packerSummary.inProgress, color: '#f59e0b' },
          { label: 'Completed', value: stats.packerSummary.complete, color: '#10b981' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: '8px',
            padding: '16px 20px',
          }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: '12px', color: colors.textSecondary, marginTop: '4px' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* SLA Summary */}
      <SectionHeader title="SLA Summary" />
      <div style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: '8px',
        padding: '20px 24px',
      }}>
        {/* Bar */}
        {slaTotal > 0 && (
          <div style={{ display: 'flex', height: '12px', borderRadius: '6px', overflow: 'hidden', marginBottom: '16px' }}>
            {(['d0', 'd1', 'd2', 'd3', 'd4'] as const).map((key) => {
              const pct = (stats.slaSummary[key] / slaTotal) * 100
              if (pct === 0) return null
              return (
                <div
                  key={key}
                  title={`${SLA_LABELS[key]}: ${stats.slaSummary[key]}`}
                  style={{ width: `${pct}%`, background: SLA_COLORS[key] }}
                />
              )
            })}
          </div>
        )}

        {/* Legend */}
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          {(['d0', 'd1', 'd2', 'd3', 'd4'] as const).map((key) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '10px', height: '10px', borderRadius: '50%',
                background: SLA_COLORS[key], flexShrink: 0,
              }} />
              <span style={{ fontSize: '13px', color: colors.textSecondary }}>{SLA_LABELS[key]}</span>
              <span style={{
                fontSize: '13px', fontWeight: 700,
                color: key === 'd4' ? '#dc2626' : colors.textPrimary,
              }}>
                {stats.slaSummary[key]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  )
}
