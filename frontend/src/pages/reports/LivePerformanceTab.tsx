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
import DateNavigator, { addDays, formatRelative } from '../../components/shared/DateNavigator'
import { getManilaDateString } from '../../lib/manila'
import { getSocket } from '../../lib/socket'

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkerRow {
  id: string
  username: string
  isActive: boolean
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
  isHistorical: boolean
  generatedAt: string
  hours: number[]
  totals: { pickers: RoleTotals; packers: RoleTotals }
  hourly: { picker: number[]; packer: number[] }
  pickers: WorkerRow[]
  packers: WorkerRow[]
}

type LiveSortKey = 'completedToday' | 'activeNow' | 'name'

// ─── Color helpers ────────────────────────────────────────────────────────────

const PICKER_COLOR = '#2563eb'
const PACKER_COLOR = '#16a34a'

// Hex → HSL and back, for generating per-worker palette from a base accent.
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const m = hex.replace('#', '')
  const r = parseInt(m.substring(0, 2), 16) / 255
  const g = parseInt(m.substring(2, 4), 16) / 255
  const b = parseInt(m.substring(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break
      case g: h = ((b - r) / d + 2); break
      case b: h = ((r - g) / d + 4); break
    }
    h *= 60
  }
  return { h, s: s * 100, l: l * 100 }
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`
}

// Return a color for worker index `i` out of `total`, varying hue + lightness
// around the base accent so stacked segments stay visually distinct.
function workerColor(baseHex: string, i: number, total: number): string {
  const { h, s, l } = hexToHsl(baseHex)
  if (total <= 1) return baseHex
  // Spread across a ±25° hue window around the base, skewed by index; keep saturation.
  const hueSpread = 50
  const hueStep = hueSpread / Math.max(1, total - 1)
  const newH = (h - hueSpread / 2 + hueStep * i + 360) % 360
  // Alternate lightness to improve contrast between adjacent stacks
  const lightAdj = (i % 2 === 0) ? 0 : -8
  const newL = Math.min(68, Math.max(32, l + lightAdj))
  return hsl(newH, Math.max(40, s - 5), newL)
}

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

function RoleSummaryCard({
  title,
  totals,
  accent,
  isHistorical,
}: {
  title: string
  totals: RoleTotals
  accent: string
  isHistorical: boolean
}) {
  const leaderText = totals.leader ? `${totals.leader.username} (${totals.leader.completedToday})` : '—'
  const completedLabel = isHistorical ? 'Completed' : 'Completed today'
  const rateLabel = isHistorical ? 'Items / work hour' : 'Items / hour'
  return (
    <SectionCard title={title}>
      <div style={{ padding: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <StatCell label={completedLabel} value={totals.completedToday.toLocaleString()} valueColor={totals.completedToday > 0 ? accent : colors.textSecondary} />
        {!isHistorical && (
          <StatCell label="Active now" value={totals.activeNow.toString()} valueColor={totals.activeNow > 0 ? colors.primary : colors.textSecondary} />
        )}
        <StatCell label={rateLabel} value={totals.itemsPerHour.toFixed(1)} />
        <StatCell label="Leader" value={leaderText} />
      </div>
    </SectionCard>
  )
}

// ─── Sort Toggle (scoped to live tab) ─────────────────────────────────────────

function LiveSortToggle({ value, onChange, isHistorical }: { value: LiveSortKey; onChange: (v: LiveSortKey) => void; isHistorical: boolean }) {
  const options: { key: LiveSortKey; label: string }[] = [
    { key: 'completedToday', label: 'Completed ↓' },
    ...(isHistorical ? [] : [{ key: 'activeNow' as LiveSortKey, label: 'Active ↓' }]),
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

function WorkerTable({
  rows,
  sort,
  accent,
  isHistorical,
}: {
  rows: WorkerRow[]
  sort: LiveSortKey
  accent: string
  isHistorical: boolean
}) {
  const sorted = useMemo(() => {
    // Primary: active workers before inactive ones (always)
    // Secondary: user-selected sort key
    return [...rows].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
      if (sort === 'completedToday') return b.completedToday - a.completedToday || a.username.localeCompare(b.username)
      if (sort === 'activeNow') return b.activeNow - a.activeNow || a.username.localeCompare(b.username)
      return a.username.localeCompare(b.username)
    })
  }, [rows, sort])

  if (sorted.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px', color: colors.textSecondary, fontSize: font.md }}>
        {isHistorical ? 'No workers found for this date' : 'No active users on shift'}
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
            <th style={thStyle('left')}>Name</th>
            {!isHistorical && <th style={thStyle()}>Active now</th>}
            <th style={thStyle()}>{isHistorical ? 'Completed' : 'Completed today'}</th>
            {!isHistorical && <th style={thStyle()}>Last hour</th>}
            <th style={thStyle()}>{isHistorical ? 'Items / work hr' : 'Items / hour'}</th>
            <th style={{ ...thStyle(), minWidth: '160px' }}>{isHistorical ? 'Hourly' : 'Today (hourly)'}</th>
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
                  opacity: row.isActive ? 1 : 0.75,
                }}
              >
                <td style={tdStyle('left')}>
                  <span style={{ fontWeight: 600, color: colors.textPrimary }}>{row.username}</span>
                  {!row.isActive && (
                    <span style={{
                      marginLeft: 8, fontSize: 10, fontWeight: 700,
                      color: colors.textMuted, background: colors.surfaceAlt,
                      border: `1px solid ${colors.border}`,
                      padding: '1px 6px', borderRadius: 4, letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}>
                      Inactive
                    </span>
                  )}
                </td>
                {!isHistorical && (
                  <td style={tdStyle()}>
                    <span style={{
                      fontWeight: row.activeNow > 0 ? 700 : 400,
                      color: row.activeNow > 0 ? colors.primary : colors.textSecondary,
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {row.activeNow}
                    </span>
                  </td>
                )}
                <td style={tdStyle()}>
                  <span style={{
                    fontWeight: 700,
                    color: hasToday ? accent : colors.textSecondary,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {row.completedToday}
                  </span>
                </td>
                {!isHistorical && (
                  <td style={tdStyle()}>
                    <span style={{
                      fontVariantNumeric: 'tabular-nums',
                      color: row.completedLastHour > 0 ? colors.textPrimary : colors.textSecondary,
                    }}>
                      {row.completedLastHour}
                    </span>
                  </td>
                )}
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

// ─── Hourly Throughput Chart (aggregate) ──────────────────────────────────────

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

// ─── Per-Worker Hourly Chart (stacked) ────────────────────────────────────────

function PerWorkerHourlyChart({
  workers,
  accent,
}: {
  workers: WorkerRow[]
  accent: string
}) {
  // Only include workers with work on this date, preserving parent sort order
  const withWork = workers.filter((w) => w.completedToday > 0)

  if (withWork.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: colors.textSecondary, fontSize: font.md }}>
        No completions on this date
      </div>
    )
  }

  const data = Array.from({ length: 24 }, (_, h) => {
    const row: Record<string, number | string> = { hour: String(h).padStart(2, '0') }
    for (const w of withWork) row[w.username] = w.hourly[h] ?? 0
    return row
  })

  return (
    <div style={{ width: '100%', height: 300, padding: '12px 12px 4px' }}>
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
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" />
          {withWork.map((w, i) => (
            <Bar
              key={w.id}
              dataKey={w.username}
              stackId="workers"
              fill={workerColor(accent, i, withWork.length)}
              radius={i === withWork.length - 1 ? [3, 3, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Live Status Pill ─────────────────────────────────────────────────────────

function LiveStatusPill({
  connected,
  updatedAt,
  isHistorical,
  manilaDate,
}: {
  connected: boolean
  updatedAt: number | null
  isHistorical: boolean
  manilaDate: string
}) {
  if (isHistorical) {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        padding: '6px 12px', borderRadius: radius.full,
        background: '#fef3c7', border: '1px solid #fcd34d',
        fontSize: 12, color: '#92400e', fontWeight: 600,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: '#d97706',
          boxShadow: '0 0 0 3px rgba(217,119,6,0.18)',
        }} />
        <span style={{ fontWeight: 700 }}>Historical</span>
        <span>· {manilaDate}</span>
      </div>
    )
  }
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
  const todayStr = getManilaDateString()
  const [selectedDate, setSelectedDate] = useState<string>('') // '' = today
  const [pickerSort, setPickerSort] = useState<LiveSortKey>('completedToday')
  const [packerSort, setPackerSort] = useState<LiveSortKey>('completedToday')
  const [socketConnected, setSocketConnected] = useState<boolean>(() => getSocket()?.connected ?? false)

  const isHistorical = selectedDate !== ''
  const minDate = addDays(todayStr, -89)
  const dateParam = isHistorical ? `?date=${selectedDate}` : ''

  const { data, isLoading, isError, dataUpdatedAt } = useQuery<LivePerformanceData>({
    queryKey: ['reports', 'live-performance', selectedDate],
    queryFn: async () => (await api.get<LivePerformanceData>(`/reports/live-performance${dateParam}`)).data,
    refetchInterval: isHistorical ? false : 30_000,
    staleTime: isHistorical ? 5 * 60_000 : 10_000,
    refetchOnWindowFocus: !isHistorical,
  })

  useEffect(() => {
    if (isHistorical) return
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
  }, [queryClient, isHistorical])

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: colors.textSecondary }}>
        Loading performance data...
      </div>
    )
  }
  if (isError || !data) {
    return (
      <div style={{
        textAlign: 'center', padding: '40px', color: '#ef4444',
        background: '#fef2f2', borderRadius: radius.lg, border: '1px solid #fecaca',
      }}>
        Failed to load performance data. Retrying...
      </div>
    )
  }

  const activeDate = selectedDate || todayStr
  const dateLabel = data.isHistorical
    ? `${data.manilaDate} (${formatRelative(activeDate, todayStr)})`
    : `Today · ${data.manilaDate}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header: date navigator + status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <DateNavigator
            value={selectedDate}
            todayStr={todayStr}
            onChange={setSelectedDate}
            minDate={minDate}
          />
          <div style={{ fontSize: 13, color: colors.textSecondary }}>
            <strong style={{ color: colors.textPrimary }}>{dateLabel}</strong> · Asia/Manila
          </div>
        </div>
        <LiveStatusPill
          connected={socketConnected}
          updatedAt={dataUpdatedAt || null}
          isHistorical={data.isHistorical}
          manilaDate={data.manilaDate}
        />
      </div>

      {/* Role summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <RoleSummaryCard
          title={data.isHistorical ? `Pickers — ${data.manilaDate}` : 'Pickers — Today'}
          totals={data.totals.pickers}
          accent={PICKER_COLOR}
          isHistorical={data.isHistorical}
        />
        <RoleSummaryCard
          title={data.isHistorical ? `Packers — ${data.manilaDate}` : 'Packers — Today'}
          totals={data.totals.packers}
          accent={PACKER_COLOR}
          isHistorical={data.isHistorical}
        />
      </div>

      {/* Aggregate hourly throughput */}
      <SectionCard title={`Hourly Throughput — ${data.isHistorical ? data.manilaDate : 'Today'} (Asia/Manila)`}>
        <HourlyThroughputChart hours={data.hours} picker={data.hourly.picker} packer={data.hourly.packer} />
      </SectionCard>

      {/* Per-worker hourly — Pickers */}
      <SectionCard title={`Pickers — Hourly (Per Worker) — ${data.isHistorical ? data.manilaDate : 'Today'}`}>
        <PerWorkerHourlyChart workers={data.pickers} accent={PICKER_COLOR} />
      </SectionCard>

      {/* Per-worker hourly — Packers */}
      <SectionCard title={`Packers — Hourly (Per Worker) — ${data.isHistorical ? data.manilaDate : 'Today'}`}>
        <PerWorkerHourlyChart workers={data.packers} accent={PACKER_COLOR} />
      </SectionCard>

      {/* Per-worker tables */}
      <SectionCard
        title={`Pickers — ${data.isHistorical ? 'Breakdown' : 'Live'} (${data.pickers.length})`}
        actions={<LiveSortToggle value={pickerSort} onChange={setPickerSort} isHistorical={data.isHistorical} />}
      >
        <WorkerTable rows={data.pickers} sort={pickerSort} accent={PICKER_COLOR} isHistorical={data.isHistorical} />
      </SectionCard>

      <SectionCard
        title={`Packers — ${data.isHistorical ? 'Breakdown' : 'Live'} (${data.packers.length})`}
        actions={<LiveSortToggle value={packerSort} onChange={setPackerSort} isHistorical={data.isHistorical} />}
      >
        <WorkerTable rows={data.packers} sort={packerSort} accent={PACKER_COLOR} isHistorical={data.isHistorical} />
      </SectionCard>
    </div>
  )
}
