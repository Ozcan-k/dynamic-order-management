import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'
import PageShell from '../components/shared/PageShell'
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

type PresetKey = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom'

const PRESET_LABELS: Record<PresetKey, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  '7d': '7 days',
  '30d': '30 days',
  month: 'This month',
  custom: 'Custom',
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

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

// ─── Icons ────────────────────────────────────────────────────────────────────

const svgProps = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}

const DashboardIcon = () => (
  <svg width="20" height="20" {...svgProps}>
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
)
const PipelineGlyph = (
  <svg width="18" height="18" {...svgProps}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
)
const AlertGlyph = (
  <svg width="18" height="18" {...svgProps}>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)
const CarryoverGlyph = (
  <svg width="18" height="18" {...svgProps}><path d="M3 2v6h6" /><path d="M3 13a9 9 0 1 0 3-7.7L3 8" /></svg>
)
const BoxGlyph = (
  <svg width="16" height="16" {...svgProps}>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
)
const ClockGlyph = (
  <svg width="16" height="16" {...svgProps}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
)
const TrendGlyph = (
  <svg width="16" height="16" {...svgProps}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
)
const InGlyph = (
  <svg width="14" height="14" {...svgProps}><polyline points="8 17 12 21 16 17" /><line x1="12" y1="12" x2="12" y2="21" /><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29" /></svg>
)
const OutGlyph = (
  <svg width="14" height="14" {...svgProps}><polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" /><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" /></svg>
)

// ─── Sub-components ───────────────────────────────────────────────────────────

function HeroStat({ icon, tint, value, label, loading }: {
  icon: React.ReactNode; tint: string; value: string | number; label: string; loading: boolean
}) {
  return (
    <div className="db-hero-stat">
      <span className="db-hero-stat-icon" style={{ background: `${tint}2e`, color: tint }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div className="db-hero-stat-value">
          {loading ? '—' : typeof value === 'number' ? <NumberTicker value={value} /> : value}
        </div>
        <div className="db-hero-stat-label">{label}</div>
      </div>
    </div>
  )
}

function KpiTile({ label, value, color, subtitle, icon, loading, alert, tag }: {
  label: string; value: number; color: string; subtitle: string; icon: React.ReactNode
  loading: boolean; alert?: boolean; tag?: { text: string; tone: 'ok' | 'danger' | 'warn' }
}) {
  return (
    <div className={`db-kpi${alert ? ' db-kpi--alert' : ''}`} style={{ '--kpi': color } as React.CSSProperties}>
      <div className="db-kpi-top">
        <span className="db-kpi-label">
          <span className="db-kpi-icon">{icon}</span>
          {label}
        </span>
        {tag && !loading && <span className={`db-tag db-tag--${tag.tone}`}>{tag.text}</span>}
      </div>
      <div className="db-kpi-value">{loading ? '—' : <NumberTicker value={value} />}</div>
      <div className="db-kpi-sub">{subtitle}</div>
    </div>
  )
}

type FloorKey = 'queue' | 'pAssigned' | 'picking' | 'waiting' | 'kAssigned' | 'packing'
interface FloorRow { key: FloorKey; label: string; color: string }

const FLOOR_GROUPS: { title: string; rows: FloorRow[] }[] = [
  {
    title: 'Picking',
    rows: [
      { key: 'queue',     label: 'In queue',        color: '#93c5fd' },
      { key: 'pAssigned', label: 'Assigned',        color: '#3b82f6' },
      { key: 'picking',   label: 'Picking',         color: '#1d4ed8' },
    ],
  },
  {
    title: 'Packing',
    rows: [
      { key: 'waiting',   label: 'Waiting to pack', color: '#c4b5fd' },
      { key: 'kAssigned', label: 'Assigned',        color: '#8b5cf6' },
      { key: 'packing',   label: 'Packing',         color: '#6d28d9' },
    ],
  },
]

function LiveFloorCard({ stats, loading }: { stats: DashboardStats; loading: boolean }) {
  const values: Record<FloorKey, number> = {
    queue: stats.pickerSummary.inbound,
    pAssigned: stats.pickerSummary.assigned,
    picking: stats.pickerSummary.inProgress,
    waiting: stats.packerSummary.unassigned,
    kAssigned: stats.packerSummary.assigned,
    packing: stats.packerSummary.inProgress,
  }
  const all = FLOOR_GROUPS.flatMap((g) => g.rows)
  const total = all.reduce((s, r) => s + values[r.key], 0)
  const peak = Math.max(1, ...all.map((r) => values[r.key]))

  return (
    <div className="db-card" style={{ height: '100%', boxSizing: 'border-box' }}>
      <div className="db-card-head" style={{ marginBottom: 12 }}>
        <div>
          <h3 className="db-card-title">Live Floor</h3>
          <p className="db-card-sub">Where open orders are right now</p>
        </div>
        <span className="db-pill">{loading ? '—' : total} on floor</span>
      </div>

      <div className="db-floor-bar" aria-hidden="true">
        {!loading && total > 0 && all.map((r) => (
          values[r.key] > 0 && (
            <span key={r.key} title={`${r.label}: ${values[r.key]}`}
              style={{ width: `${(values[r.key] / total) * 100}%`, background: r.color }} />
          )
        ))}
      </div>

      {!loading && total === 0 ? (
        <div className="db-empty">Floor is clear — nothing in picking or packing.</div>
      ) : (
        FLOOR_GROUPS.map((g) => (
          <div key={g.title} className="db-floor-group">
            <div className="db-floor-group-title">
              <span>{g.title}</span>
              <b>{loading ? '—' : g.rows.reduce((s, r) => s + values[r.key], 0)}</b>
            </div>
            {g.rows.map((r) => (
              <div key={r.key} className="db-floor-row">
                <span className="db-dot" style={{ background: r.color }} />
                <span>{r.label}</span>
                <span className="db-floor-track">
                  <span style={{ width: `${loading ? 0 : (values[r.key] / peak) * 100}%`, background: r.color }} />
                </span>
                <span className="db-num">{loading ? '—' : values[r.key]}</span>
              </div>
            ))}
          </div>
        ))
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

  const sla = stats.slaSummary
  const slaTotal = sla.d0 + sla.d1 + sla.d2 + sla.d3 + sla.d4
  const onTimePct = slaTotal > 0 ? Math.round((sla.d0 / slaTotal) * 100) : 100

  const volIn = rangeData?.inboundTotal ?? 0
  const volOut = rangeData?.outboundTotal ?? 0
  const volPeak = Math.max(1, volIn, volOut)
  const perDay = (v: number) => (rangeDays > 1 ? `${Math.round(v / rangeDays).toLocaleString('en-US')} / day avg` : 'Single day')

  return (
    <PageShell
      icon={<DashboardIcon />}
      title="Dashboard"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
    >

      {/* ── Hero: greeting + clock + live pulse ─────────────────────── */}
      <div className="dashboard-hero">
        <div className="dashboard-hero-bg" aria-hidden="true" />
        <div className="dashboard-hero-inner">
          <div className="dashboard-hero-greeting">
            <span className="dashboard-hero-eyebrow">{getGreeting(now)}</span>
            <h2 className="dashboard-hero-name">{user?.username ?? 'Admin'}</h2>
            <span className="dashboard-hero-subtitle">{weekday} · {dateStr}</span>
          </div>

          <div className="dashboard-hero-clock">
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

        <div className="db-hero-pulse">
          <HeroStat icon={BoxGlyph} tint="#60a5fa" value={stats.remainingCount} label="Active orders in warehouse" loading={isLoading} />
          <HeroStat icon={ClockGlyph} tint="#34d399" value={`${onTimePct}%`} label="Open orders on time (D0)" loading={isLoading} />
          <HeroStat icon={TrendGlyph} tint="#fbbf24" value={sla.escalatedToday} label="SLA escalations today" loading={isLoading} />
        </div>
      </div>

      {/* ── Order Summary ───────────────────────────────────────────── */}
      <div className="db-kpis">
        <KpiTile
          label="In Pipeline" value={outbound.missingCount} color="#2563eb"
          subtitle="Not yet dispatched" icon={PipelineGlyph} loading={outboundLoading}
        />
        <KpiTile
          label="D4 — Not Shipped" value={outbound.d4Count} color="#dc2626"
          subtitle="Urgent dispatch needed" icon={AlertGlyph} loading={outboundLoading}
          alert={outbound.d4Count > 0}
          tag={outbound.d4Count > 0 ? { text: 'Act now', tone: 'danger' } : { text: 'All clear', tone: 'ok' }}
        />
        <KpiTile
          label="Carryover Active" value={stats.carryoverCount} color="#d97706"
          subtitle="From previous days" icon={CarryoverGlyph} loading={isLoading}
          tag={stats.carryoverCount > 0 ? { text: 'Backlog', tone: 'warn' } : undefined}
        />
      </div>

      {/* ── Order Pipeline (identical to the Outbound Report funnel) ── */}
      <OrderPipelineFunnel
        data={pipelineData}
        loading={pipelineLoading}
        rangeLabel="Today"
        caption="Inbound → Packer Complete are warehouse milestones (distinct orders that reached each stage today). Outbound counts only parcels actually scanned out today; of those, old orders were packed earlier and shipped now (backlog)."
      />

      {/* ── Live floor + SLA ────────────────────────────────────────── */}
      <div className="db-grid">
        <div className="db-span-5">
          <LiveFloorCard stats={stats} loading={isLoading} />
        </div>
        <div className="db-span-7">
          <SlaSummaryCard slaSummary={stats.slaSummary} loading={isLoading} />
        </div>
      </div>

      {/* ── Volume Report ───────────────────────────────────────────── */}
      <div className="db-card">
        <div className="db-card-head">
          <div>
            <h3 className="db-card-title">Volume Report</h3>
            <p className="db-card-sub">
              {formatShort(rangeStart)} → {formatShort(rangeEnd)} · {rangeDays} day{rangeDays === 1 ? '' : 's'}
            </p>
          </div>
          <div className="db-seg" role="group" aria-label="Date range">
            {(['today', 'yesterday', '7d', '30d', 'month', 'custom'] as PresetKey[]).map((k) => (
              <button key={k} type="button" aria-pressed={preset === k} onClick={() => applyPreset(k)}>
                {PRESET_LABELS[k]}
              </button>
            ))}
          </div>
        </div>

        {preset === 'custom' && (
          <div className="db-range">
            <label htmlFor="db-from">From</label>
            <input id="db-from" type="date" value={rangeStart} max={todayStr} onChange={(e) => onStartChange(e.target.value)} />
            <label htmlFor="db-to">To</label>
            <input id="db-to" type="date" value={rangeEnd} max={todayStr} onChange={(e) => onEndChange(e.target.value)} />
          </div>
        )}

        <div className="db-vol">
          <div className="db-vol-item" style={{ '--vol': '#2563eb' } as React.CSSProperties}>
            <div className="db-vol-head">{InGlyph} Total Inbound</div>
            <div className="db-vol-value">{rangeLoading ? '—' : <NumberTicker value={volIn} />}</div>
            <div className="db-vol-sub">{rangeLoading ? '—' : perDay(volIn)}</div>
          </div>
          <div className="db-vol-item" style={{ '--vol': '#16a34a' } as React.CSSProperties}>
            <div className="db-vol-head">{OutGlyph} Total Outbound</div>
            <div className="db-vol-value">{rangeLoading ? '—' : <NumberTicker value={volOut} />}</div>
            <div className="db-vol-sub">{rangeLoading ? '—' : perDay(volOut)}</div>
          </div>
          <div className="db-vol-item db-vol-compare" style={{ '--vol': '#64748b' } as React.CSSProperties}>
            <div className="db-vol-head">Inbound vs Outbound</div>
            <div className="db-vol-compare-rows">
              <div className="db-vol-compare-row">
                <span>Inbound</span>
                <span className="db-floor-track"><span style={{ width: `${rangeLoading ? 0 : (volIn / volPeak) * 100}%`, background: '#2563eb' }} /></span>
                <span className="db-num">{rangeLoading ? '—' : volIn.toLocaleString('en-US')}</span>
              </div>
              <div className="db-vol-compare-row">
                <span>Outbound</span>
                <span className="db-floor-track"><span style={{ width: `${rangeLoading ? 0 : (volOut / volPeak) * 100}%`, background: '#16a34a' }} /></span>
                <span className="db-num">{rangeLoading ? '—' : volOut.toLocaleString('en-US')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

    </PageShell>
  )
}
