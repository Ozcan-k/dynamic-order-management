import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { SALES_PLATFORM_LABELS, type SalesPlatform } from '@dom/shared'
import type { AnalyticsOverview } from '../../api/marketing'
import { ChartCard, Empty, MiniStat, TooltipCard } from './chartKit'
import { AXIS_PROPS, GRID_PROPS, PREV_INK } from './chartTheme'
import { formatCompact, formatHours, formatInt, formatPct, shortDate } from './format'
import { METRIC_COLOR, OTHER, PLATFORM_COLOR } from './palette'

interface Props {
  data?: AnalyticsOverview
  loading: boolean
  agentColors: Map<string, string>
  onSelectAgent: (id: string) => void
}

export default function LiveTab({ data, loading, agentColors, onSelectAgent }: Props) {
  if (loading || !data) return <div className="mkt-chart-skeleton" style={{ height: 420 }} />

  const k = data.kpis.current
  const engagementRate = k.views > 0 ? k.engagement / k.views : 0
  const platforms = data.byPlatform
  const totalHours = platforms.reduce((s, p) => s + p.liveHours, 0)

  const points = data.agents
    .filter((a) => a.liveHours > 0)
    .map((a) => ({ id: a.agentId, name: a.username, hours: a.liveHours, orders: a.liveOrders, rate: a.ordersPerLiveHour, color: agentColors.get(a.agentId) ?? OTHER }))
  const teamRate = k.ordersPerLiveHour
  const xMax = niceCeil(Math.max(1, ...points.map((p) => p.hours)) * 1.08)
  const yMax = niceCeil(Math.max(1, ...points.map((p) => p.orders)) * 1.15)

  const daily = data.daily.map((d) => ({ date: d.date, hours: d.liveHours, orders: d.liveOrders }))

  if (totalHours === 0) {
    return (
      <div className="mkt-card">
        <Empty title="No live selling in this range">Live sessions logged by agents show up here with hours, orders and engagement.</Empty>
      </div>
    )
  }

  return (
    <>
      <div className="mkt-mini-row">
        <MiniStat label="Views" value={formatCompact(k.views)} sub="across all live sessions" color={METRIC_COLOR.orders} />
        <MiniStat label="Engagement" value={formatCompact(k.engagement)} sub={`${formatPct(engagementRate, 1)} of views · likes, comments, shares`} color={METRIC_COLOR.liveHours} />
        <MiniStat label="New followers" value={formatInt(k.followers)} sub={`${(k.followers / Math.max(1, k.liveHours)).toFixed(1)} per live hour`} color={METRIC_COLOR.inquiries} />
        <MiniStat label="Orders / live hour" value={teamRate.toFixed(2)} sub={`${formatInt(k.liveOrders)} orders in ${formatHours(k.liveHours)}h`} color={METRIC_COLOR.liveOrders} />
      </div>

      <div className="mkt-platforms">
        {platforms.map((p) => {
          const color = PLATFORM_COLOR[p.platform] ?? OTHER
          const eng = p.likes + p.comments + p.shares
          return (
            <article key={p.platform} className="mkt-platform" style={{ '--kpi': color } as React.CSSProperties}>
              <header>
                <span className="mkt-swatch mkt-swatch--dot" style={{ background: color }} />
                <h4>{SALES_PLATFORM_LABELS[p.platform as SalesPlatform] ?? p.platform}</h4>
                <span className="mkt-platform-share">{totalHours ? formatPct(p.liveHours / totalHours) : '0%'} of hours</span>
              </header>
              <div className="mkt-platform-share-bar"><span style={{ width: `${totalHours ? (p.liveHours / totalHours) * 100 : 0}%` }} /></div>
              <dl>
                <div><dt>Live hours</dt><dd>{formatHours(p.liveHours)}</dd></div>
                <div><dt>Orders</dt><dd>{formatInt(p.liveOrders)}</dd></div>
                <div><dt>Orders / h</dt><dd>{p.liveHours ? (p.liveOrders / p.liveHours).toFixed(2) : '—'}</dd></div>
                <div><dt>Views</dt><dd>{formatCompact(p.views)}</dd></div>
                <div><dt>Engagement</dt><dd>{p.views ? formatPct(eng / p.views, 1) : '—'}</dd></div>
                <div><dt>Followers</dt><dd>+{formatInt(p.followers)}</dd></div>
              </dl>
            </article>
          )
        })}
      </div>

      <div className="mkt-grid-2">
        <ChartCard
          title="Live efficiency by agent"
          sub={<>Hours live vs orders closed · dashed line = team average ({teamRate.toFixed(2)} orders/h). Above the line = converting better.</>}
        >
          {points.length === 0 ? <Empty title="No agent went live" /> : (
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 24, right: 24, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="#94A3B8" strokeOpacity={0.18} />
                <XAxis type="number" dataKey="hours" name="Live hours" {...AXIS_PROPS} domain={[0, xMax]} ticks={[0, 1, 2, 3, 4].map((i) => (xMax * i) / 4)} tickFormatter={(v) => `${v}h`} />
                <YAxis type="number" dataKey="orders" name="Live orders" {...AXIS_PROPS} width={40} allowDecimals={false} domain={[0, yMax]} ticks={[0, 1, 2, 3, 4, 5].map((i) => (yMax * i) / 5)} />
                <ZAxis range={[140, 140]} />
                <ReferenceLine
                  segment={[{ x: 0, y: 0 }, { x: xMax, y: teamRate * xMax }]}
                  stroke={PREV_INK}
                  strokeDasharray="5 4"
                  ifOverflow="hidden"
                />
                <Tooltip
                  cursor={false}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const p = payload[0].payload as typeof points[number]
                    return (
                      <TooltipCard
                        title={p.name}
                        rows={[
                          { label: 'Live hours', value: formatHours(p.hours), color: p.color },
                          { label: 'Live orders', value: formatInt(p.orders) },
                          { label: 'Orders / h', value: p.rate.toFixed(2) },
                          { label: 'vs team', value: teamRate ? `${p.rate >= teamRate ? '+' : ''}${(((p.rate - teamRate) / teamRate) * 100).toFixed(0)}%` : '—', muted: true },
                        ]}
                        foot="Click to open the agent"
                      />
                    )
                  }}
                />
                <Scatter
                  data={points}
                  onClick={(p: unknown) => {
                    const id = (p as { payload?: { id?: string }; id?: string }).payload?.id ?? (p as { id?: string }).id
                    if (id) onSelectAgent(id)
                  }}
                  style={{ cursor: 'pointer' }}
                  shape={(props: unknown) => {
                    const { cx, cy, payload } = props as { cx: number; cy: number; payload: typeof points[number] }
                    return <circle cx={cx} cy={cy} r={8} fill={payload.color} stroke="#fff" strokeWidth={2} />
                  }}
                >
                  <LabelList dataKey="name" position="top" offset={12} style={{ fontSize: 11, fontWeight: 700, fill: '#334155' }} />
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <div className="mkt-stack">
          <ChartCard title="Live hours per day">
            <DailyBars data={daily} dataKey="hours" color={METRIC_COLOR.liveHours} fmt={(n) => `${formatHours(n)}h`} />
          </ChartCard>
          <ChartCard title="Live orders per day">
            <DailyBars data={daily} dataKey="orders" color={METRIC_COLOR.liveOrders} fmt={formatInt} />
          </ChartCard>
        </div>
      </div>
    </>
  )
}

function DailyBars({ data, dataKey, color, fmt }: {
  data: { date: string; hours: number; orders: number }[]
  dataKey: 'hours' | 'orders'
  color: string
  fmt: (n: number) => string
}) {
  const id = `mkt-live-${dataKey}`
  return (
    <ResponsiveContainer width="100%" height={112}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="18%">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.95} />
            <stop offset="100%" stopColor={color} stopOpacity={0.6} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="date" {...AXIS_PROPS} tickFormatter={shortDate} minTickGap={28} />
        <YAxis {...AXIS_PROPS} width={34} allowDecimals={false} tickCount={3} />
        <Tooltip
          cursor={{ fill: '#94A3B8', fillOpacity: 0.12 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const r = payload[0].payload as { date: string; hours: number; orders: number }
            return <TooltipCard title={shortDate(r.date)} rows={[{ label: dataKey === 'hours' ? 'Live hours' : 'Live orders', value: fmt(r[dataKey]), color }]} />
          }}
        />
        <Bar dataKey={dataKey} fill={`url(#${id})`} radius={[4, 4, 0, 0]} animationDuration={700} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Round up to a clean axis bound: 1, 2, 2.5, 5 × 10ⁿ. */
function niceCeil(v: number): number {
  const mag = 10 ** Math.floor(Math.log10(v))
  const step = [1, 2, 2.5, 5, 10].find((m) => m * mag >= v) ?? 10
  return step * mag
}
