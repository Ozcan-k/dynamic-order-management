import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { SALE_CHANNEL_LABELS, type SaleChannel } from '@dom/shared'
import type { AnalyticsBreakdowns } from '../../api/marketing'
import { ChartCard, Empty, TooltipCard } from './chartKit'
import { formatInt, formatPct, formatPHP, formatPHPCompact } from './format'
import { CHANNEL_COLOR, OTHER } from './palette'

const label = (c: string) => SALE_CHANNEL_LABELS[c as SaleChannel] ?? c

export default function ChannelDonut({ byChannel, loading }: { byChannel?: AnalyticsBreakdowns['byChannel']; loading: boolean }) {
  const channels = (byChannel ?? []).filter((c) => c.directSales > 0)
  const total = channels.reduce((s, c) => s + c.directSales, 0)

  return (
    <ChartCard title="Sales by channel" sub="Where direct orders come from">
      {loading ? <div className="mkt-chart-skeleton" style={{ height: 240 }} /> : channels.length === 0 ? (
        <Empty title="No direct orders in this range" />
      ) : (
        <div className="mkt-donut">
          <div className="mkt-donut-chart">
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie data={channels} dataKey="directSales" nameKey="channel" innerRadius="64%" outerRadius="96%" paddingAngle={channels.length > 1 ? 2 : 0} stroke="#fff" strokeWidth={2} animationDuration={700}>
                  {channels.map((c) => <Cell key={c.channel} fill={CHANNEL_COLOR[c.channel] ?? OTHER} />)}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const c = payload[0].payload as typeof channels[number]
                    return (
                      <TooltipCard
                        title={label(c.channel)}
                        rows={[
                          { label: 'Sales', value: formatPHP(c.directSales), color: CHANNEL_COLOR[c.channel] ?? OTHER },
                          { label: 'Orders', value: formatInt(c.orders) },
                          { label: 'Share', value: formatPct(c.directSales / total, 1) },
                        ]}
                      />
                    )
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mkt-donut-center">
              <span>{formatPHPCompact(total)}</span>
              <small>total sales</small>
            </div>
          </div>
          <ul className="mkt-donut-legend">
            {channels.map((c) => (
              <li key={c.channel}>
                <span className="mkt-swatch mkt-swatch--dot" style={{ background: CHANNEL_COLOR[c.channel] ?? OTHER }} />
                <span className="mkt-donut-name">{label(c.channel)}</span>
                <span className="mkt-donut-val">{formatPHPCompact(c.directSales)}</span>
                <span className="mkt-donut-pct">{formatPct(c.directSales / total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartCard>
  )
}
