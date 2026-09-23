import { useMemo } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ActivityGridResponse, AnalyticsOverview } from '../../api/marketing'
import { BarList, ChartCard, Empty, TooltipCard } from './chartKit'
import { AXIS_PROPS, GRID_PROPS, TARGET_INK } from './chartTheme'
import { formatInt, formatPct, shortDate } from './format'
import HeatGrid, { RampLegend } from './HeatGrid'
import PlatformMatrix from './PlatformMatrix'
import { completionLevel, completionStatus, CONTENT_RAMP, CONTENT_TARGET, METRIC_COLOR, OTHER } from './palette'

interface Props {
  data?: AnalyticsOverview
  grid?: ActivityGridResponse
  loading: boolean
  gridLoading: boolean
  agentColors: Map<string, string>
  today: string
  onSelectAgent: (id: string) => void
}

export default function ContentTab({ data, grid, loading, gridLoading, agentColors, today, onSelectAgent }: Props) {
  const targetLabel = `Target ${formatPct(CONTENT_TARGET)}`

  const heatRows = useMemo(() => (grid?.agents ?? []).map((a) => {
    const done = a.cells.reduce((s, c) => s + c.posts, 0)
    const req = a.cells.reduce((s, c) => s + c.requiredPosts, 0)
    return {
      id: a.agentId,
      label: a.username,
      color: agentColors.get(a.agentId) ?? OTHER,
      cells: a.cells.map((c) => ({
        date: c.date,
        level: c.requiredPosts > 0 ? completionLevel(c.posts / c.requiredPosts) : null,
        tip: c.requiredPosts > 0
          ? [
            { label: 'Completion', value: formatPct(c.posts / c.requiredPosts) },
            { label: 'Posts', value: `${c.posts} of ${c.requiredPosts}` },
            { label: 'Stores reported', value: String(c.stores) },
          ]
          : [{ label: 'Status', value: 'No store report' }],
      })),
      meta: req > 0
        ? <span className="mkt-heat-pct" style={{ color: completionStatus(done / req).color }}>{formatPct(done / req)}</span>
        : <span className="mkt-muted">—</span>,
    }
  }), [grid, agentColors])

  const agentItems = [...(data?.agents ?? [])]
    .filter((r) => r.requiredPosts > 0)
    .sort((a, b) => b.completionRate - a.completionRate)
    .map((r) => {
      const st = completionStatus(r.completionRate)
      return {
        id: r.agentId,
        label: r.username,
        value: r.completionRate,
        display: formatPct(r.completionRate),
        color: agentColors.get(r.agentId) ?? OTHER,
        badge: <span className="mkt-status" style={{ '--st': st.color } as React.CSSProperties}>{st.label}</span>,
        sub: `${formatInt(r.posts)} of ${formatInt(r.requiredPosts)} posts · ${r.storeDays} store-days`,
      }
    })

  const storeItems = [...(data?.byStore ?? [])]
    .filter((s) => s.requiredPosts > 0)
    .sort((a, b) => b.posts / b.requiredPosts - a.posts / a.requiredPosts)
    .map((s) => ({
      id: s.store,
      label: s.store,
      value: s.posts / s.requiredPosts,
      display: formatPct(s.posts / s.requiredPosts),
      color: METRIC_COLOR.content,
      sub: `${formatInt(s.posts)} of ${formatInt(s.requiredPosts)} posts`,
    }))

  const trend = (data?.daily ?? []).map((d) => ({ date: d.date, rate: d.requiredPosts > 0 ? d.posts / d.requiredPosts : null, posts: d.posts, req: d.requiredPosts }))

  return (
    <>
      <ChartCard
        title="Daily content completion"
        sub="Each cell = one agent on one day · mandatory posts done ÷ required (9 per store reported)"
      >
        {gridLoading ? <div className="mkt-chart-skeleton" style={{ height: 200 }} /> : heatRows.length === 0 ? (
          <Empty title="No agents to show" />
        ) : (
          <HeatGrid
            dates={grid?.agents[0]?.cells.map((c) => c.date) ?? []}
            rows={heatRows}
            ramp={CONTENT_RAMP}
            today={today}
            onRowClick={onSelectAgent}
            legend={
              <RampLegend
                ramp={CONTENT_RAMP}
                low="0%"
                high="100%"
                extra={<span className="mkt-ramp-extra"><i className="mkt-heat-cell mkt-heat-cell--none" /> No report</span>}
              />
            }
          />
        )}
      </ChartCard>

      <div className="mkt-grid-2">
        <ChartCard title="Completion by agent" sub={<>Bar marker = {targetLabel.toLowerCase()}</>}>
          {loading ? <div className="mkt-chart-skeleton" style={{ height: 220 }} /> : (
            <BarList items={agentItems} max={1} target={{ value: CONTENT_TARGET, label: targetLabel }} onSelect={onSelectAgent} emptyTitle="No store reports in this range" />
          )}
        </ChartCard>

        <PlatformMatrix matrix={data?.contentMatrix} loading={loading} />
      </div>

      <div className="mkt-grid-2">
        <ChartCard title="Team completion by day" sub={targetLabel}>
          {loading ? <div className="mkt-chart-skeleton" style={{ height: 220 }} /> : trend.length < 2 ? (
            <Empty title="Trend needs at least 2 days" />
          ) : (
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={trend} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="date" {...AXIS_PROPS} tickFormatter={shortDate} minTickGap={24} />
                <YAxis {...AXIS_PROPS} width={44} domain={[0, 1]} tickFormatter={(v) => formatPct(Number(v))} />
                <ReferenceLine y={CONTENT_TARGET} stroke={TARGET_INK} strokeDasharray="4 4" strokeOpacity={0.6} label={{ value: 'Target', position: 'insideTopRight', fontSize: 11, fill: '#475569' }} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const r = payload[0].payload as typeof trend[number]
                    return (
                      <TooltipCard
                        title={shortDate(r.date)}
                        rows={r.rate === null
                          ? [{ label: 'Status', value: 'No store reports' }]
                          : [
                            { label: 'Completion', value: formatPct(r.rate), color: METRIC_COLOR.content },
                            { label: 'Posts', value: `${r.posts} of ${r.req}` },
                          ]}
                      />
                    )
                  }}
                />
                <Line dataKey="rate" stroke={METRIC_COLOR.content} strokeWidth={2.5} dot={false} activeDot={{ r: 4.5, stroke: '#fff', strokeWidth: 2 }} connectNulls animationDuration={700} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Completion by store" sub="Stores with at least one report">
          {loading ? <div className="mkt-chart-skeleton" style={{ height: 220 }} /> : (
            <div className="mkt-scroll-list">
              <BarList items={storeItems} max={1} target={{ value: CONTENT_TARGET, label: targetLabel }} emptyTitle="No store reports in this range" />
            </div>
          )}
        </ChartCard>
      </div>
    </>
  )
}
