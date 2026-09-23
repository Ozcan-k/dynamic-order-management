import { useMemo, useState } from 'react'
import type { AnalyticsOverview } from '../../api/marketing'
import ChannelDonut from './ChannelDonut'
import { BarList, ChartCard, Seg } from './chartKit'
import { formatHours, formatInt, formatPct, formatPHP, relativeDelta } from './format'
import { DeltaChip } from './KpiRow'
import Leaderboard from './Leaderboard'
import { completionStatus, METRIC_COLOR, OTHER } from './palette'
import TrendCard from './TrendCard'

type RankMetric = 'score' | 'sales' | 'liveOrders' | 'content'

const RANK_OPTS = [
  { id: 'score', label: 'Score' },
  { id: 'sales', label: 'Sales' },
  { id: 'liveOrders', label: 'Live' },
  { id: 'content', label: 'Content' },
] as const

interface Props {
  data?: AnalyticsOverview
  loading: boolean
  agentColors: Map<string, string>
  onSelectAgent: (id: string) => void
}

export default function OverviewTab({ data, loading, agentColors, onSelectAgent }: Props) {
  const [rank, setRank] = useState<RankMetric>('score')

  const rankItems = useMemo(() => {
    const rows = data?.agents ?? []
    const value = (r: typeof rows[number]) =>
      rank === 'score' ? r.score : rank === 'sales' ? r.directSales : rank === 'liveOrders' ? r.liveOrders : r.completionRate
    return [...rows]
      .sort((a, b) => value(b) - value(a))
      .map((r) => {
        const v = value(r)
        const delta = rank === 'score' ? relativeDelta(r.score, r.previous.score)
          : rank === 'sales' ? relativeDelta(r.directSales, r.previous.directSales)
            : null
        return {
          id: r.agentId,
          label: r.username,
          value: v,
          color: agentColors.get(r.agentId) ?? OTHER,
          display: rank === 'score' ? v.toFixed(1) : rank === 'sales' ? formatPHP(v) : rank === 'liveOrders' ? formatInt(v) : r.requiredPosts ? formatPct(v) : '—',
          badge: delta ? <DeltaChip delta={delta} /> : undefined,
          sub: rank === 'content'
            ? `${r.posts} of ${r.requiredPosts} posts · ${r.requiredPosts ? completionStatus(r.completionRate).label : 'no reports'}`
            : rank === 'liveOrders'
              ? `${formatHours(r.liveHours)} live hours · ${r.ordersPerLiveHour.toFixed(1)}/h`
              : `${r.orders} orders · ${r.activeDays} active days`,
        }
      })
  }, [data, rank, agentColors])

  const storeItems = (data?.byStore ?? [])
    .filter((s) => s.directSales > 0)
    .slice(0, 8)
    .map((s) => ({
      id: s.store,
      label: s.store,
      value: s.directSales,
      display: formatPHP(s.directSales),
      color: METRIC_COLOR.directSales,
      sub: `${s.orders} orders${s.requiredPosts ? ` · content ${formatPct(s.posts / s.requiredPosts)}` : ''}`,
    }))

  return (
    <>
      <TrendCard daily={data?.daily} previousDaily={data?.previousDaily} loading={loading} />

      <div className="mkt-grid-3">
        <ChartCard
          title="Agent ranking"
          sub="Colour stays with the agent on every chart"
          actions={<Seg label="Rank by" options={RANK_OPTS} value={rank} onChange={setRank} />}
        >
          {loading ? <div className="mkt-chart-skeleton" style={{ height: 240 }} /> : (
            <BarList items={rankItems} max={rank === 'content' ? 1 : undefined} onSelect={onSelectAgent} emptyTitle="No agent activity in this range" />
          )}
        </ChartCard>

        <ChannelDonut byChannel={data?.byChannel} loading={loading} />

        <ChartCard title="Top stores" sub="By direct sales">
          {loading ? <div className="mkt-chart-skeleton" style={{ height: 240 }} /> : (
            <BarList items={storeItems} emptyTitle="No store sales in this range" />
          )}
        </ChartCard>
      </div>

      <Leaderboard
        rows={data?.agents ?? []}
        agentColors={agentColors}
        loading={loading}
        from={data?.from ?? ''}
        to={data?.to ?? ''}
        onSelect={onSelectAgent}
      />
    </>
  )
}
