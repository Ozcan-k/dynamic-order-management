import { useMemo, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AnalyticsDailyRow } from '../../api/marketing'
import { ChartCard, Empty, Legend, Seg, TooltipCard } from './chartKit'
import { AXIS_PROPS, GRID_PROPS, PREV_INK } from './chartTheme'
import { formatInt, formatPct, formatPHP, formatPHPCompact, shortDate } from './format'
import { METRIC_COLOR } from './palette'

type TrendMetric = 'sales' | 'orders' | 'liveOrders' | 'content'

const TREND_OPTS = [
  { id: 'sales', label: 'Sales' },
  { id: 'orders', label: 'Orders' },
  { id: 'liveOrders', label: 'Live orders' },
  { id: 'content', label: 'Content %' },
] as const

const TREND_META: Record<TrendMetric, { color: string; label: string; fmt: (n: number) => string; axis: (n: number) => string }> = {
  sales: { color: METRIC_COLOR.directSales, label: 'Direct sales', fmt: formatPHP, axis: formatPHPCompact },
  orders: { color: METRIC_COLOR.orders, label: 'Direct orders', fmt: formatInt, axis: formatInt },
  liveOrders: { color: METRIC_COLOR.liveOrders, label: 'Live orders', fmt: formatInt, axis: formatInt },
  content: { color: METRIC_COLOR.content, label: 'Content done', fmt: (n) => formatPct(n), axis: (n) => formatPct(n) },
}

/** Single-metric daily trend with the previous period as a dashed line (one axis, never dual). */
export default function TrendCard({ title = 'Daily trend', daily, previousDaily, loading }: {
  title?: string
  daily?: AnalyticsDailyRow[]
  previousDaily?: AnalyticsDailyRow[]
  loading: boolean
}) {
  const [metric, setMetric] = useState<TrendMetric>('sales')
  const meta = TREND_META[metric]

  const data = useMemo(() => {
    const pick = (d: AnalyticsDailyRow | undefined): number | null => {
      if (!d) return null
      if (metric === 'sales') return d.directSales
      if (metric === 'orders') return d.orders
      if (metric === 'liveOrders') return d.liveOrders
      return d.requiredPosts > 0 ? d.posts / d.requiredPosts : null
    }
    return (daily ?? []).map((d, i) => ({
      date: d.date,
      prevDate: previousDaily?.[i]?.date,
      current: pick(d),
      previous: pick(previousDaily?.[i]),
    }))
  }, [daily, previousDaily, metric])

  const gradientId = `mkt-trend-fill-${title.replace(/\W+/g, '')}`

  return (
    <ChartCard
      title={title}
      sub={<>This period vs the previous {daily?.length ?? ''} days (dashed)</>}
      actions={<Seg label="Trend metric" options={TREND_OPTS} value={metric} onChange={setMetric} />}
    >
      {loading ? <div className="mkt-chart-skeleton" style={{ height: 280 }} /> : data.length < 2 ? (
        <Empty title="Trend needs at least 2 days">Pick 7 days or longer to see the movement.</Empty>
      ) : (
        <>
          <Legend items={[
            { label: `${meta.label} · this period`, color: meta.color, kind: 'line' },
            { label: 'Previous period', color: PREV_INK, kind: 'dash' },
          ]} />
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={meta.color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={meta.color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="date" {...AXIS_PROPS} tickFormatter={shortDate} minTickGap={24} />
              <YAxis {...AXIS_PROPS} width={62} tickFormatter={(v) => meta.axis(Number(v))} domain={metric === 'content' ? [0, 1] : [0, 'auto']} allowDecimals={metric === 'content'} />
              <Tooltip
                cursor={{ stroke: '#94A3B8', strokeDasharray: '3 3' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const row = payload[0].payload as typeof data[number]
                  return (
                    <TooltipCard
                      title={shortDate(row.date)}
                      rows={[
                        { label: meta.label, value: row.current === null ? '—' : meta.fmt(row.current), color: meta.color },
                        { label: row.prevDate ? `Prev · ${shortDate(row.prevDate)}` : 'Previous', value: row.previous === null ? '—' : meta.fmt(row.previous), color: PREV_INK, dashed: true, muted: true },
                      ]}
                    />
                  )
                }}
              />
              <Line dataKey="previous" stroke={PREV_INK} strokeWidth={1.75} strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />
              <Area dataKey="current" stroke={meta.color} strokeWidth={2.5} fill={`url(#${gradientId})`} connectNulls activeDot={{ r: 4.5, strokeWidth: 2, stroke: '#fff' }} animationDuration={700} />
            </ComposedChart>
          </ResponsiveContainer>
        </>
      )}
    </ChartCard>
  )
}
