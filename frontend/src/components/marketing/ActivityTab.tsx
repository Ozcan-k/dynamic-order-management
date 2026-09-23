import { useMemo } from 'react'
import type { ActivityGridResponse } from '../../api/marketing'
import { AgentAvatar, ChartCard, Empty, MiniStat } from './chartKit'
import { formatPHP, formatPct, longDate, shiftDate, shortDate } from './format'
import HeatGrid, { RampLegend } from './HeatGrid'
import { ACTIVITY_RAMP, METRIC_COLOR, OTHER, STATUS } from './palette'

const INACTIVE_DAYS = 3

interface Props {
  grid?: ActivityGridResponse
  loading: boolean
  agentColors: Map<string, string>
  today: string
  onSelectAgent: (id: string) => void
}

function daysSince(date: string | null, today: string): number | null {
  if (!date) return null
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000)
}

function lastActiveLabel(days: number | null): string {
  if (days === null) return 'Never'
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

export default function ActivityTab({ grid, loading, agentColors, today, onSelectAgent }: Props) {
  const agents = useMemo(() => grid?.agents ?? [], [grid])
  const dates = agents[0]?.cells.map((c) => c.date) ?? []
  const rangeDays = dates.length

  const rows = useMemo(() => agents.map((a) => ({
    id: a.agentId,
    label: a.username,
    color: agentColors.get(a.agentId) ?? OTHER,
    cells: a.cells.map((c) => {
      const active = c.stores > 0 || c.orders > 0
      return {
        date: c.date,
        level: active ? Math.max(0, Math.min(ACTIVITY_RAMP.length - 1, c.stores - 1)) : null,
        dot: c.orders > 0,
        tip: active
          ? [
            { label: 'Stores reported', value: String(c.stores) },
            { label: 'Content', value: c.requiredPosts ? formatPct(c.posts / c.requiredPosts) : '—' },
            { label: 'Direct orders', value: c.orders ? `${c.orders} · ${formatPHP(c.directSales)}` : '0' },
          ]
          : [{ label: 'Status', value: 'No activity logged' }],
      }
    }),
    meta: <span className="mkt-heat-pct">{a.activeDays}/{rangeDays}</span>,
  })), [agents, agentColors, rangeDays])

  if (loading) return <div className="mkt-chart-skeleton" style={{ height: 420 }} />
  if (agents.length === 0) return <div className="mkt-card"><Empty title="No agents to show" /></div>

  // Recency is measured against the end of the selected range, not the wall clock
  const ref = grid?.to ?? today
  const refIsToday = ref === today
  const activeToday = agents.filter((a) => a.lastActiveDate === ref).length
  const inactive = agents.filter((a) => {
    const d = daysSince(a.lastActiveDate, ref)
    return d === null || d >= INACTIVE_DAYS
  })
  const avgActive = agents.reduce((s, a) => s + a.activeDays, 0) / agents.length
  const bestStreak = [...agents].sort((a, b) => b.currentStreak - a.currentStreak)[0]

  const table = [...agents].sort((a, b) => b.activeDays - a.activeDays || b.currentStreak - a.currentStreak)

  return (
    <>
      <div className="mkt-mini-row">
        <MiniStat label={refIsToday ? 'Active today' : `Active on ${shortDate(ref)}`} value={`${activeToday} / ${agents.length}`} sub="logged a report or an order" color={METRIC_COLOR.inquiries} />
        <MiniStat label="Avg active days" value={`${avgActive.toFixed(1)} / ${rangeDays}`} sub={`${formatPct(rangeDays ? avgActive / rangeDays : 0)} consistency`} color={METRIC_COLOR.orders} />
        <MiniStat
          label="Longest current streak"
          value={bestStreak && bestStreak.currentStreak > 0 ? `${bestStreak.currentStreak} days` : '—'}
          sub={bestStreak && bestStreak.currentStreak > 0 ? bestStreak.username : 'nobody on a streak'}
          color={METRIC_COLOR.directSales}
        />
        <MiniStat
          label={`Quiet ${INACTIVE_DAYS}+ days`}
          value={String(inactive.length)}
          sub={inactive.length ? inactive.map((a) => a.username).join(', ') : 'everyone is reporting'}
          color={inactive.length ? STATUS.warning : STATUS.good}
        />
      </div>

      <ChartCard title="Reporting activity" sub="Each cell = one agent on one day · colour = stores reported · dot = direct order that day">
        <HeatGrid
          dates={dates}
          rows={rows}
          ramp={ACTIVITY_RAMP}
          today={today}
          onRowClick={onSelectAgent}
          legend={
            <RampLegend
              ramp={ACTIVITY_RAMP}
              low="1 store"
              high="4+ stores"
              extra={<>
                <span className="mkt-ramp-extra"><i className="mkt-heat-cell mkt-heat-cell--none" /> No activity</span>
                <span className="mkt-ramp-extra"><i className="mkt-heat-cell" style={{ background: ACTIVITY_RAMP[1] }}><i className="mkt-heat-dot" /></i> Direct order</span>
              </>}
            />
          }
        />
      </ChartCard>

      <ChartCard title="Consistency" sub={`Streaks count consecutive days with a report or order (looks back up to a year). Quiet ${INACTIVE_DAYS}+ days is flagged.`} flush>
        <div className="mkt-table-scroll">
          <table className="mkt-table mkt-table--compact">
            <thead>
              <tr>
                <th scope="col">Agent</th>
                <th scope="col">Last active</th>
                <th scope="col" className="mkt-num">Active days</th>
                <th scope="col" className="mkt-num">Missed days</th>
                <th scope="col" className="mkt-num">Current streak</th>
                <th scope="col" className="mkt-num">Best streak (1y)</th>
              </tr>
            </thead>
            <tbody>
              {table.map((a) => {
                const since = daysSince(a.lastActiveDate, ref)
                const quiet = since === null || since >= INACTIVE_DAYS
                return (
                  <tr key={a.agentId} className="mkt-tr" onClick={() => onSelectAgent(a.agentId)}>
                    <td>
                      <button type="button" className="mkt-agent-link" onClick={(e) => { e.stopPropagation(); onSelectAgent(a.agentId) }}>
                        <AgentAvatar name={a.username} color={agentColors.get(a.agentId) ?? OTHER} />
                        <span>{a.username}</span>
                      </button>
                    </td>
                    <td>
                      <span title={a.lastActiveDate ? longDate(a.lastActiveDate) : 'No activity in the last year'}>{refIsToday ? lastActiveLabel(since) : a.lastActiveDate ? longDate(a.lastActiveDate) : 'Never'}</span>
                      {quiet && <span className="mkt-status" style={{ '--st': STATUS.warning, marginLeft: 8 } as React.CSSProperties}>⚠ Quiet</span>}
                    </td>
                    <td className="mkt-num">
                      <div className="mkt-cell-bar mkt-cell-bar--teal">
                        <span style={{ width: `${rangeDays ? (a.activeDays / rangeDays) * 100 : 0}%` }} />
                        <strong>{a.activeDays}</strong>
                      </div>
                    </td>
                    <td className="mkt-num">{a.missedDays}</td>
                    <td className="mkt-num"><strong>{a.currentStreak}</strong>{a.currentStreak > 0 && refIsToday && a.lastActiveDate === shiftDate(today, -1) && <span className="mkt-muted" title="Streak continues if they report today"> · today pending</span>}</td>
                    <td className="mkt-num">{a.longestStreak}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </>
  )
}
