import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { SALE_CHANNEL_LABELS, type SaleChannel } from '@dom/shared'
import type { AnalyticsOverview } from '../../api/marketing'
import { BarList, ChartCard, Empty, TooltipCard } from './chartKit'
import { AXIS_PROPS, GRID_PROPS } from './chartTheme'
import { formatInt, formatPct, formatPHP, formatPHPCompact, shortDate } from './format'
import { CHANNEL_COLOR, METRIC_COLOR, OTHER } from './palette'

interface Props {
  data?: AnalyticsOverview
  loading: boolean
  agentColors: Map<string, string>
  onSelectAgent: (id: string) => void
}

export default function SalesTab({ data, loading, agentColors, onSelectAgent }: Props) {
  if (loading || !data) return <div className="mkt-chart-skeleton" style={{ height: 420 }} />

  const k = data.kpis.current
  if (k.orders === 0) {
    return (
      <div className="mkt-card">
        <Empty title="No direct orders in this range">Orders agents log under Direct Orders show up here by channel, store, customer and product.</Empty>
      </div>
    )
  }

  const channelItems = data.byChannel.map((c) => ({
    id: c.channel,
    label: SALE_CHANNEL_LABELS[c.channel as SaleChannel] ?? c.channel,
    value: c.directSales,
    display: formatPHP(c.directSales),
    color: CHANNEL_COLOR[c.channel] ?? OTHER,
    sub: `${formatInt(c.orders)} orders · ${formatPct(c.directSales / k.directSales)} of sales · AOV ${formatPHPCompact(c.directSales / Math.max(1, c.orders))}`,
  }))

  const aovItems = data.agents
    .filter((a) => a.orders > 0)
    .sort((a, b) => b.aov - a.aov)
    .map((a) => ({
      id: a.agentId,
      label: a.username,
      value: a.aov,
      display: formatPHP(a.aov),
      color: agentColors.get(a.agentId) ?? OTHER,
      sub: `${formatInt(a.orders)} orders · ${formatPHP(a.directSales)}`,
    }))

  const companyItems = data.topCompanies.map((c) => ({
    id: c.name,
    label: c.name,
    value: c.directSales,
    display: formatPHP(c.directSales),
    color: METRIC_COLOR.directSales,
    sub: `${formatInt(c.orders)} order${c.orders === 1 ? '' : 's'}`,
  }))

  const productItems = data.topProducts.map((p) => ({
    id: p.name,
    label: p.name,
    value: p.revenue,
    display: formatPHP(p.revenue),
    color: METRIC_COLOR.orders,
    sub: `${formatInt(p.quantity)} units sold`,
  }))

  const stores = data.byStore.filter((s) => s.orders > 0)

  return (
    <>
      <ChartCard title="Direct sales per day" sub={`${formatPHP(k.directSales)} from ${formatInt(k.orders)} orders · average order ${formatPHP(k.aov)}`}>
        {data.daily.length < 2 ? <Empty title="Daily chart needs at least 2 days" /> : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.daily} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barCategoryGap="16%">
              <defs>
                <linearGradient id="mkt-sales-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={METRIC_COLOR.directSales} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={METRIC_COLOR.directSales} stopOpacity={0.6} />
                </linearGradient>
              </defs>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="date" {...AXIS_PROPS} tickFormatter={shortDate} minTickGap={24} />
              <YAxis {...AXIS_PROPS} width={62} tickFormatter={(v) => formatPHPCompact(Number(v))} />
              <Tooltip
                cursor={{ fill: '#94A3B8', fillOpacity: 0.12 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload as AnalyticsOverview['daily'][number]
                  return (
                    <TooltipCard
                      title={shortDate(d.date)}
                      rows={[
                        { label: 'Direct sales', value: formatPHP(d.directSales), color: METRIC_COLOR.directSales },
                        { label: 'Orders', value: formatInt(d.orders) },
                        { label: 'Avg order', value: d.orders ? formatPHP(d.directSales / d.orders) : '—', muted: true },
                      ]}
                    />
                  )
                }}
              />
              <Bar dataKey="directSales" fill="url(#mkt-sales-fill)" radius={[4, 4, 0, 0]} animationDuration={700} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <div className="mkt-grid-2">
        <ChartCard title="Sales by channel" sub="Share of direct sales and average order per channel">
          <BarList items={channelItems} />
        </ChartCard>
        <ChartCard title="Average order value by agent" sub="Bigger orders, not just more orders">
          <BarList items={aovItems} onSelect={onSelectAgent} />
        </ChartCard>
      </div>

      <div className="mkt-grid-2">
        <ChartCard title="Top customers" sub="Companies by direct sales (top 10)">
          <BarList items={companyItems} emptyTitle="No customer names recorded" />
        </ChartCard>
        <ChartCard title="Top products" sub="By revenue from order line items (top 10)">
          <BarList items={productItems} emptyTitle="No line items recorded" />
        </ChartCard>
      </div>

      <ChartCard title="Sales by store" flush>
        <div className="mkt-table-scroll">
          <table className="mkt-table mkt-table--compact">
            <thead>
              <tr>
                <th scope="col">Store</th>
                <th scope="col" className="mkt-num">Direct Sales</th>
                <th scope="col" className="mkt-num">Share</th>
                <th scope="col" className="mkt-num">Orders</th>
                <th scope="col" className="mkt-num">Avg Order</th>
                <th scope="col" className="mkt-num">Live Orders</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => (
                <tr key={s.store}>
                  <td><strong>{s.store}</strong></td>
                  <td className="mkt-num">
                    <div className="mkt-cell-bar">
                      <span style={{ width: `${(s.directSales / (stores[0]?.directSales || 1)) * 100}%` }} />
                      <strong>{formatPHP(s.directSales)}</strong>
                    </div>
                  </td>
                  <td className="mkt-num">{formatPct(s.directSales / k.directSales, 1)}</td>
                  <td className="mkt-num">{formatInt(s.orders)}</td>
                  <td className="mkt-num">{formatPHP(s.directSales / s.orders)}</td>
                  <td className="mkt-num">{formatInt(s.liveOrders)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </>
  )
}
