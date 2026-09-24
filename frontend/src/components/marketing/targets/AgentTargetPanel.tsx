import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchMarketingTargets } from '../../../api/marketing'
import { ChartCard } from '../chartKit'
import { todayManila } from '../format'
import { OverallRing, TargetBar } from './targetUi'

// Agent profile → this month's targets (v2.94.0).
export default function AgentTargetPanel({ agentId }: { agentId: string }) {
  const month = todayManila().slice(0, 7)
  const q = useQuery({ queryKey: ['marketing-targets', month, agentId], queryFn: () => fetchMarketingTargets(month, agentId), staleTime: 60_000 })
  const row = q.data?.agents[0]
  const d = q.data
  return (
    <ChartCard
      title="This month's targets"
      sub={d ? `Day ${d.elapsedDays} of ${d.daysInMonth} · grey tick = where the pace says you should be today` : 'Loading…'}
      actions={<Link to={`/marketing-report?tab=targets`} className="mkt-btn-ghost">All agents →</Link>}
    >
      {q.isError && <div className="mkt-error">Could not load targets.</div>}
      {row && (
        <div className="tg-agent-panel">
          <div className="tg-agent-overall">
            <OverallRing value={row.overall} size={84} />
            <small>overall</small>
          </div>
          <div className="tg-agent-bars">
            {row.metrics.map((p) => <TargetBar key={p.metric} p={p} />)}
          </div>
        </div>
      )}
    </ChartCard>
  )
}
