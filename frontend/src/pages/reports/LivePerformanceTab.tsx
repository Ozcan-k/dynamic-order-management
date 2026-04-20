import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '../../api/client'
import { colors, radius, shadow, font } from '../../theme'
import Sparkline from '../../components/shared/Sparkline'
import { getSocket } from '../../lib/socket'

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkerRow {
  id: string
  username: string
  activeNow: number
  completedToday: number
  completedLastHour: number
  itemsPerHour: number
  hourly: number[]
}

interface RoleTotals {
  completedToday: number
  activeNow: number
  itemsPerHour: number
  leader: { id: string; username: string; completedToday: number } | null
}

interface LivePerformanceData {
  manilaDate: string
  generatedAt: string
  hours: number[]
  totals: { pickers: RoleTotals; packers: RoleTotals }
  hourly: { picker: number[]; packer: number[] }
  pickers: WorkerRow[]
  packers: WorkerRow[]
}

type LiveSortKey = 'completedToday' | 'activeNow' | 'name'

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.xl,
      boxShadow: shadow.card,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 20px',
        borderBottom: `1px solid ${colors.border}`,
        background: colors.surfaceAlt,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        flexWrap: 'wrap',
      }}>
        <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: colors.textPrimary }}>{title}</h2>
        {actions}
      </div>
      {children}
    </div>
  )
}

function StatCell({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{
      flex: '1 1 120px',
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.lg,
      padding: '12px 16px',
    }}>
      <div style={{
        fontSize: font.xs, color: colors.textSecondary, marginBottom: '4px',
        textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: '20px', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
        color: valueColor ?? colors.textPrimary,
      }}>
        {value}
      </div>
    </div>
  )
}

function RoleSummaryCard({ title, totals, accent }: { title: string; totals: RoleTotals; accent: string }) {
  const leaderText = totals.leader ? `${totals.leader.username} (${totals.leader.completedToday})` : '—'
  return (
    <SectionCard title={title}>
      <div style={{ padding: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <StatCell label="Completed today" value={totals.completedToday.toLocaleString()} valueColor={totals.completedToday > 0 ? accent : colors.textSecondary} />
        <StatCell label="Active now" value={totals.activeNow.toString()} valueColor={totals.activeNow > 0 ? colors.primary : colors.textSecondary} />
        <StatCell label="Items / hour" value={totals.itemsPerHour.toFixed(1)} />
        <StatCell label="Leader" value={leaderText} />
      </div>
    </SectionCard>
  )
}

// ─── Sort Toggle (scoped to live tab) ─────────────────────────────────────────

function LiveSortToggle({ value, onChange }: { value: LiveSortKey; onChange: (v: LiveSortKey) => void }) {
  const options: { key: LiveSortKey; label: string }[] = [
    { key: 'completedToday', label: 'Completed ↓' },
    { key: 'activeNow', label: 'Active ↓' },
    { key: 'name', label: 'Name ↑' },
  ]
  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          style={{
            padding: '5px 12px',
            fontSize: '12px',
            fontWeight: 600,
            borderRadius: radius.md,
            border: `1.5px solid ${value === o.key ? '#3b82f6' : colors.border}`,
            background: value === o.key ? '#eff6ff' : colors.surface,
            color: value === o.key ? '#1d4ed8' : colors.textSecondary,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ─── Worker Table ─────────────────────────────────────────────────────────────

const thStyle = (align: 'left' | 'right' = 'right'): React.CSSProperties => ({
  padding: '10px 14px',
  textAlign: align,
  fontSize: '11px',
  fontWeight: 700,
  color: colors.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
})

const tdStyle = (align: 'left' | 'right' = 'right'): React.CSSProperties => ({
  padding: '10px 14px',
  textAlign: align,
  fontSize: '13px',
  whiteSpace: 'nowrap',
})

function WorkerTable({ rows, sort, accent }: { rows: WorkerRow[]; sort: LiveSortKey; accent: string }) {
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (sort === 'completedToday') return b.completedToday - a.completedToday || a.username.localeCompare(b.username)
      if (sort === 'activeNow') return b.activeNow - a.activeNow || a.username.localeCompare(b.username)
      return a.username.localeCompare(b.username)
    })
  }, [rows, sort])

  if (sorted.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px', color: colors.textSecondary, fontSize: font.md }}>
        No active users on shift
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
            <th style={thStyle('left')}>Name</th>
            <th style={thStyle()}>Active now</th>
            <th style={thStyle()}>Completed today</th>
            <th style={thStyle()}>Last hour</th>
            <th style={thStyle()}>Items / hour</th>
            <th style={{ ...thStyle(), minWidth: '160px' }}>Today (hourly)</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const isEven = i % 2 === 0
            const hasToday = row.completedToday > 0
            return (
              <tr
                key={row.id}
                style={{
                  background: isEven ? colors.surface : colors.surfaceAlt,
                  borderBottom: `1px solid ${colors.border}`,
                }}
              >
                <td style={tdStyle('left')}>
                  <span style={{ fontWeight: 600, color: colors.textPrimary }}>{row.username}</span>
                </td>
                <td style={tdStyle()}>
                  <span style={{
                    fontWeight: row.activeNow > 0 ? 700 : 400,
                    color: row.activeNow > 0 ? colors.primary : colors.textSecondary,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {row.activeNow}
                  </span>
                </td>
                <td style={tdStyle()}>
                  <span style={{
                    fontWeight: 700,
                    color: hasToday ? accent : colors.textSecondary,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {row.completedToday}
                  </span>
                </td>
                <td style={tdStyle()}>
                  <span style={{
                    fontVariantNumeric: 'tabular-nums',
                    color: row.completedLastHour > 0 ? colors.textPrimary : colors.textSecondary,
                  }}>
                    {row.completedLastHour}
                  </span>
                </td>
                <td style={tdStyle()}>
                  <span style={{ fontVariantNumeric: 'tabular-nums', color: colors.textPrimary }}>
                    {row.itemsPerHour.toFixed(1)}
                  </span>
                </td>
                <td style={{ ...tdStyle(), paddingTop: '8px', paddingBottom: '8px' }}>
                  {hasToday ? (
                    <Sparkline
                      data={row.hourly}
                      color={accent}
                      width={140}
                      height={24}
                      title={`Hourly completions: ${row.hourly.map((v, h) => `${String(h).padStart(2, '0')}:00=${v}`).join(' · ')}`}
                    />
                  ) : (
                    <span style={{ color: colors.textMuted, fontSize: 11 }}>—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Hourly Throughput Chart ──────────────────────────────────────────────────

const PICKER_COLOR = '#2563eb'
const PACKER_COLOR = '#16a34a'

function HourlyThroughputChart({ hours, picker, packer }: { hours: number[]; picker: number[]; packer: number[] }) {
  const data = hours.map((h, i) => ({
    hour: `${String(h).padStart(2, '0')}`,
    Pickers: picker[i] ?? 0,
    Packers: packer[i] ?? 0,
  }))
  return (
    <div style={{ width: '100%', height: 260, padding: '12px 12px 4px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
          <XAxis
            dataKey="hour"
            tick={{ fontSize: 11, fill: colors.textSecondary }}
            tickLine={false}
            axisLine={{ stroke: colors.border }}
            label={{ value: 'Hour (Manila)', position: 'insideBottom', offset: -2, fontSize: 11, fill: colors.textMuted }}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: colors.textSecondary }}
            tickLine={false}
            axisLine={{ stroke: colors.border }}
            width={36}
          />
          <Tooltip
            cursor={{ fill: 'rgba(148,163,184,0.08)' }}
            contentStyle={{ borderRadius: 8, fontSize: 12, border: `1px solid ${colors.border}` }}
            labelFormatter={(h) => `${h}:00`}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
          <Bar dataKey="Pickers" fill={PICKER_COLOR} radius={[3, 3, 0, 0]} />
          <Bar dataKey="Packers" fill={PACKER_COLOR} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Live Status Pill ─────────────────────────────────────────────────────────

function LiveStatusPill({ connected, updatedAt }: { connected: boolean; updatedAt: number | null }) {
  const updatedStr = updatedAt
    ? new Date(updatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' })
    : '—'
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 10,
      padding: '6px 12px', borderRadius: radius.full,
      background: colors.surfaceAlt, border: `1px solid ${colors.border}`,
      fontSize: 12, color: colors.textSecondary, fontWeight: 500,
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: connected ? '#10b981' : '#f59e0b',
        boxShadow: connected ? '0 0 0 3px rgba(16,185,129,0.18)' : '0 0 0 3px rgba(245,158,11,0.18)',
      }} />
      <span style={{ fontWeight: 700, color: connected ? '#047857' : '#b45309' }}>
        {connected ? 'Live' : 'Polling'}
      </span>
      <span>· Last updated {updatedStr}</span>
    </div>
  )
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export default function LivePerformanceTab() {
  const queryClient = useQueryClient()
  const [pickerSort, setPickerSort] = useState<LiveSortKey>('completedToday')
  const [packerSort, setPackerSort] = useState<LiveSortKey>('completedToday')
  const [socketConnected, setSocketConnected] = useState<boolean>(() => getSocket()?.connected ?? false)

  const { data, isLoading, isError, dataUpdatedAt } = useQuery<LivePerformanceData>({
    queryKey: ['reports', 'live-performance'],
    queryFn: async () => (await api.get<LivePerformanceData>('/reports/live-performance')).data,
    refetchInterval: 30_000,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  })

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['reports', 'live-performance'] })
    const onConnect = () => setSocketConnected(true)
    const onDisconnect = () => setSocketConnected(false)
    setSocketConnected(socket.connected)
    socket.on('order:stats_changed', invalidate)
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    return () => {
      socket.off('order:stats_changed', invalidate)
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
    }
  }, [queryClient])

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: colors.textSecondary }}>
        Loading live performance...
      </div>
    )
  }
  if (isError || !data) {
    return (
      <div style={{
        textAlign: 'center', padding: '40px', color: '#ef4444',
        background: '#fef2f2', borderRadius: radius.lg, border: '1px solid #fecaca',
      }}>
        Failed to load live performance. Retrying...
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header strip */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13, color: colors.textSecondary }}>
          Today · <strong style={{ color: colors.textPrimary }}>{data.manilaDate}</strong> · Asia/Manila
        </div>
        <LiveStatusPill connected={socketConnected} updatedAt={dataUpdatedAt || null} />
      </div>

      {/* Role summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <RoleSummaryCard title="Pickers — Today" totals={data.totals.pickers} accent={PICKER_COLOR} />
        <RoleSummaryCard title="Packers — Today" totals={data.totals.packers} accent={PACKER_COLOR} />
      </div>

      {/* Hourly throughput chart */}
      <SectionCard title="Hourly Throughput — Today (Asia/Manila)">
        <HourlyThroughputChart hours={data.hours} picker={data.hourly.picker} packer={data.hourly.packer} />
      </SectionCard>

      {/* Per-worker tables */}
      <SectionCard
        title={`Pickers — Live (${data.pickers.length})`}
        actions={<LiveSortToggle value={pickerSort} onChange={setPickerSort} />}
      >
        <WorkerTable rows={data.pickers} sort={pickerSort} accent={PICKER_COLOR} />
      </SectionCard>

      <SectionCard
        title={`Packers — Live (${data.packers.length})`}
        actions={<LiveSortToggle value={packerSort} onChange={setPackerSort} />}
      >
        <WorkerTable rows={data.packers} sort={packerSort} accent={PACKER_COLOR} />
      </SectionCard>
    </div>
  )
}
