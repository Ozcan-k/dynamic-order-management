import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { SALES_TARGET_INFO, type AgentTargetRow } from '@dom/shared'
import { fetchMarketingTargets } from '../../../api/marketing'
import { ChartCard, Empty } from '../chartKit'
import { todayManila } from '../format'
import { OTHER } from '../palette'
import TargetEditor from './TargetEditor'
import { OverallRing, TargetBar } from './targetUi'
import { STATUS_META, overallColor, pctText } from './targetFormat'

// Marketing Report → Targets (v2.94.0): each agent's monthly progress against the targets.
// Month is its own URL param (?month=YYYY-MM); the report's date range does not apply here.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthLabel = (m: string, long = false) => {
  const [y, mm] = m.split('-').map(Number)
  return long ? `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][mm - 1]} ${y}` : `${MONTHS[mm - 1]} ${String(y).slice(2)}`
}
const shiftMonth = (m: string, n: number) => {
  const [y, mm] = m.split('-').map(Number)
  return new Date(Date.UTC(y, mm - 1 + n, 1)).toISOString().slice(0, 7)
}

type Sort = 'overall' | 'name'

export default function TargetsTab({ agentColors, isAdmin, agentFilter }: {
  agentColors: Map<string, string>
  isAdmin: boolean
  agentFilter: string[]
}) {
  const [sp, setSp] = useSearchParams()
  const thisMonth = todayManila().slice(0, 7)
  const raw = sp.get('month')
  const month = raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : thisMonth
  const [sort, setSort] = useState<Sort>('overall')
  const [editing, setEditing] = useState(false)

  const setMonth = (m: string) => {
    const next = new URLSearchParams(sp)
    if (m === thisMonth) next.delete('month')
    else next.set('month', m)
    setSp(next, { replace: true })
  }

  const q = useQuery({
    queryKey: ['marketing-targets', month],
    queryFn: () => fetchMarketingTargets(month),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
  const d = q.data

  const agents = useMemo(() => {
    const list = (d?.agents ?? []).filter((a) => agentFilter.length === 0 || agentFilter.includes(a.agentId))
    return [...list].sort((a, b) => sort === 'name' ? a.username.localeCompare(b.username) : (b.overall ?? -1) - (a.overall ?? -1) || a.username.localeCompare(b.username))
  }, [d, sort, agentFilter])

  const counts = useMemo(() => {
    const c = { MET: 0, ON_TRACK: 0, BEHIND: 0, MISSED: 0, UPCOMING: 0 }
    for (const a of agents) for (const m of a.metrics) if (m.status) c[m.status]++
    return c
  }, [agents])

  const phaseText = !d ? '' : d.phase === 'current'
    ? `Day ${d.elapsedDays} of ${d.daysInMonth} · the grey tick on each bar is where an agent should be by today`
    : d.phase === 'past' ? 'Month closed — final results' : 'Upcoming month — nothing counted yet'

  return (
    <div className="tg-root">
      <div className="tg-head">
        <div className="tg-month">
          <button type="button" className="mkt-btn-ghost tg-nav" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
          <div>
            <h3>{monthLabel(month, true)}</h3>
            <p>{phaseText}</p>
          </div>
          <button type="button" className="mkt-btn-ghost tg-nav" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">›</button>
          {month !== thisMonth && <button type="button" className="mkt-btn-ghost" onClick={() => setMonth(thisMonth)}>This month</button>}
        </div>
        <div className="tg-head-r">
          <div className="tg-legend" aria-label="Status legend">
            {(['MET', 'ON_TRACK', 'BEHIND', 'MISSED'] as const).map((s) => (
              <span key={s}><i style={{ background: STATUS_META[s].color }} aria-hidden="true" />{STATUS_META[s].label} <b>{counts[s]}</b></span>
            ))}
          </div>
          {isAdmin && <button type="button" className="tg-edit" onClick={() => setEditing(true)}>Edit targets</button>}
        </div>
      </div>

      {q.isError && <div className="mkt-error" role="alert">Could not load targets.</div>}
      {!d && q.isLoading && <div className="mkt-card tg-skel" />}

      {d && (
        <>
          <ChartCard title="Team progress" sub={`Sum over agents who have each target switched on · ${d.agents.length} agents`}>
            <div className="tg-team">
              {d.team.map((p) => (
                <div key={p.metric} className="tg-team-tile">
                  <TargetBar p={p} compact />
                  <small>{SALES_TARGET_INFO[p.metric].measures}</small>
                </div>
              ))}
            </div>
          </ChartCard>

          <div className="tg-sortbar">
            <span>{agents.length} agent{agents.length === 1 ? '' : 's'}{agentFilter.length ? ' (filtered)' : ''}</span>
            <div className="mkt-seg" role="group" aria-label="Sort agents">
              <button type="button" aria-pressed={sort === 'overall'} className={sort === 'overall' ? 'is-active' : ''} onClick={() => setSort('overall')}>Best first</button>
              <button type="button" aria-pressed={sort === 'name'} className={sort === 'name' ? 'is-active' : ''} onClick={() => setSort('name')}>A–Z</button>
            </div>
          </div>

          {agents.length === 0 ? <Empty title="No sales agents" /> : (
            <div className="tg-grid">
              {agents.map((a) => <AgentCard key={a.agentId} a={a} color={agentColors.get(a.agentId) ?? OTHER} />)}
            </div>
          )}

          <ChartCard title="Last 6 months" sub="Overall achievement per month (average of each tracked target, capped at 100%) · current targets applied to every month" flush>
            <div className="tg-hist-wrap">
              <table className="tg-hist">
                <thead>
                  <tr>
                    <th scope="col" className="l">Agent</th>
                    {d.history.months.map((m) => <th key={m} scope="col" className={m === month ? 'is-sel' : ''}>{monthLabel(m)}{m === thisMonth ? ' · to date' : ''}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a) => {
                    const h = d.history.rows.find((r) => r.agentId === a.agentId)
                    return (
                      <tr key={a.agentId}>
                        <th scope="row" className="l"><i style={{ background: agentColors.get(a.agentId) ?? OTHER }} aria-hidden="true" />{a.username}</th>
                        {d.history.months.map((m, i) => {
                          const v = h?.overall[i] ?? null
                          return (
                            <td key={m}>
                              <button type="button" className="tg-hist-cell" onClick={() => setMonth(m)} disabled={v == null}
                                style={{ ['--c' as string]: overallColor(v) }} title={`${a.username} · ${monthLabel(m, true)}: ${pctText(v)}`}>
                                {pctText(v)}
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </>
      )}

      {editing && <TargetEditor onClose={() => setEditing(false)} />}
    </div>
  )
}

function AgentCard({ a, color }: { a: AgentTargetRow; color: string }) {
  const tracked = a.metrics.filter((m) => m.target !== null)
  const good = tracked.filter((m) => m.status === 'MET' || m.status === 'ON_TRACK').length
  const weak = tracked.filter((m) => m.status === 'BEHIND' || m.status === 'MISSED')
  return (
    <article className="tg-card" style={{ ['--agent' as string]: color }}>
      <header className="tg-card-head">
        <OverallRing value={a.overall} />
        <div className="tg-card-id">
          <Link to={`/marketing-report/agents/${a.agentId}`} className="tg-card-name">{a.username}</Link>
          <span>{tracked.length ? `${good} of ${tracked.length} targets met or on track` : 'No targets tracked'}{a.custom ? ' · custom targets' : ''}</span>
        </div>
      </header>
      <div className="tg-card-body">
        {a.metrics.map((p) => <TargetBar key={p.metric} p={p} />)}
      </div>
      <footer className="tg-card-foot">
        {weak.length > 0
          ? <span className="tg-focus">Focus: {weak.map((m) => SALES_TARGET_INFO[m.metric].short).join(', ')}</span>
          : tracked.length > 0 && tracked.every((m) => m.status !== 'UPCOMING')
            ? <span className="tg-focus tg-focus--ok">All tracked targets met or on track</span>
            : <span />}
        <Link to={`/marketing-report/agents/${a.agentId}`} className="tg-more">Profile →</Link>
      </footer>
    </article>
  )
}
