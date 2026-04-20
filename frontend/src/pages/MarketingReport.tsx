import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import PageShell from '../components/shared/PageShell'
import AgentDetailPanel from '../components/sales/AgentDetailPanel'
import {
  fetchComparison,
  fetchLeaderboard,
  fetchMarketingAgents,
  type LeaderboardRow,
} from '../api/marketing'
import { useAuthStore } from '../stores/authStore'

function TrendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}

function todayManila(): string {
  const ms = Date.now() + 8 * 60 * 60 * 1000
  return new Date(ms).toISOString().slice(0, 10)
}

function shiftDate(dateStr: string, days: number): string {
  const ms = new Date(`${dateStr}T00:00:00.000Z`).getTime() + days * 24 * 60 * 60 * 1000
  return new Date(ms).toISOString().slice(0, 10)
}

const CHART_PALETTE = ['#1d4ed8', '#15803d', '#b45309', '#7c3aed', '#dc2626', '#0891b2', '#db2777', '#ca8a04']

const PRESET_RANGES = [
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
] as const

type SortKey = 'username' | 'posts' | 'liveHours' | 'directSales' | 'inquiries' | 'ordersCount' | 'score'

function computeScore(r: LeaderboardRow): number {
  return r.posts * 1.0 + r.liveHours * 2.0 + r.directSales / 1000 + r.inquiries * 1.5
}

export default function MarketingReport() {
  const user = useAuthStore((s) => s.user)
  const today = todayManila()

  const [presetId, setPresetId] = useState<string>('30')
  const [customFrom, setCustomFrom] = useState<string>(shiftDate(today, -29))
  const [customTo, setCustomTo] = useState<string>(today)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)

  const { from, to } = useMemo(() => {
    if (presetId === 'custom') return { from: customFrom, to: customTo }
    const days = PRESET_RANGES.find((p) => p.id === presetId)?.days ?? 30
    return { from: shiftDate(today, -(days - 1)), to: today }
  }, [presetId, customFrom, customTo, today])

  const agentsQuery = useQuery({ queryKey: ['marketing-agents'], queryFn: fetchMarketingAgents })
  const leaderboardQuery = useQuery({
    queryKey: ['marketing-leaderboard', from, to],
    queryFn: () => fetchLeaderboard(from, to),
    staleTime: 30_000,
  })
  const comparisonQuery = useQuery({
    queryKey: ['marketing-comparison', from, to],
    queryFn: () => fetchComparison(from, to),
    staleTime: 30_000,
  })

  const selectedAgent = selectedAgentId ? agentsQuery.data?.find((a) => a.id === selectedAgentId) ?? null : null

  if (selectedAgent) {
    return (
      <AgentDetailPanel
        agent={selectedAgent}
        onBack={() => setSelectedAgentId(null)}
      />
    )
  }

  return (
    <PageShell
      icon={<TrendIcon />}
      title="Marketing Report"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
    >
      {/* Range filter strip */}
      <div style={{
        background: 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)',
        color: '#fff',
        borderRadius: '14px',
        padding: '16px 18px',
        marginBottom: '14px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '14px',
        boxShadow: '0 4px 12px rgba(29,78,216,0.18)',
      }}>
        <div style={{ flex: '1 1 auto', minWidth: '200px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)', marginBottom: '4px' }}>Date Range</div>
          <div style={{ fontSize: '18px', fontWeight: 700 }}>{from} → {to}</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {PRESET_RANGES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPresetId(p.id)}
              style={{
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: 700,
                border: 'none',
                borderRadius: '9999px',
                background: presetId === p.id ? '#fff' : 'rgba(255,255,255,0.18)',
                color: presetId === p.id ? '#1d4ed8' : '#fff',
                cursor: 'pointer',
              }}
            >{p.label}</button>
          ))}
          <button
            type="button"
            onClick={() => setPresetId('custom')}
            style={{
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 700,
              border: 'none',
              borderRadius: '9999px',
              background: presetId === 'custom' ? '#fff' : 'rgba(255,255,255,0.18)',
              color: presetId === 'custom' ? '#1d4ed8' : '#fff',
              cursor: 'pointer',
            }}
          >Custom</button>
        </div>
        {presetId === 'custom' && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: '8px', border: 'none', fontWeight: 600, color: '#0f172a' }} />
            <span>→</span>
            <input type="date" value={customTo} min={customFrom} max={today} onChange={(e) => setCustomTo(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: '8px', border: 'none', fontWeight: 600, color: '#0f172a' }} />
          </div>
        )}
      </div>

      <Totals rows={leaderboardQuery.data ?? []} loading={leaderboardQuery.isLoading} />

      <ChartsGrid
        rows={leaderboardQuery.data ?? []}
        trends={comparisonQuery.data ?? []}
        loading={leaderboardQuery.isLoading || comparisonQuery.isLoading}
      />

      <Leaderboard
        rows={leaderboardQuery.data ?? []}
        loading={leaderboardQuery.isLoading}
        onSelect={setSelectedAgentId}
      />
    </PageShell>
  )
}

function Totals({ rows, loading }: { rows: LeaderboardRow[]; loading: boolean }) {
  const totals = useMemo(() => rows.reduce(
    (acc, r) => ({
      posts: acc.posts + r.posts,
      liveHours: acc.liveHours + r.liveHours,
      directSales: acc.directSales + r.directSales,
      inquiries: acc.inquiries + r.inquiries,
    }),
    { posts: 0, liveHours: 0, directSales: 0, inquiries: 0 },
  ), [rows])

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: '12px',
      marginBottom: '16px',
    }}>
      <StatCard label="Total Posts" value={String(totals.posts)} icon="📝" loading={loading} />
      <StatCard label="Total Live Hours" value={formatHours(totals.liveHours)} icon="🔴" loading={loading} />
      <StatCard label="Total Direct Sales" value={formatPHP(totals.directSales)} icon="💰" highlight loading={loading} />
      <StatCard label="Total Inquiries" value={String(totals.inquiries)} icon="🛒" loading={loading} />
    </div>
  )
}

function ChartsGrid({ rows, trends, loading }: {
  rows: LeaderboardRow[]
  trends: import('../api/marketing').AgentTrend[]
  loading: boolean
}) {
  const salesData = useMemo(
    () => [...rows].sort((a, b) => b.directSales - a.directSales).map((r) => ({ name: r.username, value: Math.round(r.directSales) })),
    [rows],
  )
  const liveData = useMemo(
    () => [...rows].sort((a, b) => b.liveHours - a.liveHours).map((r) => ({ name: r.username, value: Number(r.liveHours.toFixed(1)) })),
    [rows],
  )

  // Trend reshape: [{ date, agentName: posts, ... }]
  const { trendData, agentNames } = useMemo(() => {
    const dates = trends[0]?.daily.map((p) => p.date) ?? []
    const data = dates.map((date) => {
      const row: Record<string, string | number> = { date: date.slice(5) }
      for (const t of trends) {
        const point = t.daily.find((p) => p.date === date)
        row[t.username] = point ? point.posts : 0
      }
      return row
    })
    return { trendData: data, agentNames: trends.map((t) => t.username) }
  }, [trends])

  // Radar normalize 0-100, top 4 agents by score
  const radarData = useMemo(() => {
    const top = [...rows]
      .sort((a, b) => computeScore(b) - computeScore(a))
      .slice(0, 4)
    if (top.length === 0) return { metrics: [], agents: [] }
    const max = {
      Posts: Math.max(1, ...top.map((r) => r.posts)),
      LiveHours: Math.max(1, ...top.map((r) => r.liveHours)),
      DirectSales: Math.max(1, ...top.map((r) => r.directSales)),
      Inquiries: Math.max(1, ...top.map((r) => r.inquiries)),
    }
    const metrics = ['Posts', 'LiveHours', 'DirectSales', 'Inquiries'].map((metric) => {
      const row: Record<string, string | number> = { metric }
      top.forEach((r) => {
        let raw = 0
        if (metric === 'Posts') raw = r.posts
        if (metric === 'LiveHours') raw = r.liveHours
        if (metric === 'DirectSales') raw = r.directSales
        if (metric === 'Inquiries') raw = r.inquiries
        const ceiling = max[metric as keyof typeof max]
        row[r.username] = Math.round((raw / ceiling) * 100)
      })
      return row
    })
    return { metrics, agents: top.map((r) => r.username) }
  }, [rows])

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
      gap: '14px',
      marginBottom: '16px',
    }}>
      <ChartCard title="Direct Sales by Agent" loading={loading}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={salesData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₱${(Number(v) / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: number) => formatPHP(v)} />
            <Bar dataKey="value" fill="#15803d" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Live Hours by Agent" loading={loading}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={liveData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => `${v} h`} />
            <Bar dataKey="value" fill="#1d4ed8" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Daily Posts (per agent)" loading={loading}>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {agentNames.map((name, i) => (
              <Line key={name} type="monotone" dataKey={name} stroke={CHART_PALETTE[i % CHART_PALETTE.length]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Multi-Metric Compare (top 4)" loading={loading}>
        <ResponsiveContainer width="100%" height={260}>
          <RadarChart data={radarData.metrics}>
            <PolarGrid stroke="#cbd5e1" />
            <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
            {radarData.agents.map((name, i) => (
              <Radar key={name} name={name} dataKey={name} stroke={CHART_PALETTE[i % CHART_PALETTE.length]} fill={CHART_PALETTE[i % CHART_PALETTE.length]} fillOpacity={0.18} />
            ))}
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Tooltip />
          </RadarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}

function Leaderboard({ rows, loading, onSelect }: {
  rows: LeaderboardRow[]
  loading: boolean
  onSelect: (id: string) => void
}) {
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const sorted = useMemo(() => {
    const arr = [...rows]
    arr.sort((a, b) => {
      const va = sortKey === 'score' ? computeScore(a) : (a as unknown as Record<string, number | string>)[sortKey]
      const vb = sortKey === 'score' ? computeScore(b) : (b as unknown as Record<string, number | string>)[sortKey]
      if (typeof va === 'string' && typeof vb === 'string') {
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      }
      return sortDir === 'asc' ? Number(va) - Number(vb) : Number(vb) - Number(va)
    })
    return arr
  }, [rows, sortKey, sortDir])

  function header(label: string, key: SortKey) {
    const active = sortKey === key
    return (
      <th
        onClick={() => {
          if (active) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
          else { setSortKey(key); setSortDir(key === 'username' ? 'asc' : 'desc') }
        }}
        style={{
          padding: '10px 12px',
          textAlign: key === 'username' ? 'left' : 'right',
          fontSize: '11px',
          fontWeight: 700,
          color: active ? '#1d4ed8' : '#64748b',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          userSelect: 'none',
          borderBottom: '1px solid #e2e8f0',
          background: '#f8fafc',
        }}
      >{label}{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</th>
    )
  }

  return (
    <div className="panel-root">
      <div className="panel-header">
        <h2 className="panel-title">Leaderboard</h2>
        {loading && <span style={{ fontSize: '12px', color: '#94a3b8' }}>loading…</span>}
      </div>
      <div className="panel-body" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              {header('Agent', 'username')}
              {header('Posts', 'posts')}
              {header('Live Hours', 'liveHours')}
              {header('Direct Sales', 'directSales')}
              {header('Orders', 'ordersCount')}
              {header('Inquiries', 'inquiries')}
              {header('Score', 'score')}
              <th style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }} />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && !loading && (
              <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>No agents in this tenant.</td></tr>
            )}
            {sorted.map((r, idx) => (
              <tr key={r.agentId} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>{r.username}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.posts}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatHours(r.liveHours)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#15803d', fontWeight: 700 }}>{formatPHP(r.directSales)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.ordersCount}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.inquiries}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{computeScore(r).toFixed(1)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => onSelect(r.agentId)}
                    style={{
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: 700,
                      border: '1px solid #1d4ed8',
                      borderRadius: '8px',
                      background: '#fff',
                      color: '#1d4ed8',
                      cursor: 'pointer',
                    }}
                  >View →</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatCard({ label, value, icon, highlight, loading }: { label: string; value: string; icon: string; highlight?: boolean; loading?: boolean }) {
  return (
    <div style={{
      background: highlight ? 'linear-gradient(135deg, #15803d 0%, #22c55e 100%)' : '#fff',
      color: highlight ? '#fff' : '#0f172a',
      border: highlight ? 'none' : '1px solid #e2e8f0',
      borderRadius: '12px',
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    }}>
      <div style={{ fontSize: '24px' }}>{icon}</div>
      <div>
        <div style={{
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: highlight ? 'rgba(255,255,255,0.85)' : '#64748b',
          marginBottom: '4px',
        }}>{label}</div>
        <div style={{ fontSize: '20px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{loading ? '…' : value}</div>
      </div>
    </div>
  )
}

function ChartCard({ title, children, loading }: { title: string; children: React.ReactNode; loading?: boolean }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{title}</h3>
        {loading && <span style={{ fontSize: '11px', color: '#94a3b8' }}>loading…</span>}
      </div>
      {children}
    </div>
  )
}

function formatHours(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1)
}

function formatPHP(n: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(n)
}
