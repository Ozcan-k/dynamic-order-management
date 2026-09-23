import { useMemo, useState } from 'react'
import { MARKETING_SCORE_WEIGHTS } from '@dom/shared'
import type { AnalyticsAgentRow } from '../../api/marketing'
import Sparkline from '../shared/Sparkline'
import { AgentAvatar, ChartCard, Empty } from './chartKit'
import { formatHours, formatInt, formatPct, formatPHP, relativeDelta } from './format'
import { DeltaChip } from './KpiRow'
import { completionStatus, OTHER } from './palette'

type SortKey = 'score' | 'username' | 'directSales' | 'orders' | 'liveHours' | 'liveOrders' | 'completionRate' | 'inquiries' | 'activeDays'

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'username', label: 'Agent', numeric: false },
  { key: 'score', label: 'Score', numeric: true },
  { key: 'directSales', label: 'Direct Sales', numeric: true },
  { key: 'orders', label: 'Orders', numeric: true },
  { key: 'liveHours', label: 'Live Hrs', numeric: true },
  { key: 'liveOrders', label: 'Live Orders', numeric: true },
  { key: 'completionRate', label: 'Content', numeric: true },
  { key: 'inquiries', label: 'Inquiries', numeric: true },
  { key: 'activeDays', label: 'Days', numeric: true },
]

const W = MARKETING_SCORE_WEIGHTS
const SCORE_FORMULA = `Score = posts × ${W.posts} + live hours × ${W.liveHours} + direct sales ÷ 1,000 × ${W.directSalesPer1000} + inquiries × ${W.inquiries}`

interface Props {
  rows: AnalyticsAgentRow[]
  agentColors: Map<string, string>
  loading: boolean
  from: string
  to: string
  onSelect: (id: string) => void
}

export default function Leaderboard({ rows, agentColors, loading, from, to, onSelect }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')

  // Rank is always by score, independent of the column the table is sorted by
  const rankOf = useMemo(() => {
    const m = new Map<string, number>()
    ;[...rows].sort((a, b) => b.score - a.score).forEach((r, i) => m.set(r.agentId, r.score > 0 ? i + 1 : 0))
    return m
  }, [rows])

  const sorted = useMemo(() => {
    const arr = [...rows]
    arr.sort((a, b) => {
      const d = sortKey === 'username'
        ? a.username.localeCompare(b.username)
        : (a[sortKey] as number) - (b[sortKey] as number)
      return dir === 'asc' ? d : -d
    })
    return arr
  }, [rows, sortKey, dir])

  const maxScore = Math.max(1, ...rows.map((r) => r.score))

  function sortBy(key: SortKey) {
    if (key === sortKey) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setDir(key === 'username' ? 'asc' : 'desc') }
  }

  function exportCsv() {
    const header = ['Rank', 'Agent', 'Score', 'Direct Sales (PHP)', 'Direct Orders', 'AOV (PHP)', 'Live Hours', 'Live Orders', 'Posts Completed', 'Posts Required', 'Content %', 'Inquiries', 'Listings', 'Active Days']
    const lines = [...rows].sort((a, b) => b.score - a.score).map((r) => [
      rankOf.get(r.agentId) || '', r.username, r.score.toFixed(1), r.directSales.toFixed(2), r.orders, r.aov.toFixed(2),
      r.liveHours.toFixed(1), r.liveOrders, r.posts, r.requiredPosts, (r.completionRate * 100).toFixed(1), r.inquiries, r.listings, r.activeDays,
    ])
    const csv = [header, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `marketing-leaderboard_${from}_${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <ChartCard
      title="Leaderboard"
      sub={<>Ranked by score <span className="mkt-info" title={SCORE_FORMULA} aria-label={SCORE_FORMULA}>i</span> · click an agent for the full profile</>}
      actions={
        <button type="button" className="mkt-btn-ghost" onClick={exportCsv} disabled={rows.length === 0}>
          Export CSV
        </button>
      }
      flush
    >
      {!loading && rows.length === 0 ? (
        <Empty title="No sales agents">Active sales agents appear here.</Empty>
      ) : (
        <div className="mkt-table-scroll">
          <table className="mkt-table">
            <thead>
              <tr>
                <th scope="col" className="mkt-th-rank">#</th>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={c.numeric ? 'mkt-num' : undefined}
                    aria-sort={sortKey === c.key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button type="button" className={`mkt-th-btn${sortKey === c.key ? ' mkt-th-btn--on' : ''}`} onClick={() => sortBy(c.key)}>
                      {c.label}
                      <span aria-hidden="true" className="mkt-th-arrow">{sortKey === c.key ? (dir === 'asc' ? '↑' : '↓') : '↕'}</span>
                    </button>
                  </th>
                ))}
                <th scope="col" className="mkt-th-trend">Sales</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const color = agentColors.get(r.agentId) ?? OTHER
                const rank = rankOf.get(r.agentId) ?? 0
                const status = completionStatus(r.completionRate)
                return (
                  <tr key={r.agentId} className="mkt-tr" onClick={() => onSelect(r.agentId)}>
                    <td className="mkt-th-rank">
                      {rank > 0 ? <span className={`mkt-rank${rank <= 3 ? ` mkt-rank--${rank}` : ''}`}>{rank}</span> : <span className="mkt-muted">–</span>}
                    </td>
                    <td>
                      <button type="button" className="mkt-agent-link" onClick={(e) => { e.stopPropagation(); onSelect(r.agentId) }}>
                        <AgentAvatar name={r.username} color={color} />
                        <span>{r.username}</span>
                      </button>
                    </td>
                    <td className="mkt-num">
                      <div className="mkt-num-stack">
                        <div className="mkt-score">
                          <span className="mkt-score-bar"><span style={{ width: `${(r.score / maxScore) * 100}%`, background: color }} /></span>
                          <span className="mkt-score-val">{r.score.toFixed(1)}</span>
                        </div>
                        <DeltaChip delta={relativeDelta(r.score, r.previous.score)} />
                      </div>
                    </td>
                    <td className="mkt-num">
                      <div className="mkt-num-stack">
                        <strong>{formatPHP(r.directSales)}</strong>
                        <DeltaChip delta={relativeDelta(r.directSales, r.previous.directSales)} />
                      </div>
                    </td>
                    <td className="mkt-num">{formatInt(r.orders)}</td>
                    <td className="mkt-num">{formatHours(r.liveHours)}</td>
                    <td className="mkt-num">{formatInt(r.liveOrders)}</td>
                    <td className="mkt-num">
                      {r.requiredPosts > 0 ? (
                        <span className="mkt-pct-pill" style={{ '--st': status.color } as React.CSSProperties} title={`${r.posts} of ${r.requiredPosts} mandatory posts · ${status.label}`}>
                          {formatPct(r.completionRate)}
                        </span>
                      ) : <span className="mkt-muted">—</span>}
                    </td>
                    <td className="mkt-num">{formatInt(r.inquiries)}</td>
                    <td className="mkt-num">{r.activeDays}</td>
                    <td className="mkt-th-trend">
                      {r.daily.length >= 3 && r.daily.some((d) => d.directSales > 0)
                        ? <Sparkline data={r.daily.map((d) => d.directSales)} color={color} width={84} height={26} strokeWidth={1.75} title={`${r.username} daily direct sales`} />
                        : <span className="mkt-muted">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  )
}
