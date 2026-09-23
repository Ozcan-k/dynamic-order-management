import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchActivityGrid, fetchAgentCalendar } from '../../api/marketing'
import { ChartCard } from './chartKit'
import { formatPct, formatPHPCompact, shiftDate } from './format'
import { RampLegend } from './HeatGrid'
import { completionLevel, CONTENT_RAMP } from './palette'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const t = y * 12 + (m - 1) + delta
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}

function monthBounds(month: string): { first: string; last: string } {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { first: `${month}-01`, last: `${month}-${String(last).padStart(2, '0')}` }
}

/** Monday-first grid covering the whole month (null = padding cell). */
function buildGrid(month: string): (string | null)[] {
  const { first, last } = monthBounds(month)
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7
  const days = Number(last.slice(8))
  const cells: (string | null)[] = Array(lead).fill(null)
  for (let d = 0; d < days; d++) cells.push(shiftDate(first, d))
  while (cells.length % 7) cells.push(null)
  return cells
}

interface Props {
  agentId: string
  month: string
  onMonthChange: (m: string) => void
  today: string
  onSelectDay: (date: string) => void
}

export default function AgentCalendar({ agentId, month, onMonthChange, today, onSelectDay }: Props) {
  const { first, last } = monthBounds(month)
  const gridTo = last < today ? last : today
  const isFutureMonth = first > today

  const calendarQuery = useQuery({
    queryKey: ['marketing-agent-calendar', agentId, month],
    queryFn: () => fetchAgentCalendar(agentId, month),
    staleTime: 30_000,
  })
  // Required-post counts (for completion %) come from the analytics grid for this one agent
  const gridQuery = useQuery({
    queryKey: ['marketing-activity-grid', { from: first, to: gridTo, agentIds: [agentId] }],
    queryFn: () => fetchActivityGrid({ from: first, to: gridTo, agentIds: [agentId] }),
    enabled: !isFutureMonth,
    staleTime: 30_000,
  })

  const metrics = useMemo(() => new Map((calendarQuery.data?.days ?? []).map((d) => [d.date, d])), [calendarQuery.data])
  const content = useMemo(
    () => new Map((gridQuery.data?.agents[0]?.cells ?? []).map((c) => [c.date, c])),
    [gridQuery.data],
  )

  const cells = useMemo(() => buildGrid(month), [month])
  const [y, m] = month.split('-').map(Number)
  const canGoNext = shiftMonth(month, 1) <= today.slice(0, 7)

  return (
    <ChartCard
      title="Daily calendar"
      sub="Top strip = content completion · click a day for the full breakdown"
      actions={
        <div className="mkt-cal-nav">
          <button type="button" onClick={() => onMonthChange(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
          <span>{MONTHS[m - 1]} {y}</span>
          <button type="button" onClick={() => onMonthChange(shiftMonth(month, 1))} disabled={!canGoNext} aria-label="Next month">›</button>
          {month !== today.slice(0, 7) && (
            <button type="button" className="mkt-cal-today" onClick={() => onMonthChange(today.slice(0, 7))}>Today</button>
          )}
        </div>
      }
    >
      <div className={`mkt-cal${calendarQuery.isFetching ? ' mkt-cal--loading' : ''}`}>
        {WEEKDAYS.map((w) => <div key={w} className="mkt-cal-wd">{w}</div>)}
        {cells.map((date, i) => {
          if (!date) return <div key={`pad-${i}`} className="mkt-cal-pad" />
          const future = date > today
          const d = metrics.get(date)
          const c = content.get(date)
          const rate = c && c.requiredPosts > 0 ? c.posts / c.requiredPosts : null
          const active = !!d && (d.contentPostsCount > 0 || d.liveSellingHours > 0 || d.directSalesAmount > 0 || d.marketplaceInquiries > 0 || d.liveSellingOrderCount > 0)
            || (c ? c.stores > 0 || c.orders > 0 : false)
          const label = [
            date,
            rate !== null ? `content ${formatPct(rate)}` : null,
            d?.directSalesAmount ? `sales ${formatPHPCompact(d.directSalesAmount)}` : null,
            d?.liveSellingOrderCount ? `${d.liveSellingOrderCount} live orders` : null,
          ].filter(Boolean).join(', ')
          return (
            <button
              key={date}
              type="button"
              className={`mkt-cal-day${active ? '' : ' mkt-cal-day--idle'}${date === today ? ' mkt-cal-day--today' : ''}`}
              disabled={future}
              onClick={() => onSelectDay(date)}
              aria-label={label}
            >
              <span className="mkt-cal-strip" style={{ background: rate === null ? 'transparent' : CONTENT_RAMP[completionLevel(rate)] }} />
              <span className="mkt-cal-num">{Number(date.slice(8))}</span>
              {rate !== null && <span className="mkt-cal-rate">{formatPct(rate)}</span>}
              {!future && active && (
                <span className="mkt-cal-stats">
                  {d && d.directSalesAmount > 0 && <span className="mkt-cal-sales">{formatPHPCompact(d.directSalesAmount)}</span>}
                  {d && d.liveSellingOrderCount > 0 && <span className="mkt-cal-live">{d.liveSellingOrderCount} live</span>}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="mkt-heat-legend">
        <RampLegend ramp={CONTENT_RAMP} low="Content 0%" high="100%" extra={<span className="mkt-ramp-extra"><span className="mkt-cal-sales">₱</span> direct sales <span className="mkt-cal-live">live</span> live orders</span>} />
      </div>
    </ChartCard>
  )
}
