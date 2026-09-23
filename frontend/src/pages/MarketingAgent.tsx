import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { SALE_CHANNEL_LABELS, SALES_PLATFORM_LABELS, type SaleChannel, type SalesPlatform } from '@dom/shared'
import PageShell from '../components/shared/PageShell'
import AgentCalendar from '../components/marketing/AgentCalendar'
import AgentDayModal from '../components/marketing/AgentDayModal'
import AgentHero from '../components/marketing/AgentHero'
import ChannelDonut from '../components/marketing/ChannelDonut'
import { BarList, ChartCard, Empty } from '../components/marketing/chartKit'
import { formatHours, formatInt, formatPct, formatPHP, shortDate } from '../components/marketing/format'
import KpiRow from '../components/marketing/KpiRow'
import PlatformMatrix from '../components/marketing/PlatformMatrix'
import TrendCard from '../components/marketing/TrendCard'
import { IconUsers } from '../components/marketing/icons'
import { buildAgentColors, CHANNEL_COLOR, METRIC_COLOR, OTHER, PLATFORM_COLOR } from '../components/marketing/palette'
import { useMarketingFilters } from '../components/marketing/useMarketingFilters'
import { fetchAgentSummary, fetchMarketingAgents } from '../api/marketing'
import { useAuthStore } from '../stores/authStore'

// /marketing-report/agents/:agentId — one agent's profile. Shares the report's
// URL filters (range, stores) so "back" returns to exactly the same view.

export default function MarketingAgent() {
  const { agentId = '' } = useParams()
  const [sp] = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const f = useMarketingFilters()
  const [month, setMonth] = useState(f.to.slice(0, 7))
  const [dayOpen, setDayOpen] = useState<string | null>(null)

  const agentsQuery = useQuery({ queryKey: ['marketing-agents'], queryFn: fetchMarketingAgents, staleTime: 5 * 60_000 })
  const agents = useMemo(() => agentsQuery.data ?? [], [agentsQuery.data])
  const agentColors = useMemo(() => buildAgentColors(agents), [agents])
  const agent = agents.find((a) => a.id === agentId)
  const color = agentColors.get(agentId) ?? OTHER

  // Team comparison always uses every agent — drop the report's agent filter here
  const filter = useMemo(() => ({ ...f.filter, agentIds: undefined }), [f.filter])
  const summaryQuery = useQuery({
    queryKey: ['marketing-agent-summary', agentId, filter],
    queryFn: () => fetchAgentSummary(agentId, filter),
    enabled: !!agentId,
    placeholderData: keepPreviousData,
    staleTime: f.isLive ? 10_000 : 60_000,
    refetchInterval: f.isLive ? 60_000 : false,
  })
  const s = summaryQuery.data?.agentId === agentId ? summaryQuery.data : undefined
  const loading = summaryQuery.isLoading || !s

  const backHref = `/marketing-report${sp.toString() ? `?${sp.toString()}` : ''}`
  const back = (
    <Link to={backHref} className="mkt-back">
      <span aria-hidden="true">←</span> Marketing Report
    </Link>
  )

  if (agentsQuery.isSuccess && !agent) {
    return (
      <PageShell icon={<IconUsers size={20} />} title="Agent not found" subtitle={`${user?.username ?? ''}`}>
        <div className="mkt-root">
          {back}
          <div className="mkt-card"><Empty title="This agent does not exist or is no longer active">Go back to the report to pick another agent.</Empty></div>
        </div>
      </PageShell>
    )
  }

  // Rank stores by sales when there are any, otherwise by content completion
  const hasStoreSales = (s?.byStore ?? []).some((st) => st.directSales > 0)
  const storeItems = [...(s?.byStore ?? [])]
    .map((st) => {
      const rate = st.requiredPosts ? st.posts / st.requiredPosts : 0
      return {
        id: st.store,
        label: st.store,
        value: hasStoreSales ? st.directSales : rate,
        display: hasStoreSales ? formatPHP(st.directSales) : formatPct(rate),
        color: hasStoreSales ? METRIC_COLOR.directSales : METRIC_COLOR.content,
        sub: [
          hasStoreSales ? `${st.orders} orders` : null,
          hasStoreSales && st.requiredPosts ? `content ${formatPct(rate)}` : null,
          !hasStoreSales && st.requiredPosts ? `${st.posts} of ${st.requiredPosts} posts` : null,
          st.liveOrders ? `${st.liveOrders} live orders` : null,
        ].filter(Boolean).join(' · '),
      }
    })
    .sort((a, b) => b.value - a.value)

  const liveItems = (s?.byPlatform ?? [])
    .filter((p) => p.liveHours > 0)
    .sort((a, b) => b.liveOrders - a.liveOrders)
    .map((p) => ({
      id: p.platform,
      label: SALES_PLATFORM_LABELS[p.platform as SalesPlatform] ?? p.platform,
      value: p.liveOrders,
      display: `${formatInt(p.liveOrders)} orders`,
      color: PLATFORM_COLOR[p.platform] ?? OTHER,
      sub: `${formatHours(p.liveHours)}h · ${(p.liveOrders / p.liveHours).toFixed(2)}/h${p.views ? ` · ${formatPct((p.likes + p.comments + p.shares) / p.views, 1)} engagement` : ''}`,
    }))

  return (
    <PageShell
      icon={<IconUsers size={20} />}
      title={agent?.username ?? 'Agent'}
      subtitle={`${user?.username} · agent profile`}
    >
      <div className="mkt-root">
        {back}

        {agent && (
          <AgentHero f={f} agent={agent} color={color} summary={s} fetching={summaryQuery.isFetching && !summaryQuery.isLoading} />
        )}

        {summaryQuery.isError && (
          <div className="mkt-error" role="alert">Could not load this agent. Check your connection and try again.</div>
        )}

        <KpiRow
          current={s?.kpis.current}
          previous={s?.kpis.previous}
          daily={s?.daily}
          team={s?.kpis.teamAverage ?? null}
          loading={loading}
        />

        <TrendCard title="Performance trend" daily={s?.daily} previousDaily={s?.previousDaily} loading={loading} />

        <div className="mkt-grid-3">
          <ChartCard title="Stores" sub={hasStoreSales ? 'By direct sales' : 'By content completion (no direct sales in this range)'}>
            {loading ? <div className="mkt-chart-skeleton" style={{ height: 220 }} /> : storeItems.length === 0 ? (
              <Empty title="No store activity in this range" />
            ) : (
              <div className="mkt-scroll-list">
                <BarList items={storeItems} max={hasStoreSales ? undefined : 1} />
              </div>
            )}
          </ChartCard>
          <ChannelDonut byChannel={s?.byChannel} loading={loading} />
          <ChartCard title="Live selling by platform" sub="Orders closed while live">
            {loading ? <div className="mkt-chart-skeleton" style={{ height: 220 }} /> : (
              <BarList items={liveItems} emptyTitle="No live sessions in this range" />
            )}
          </ChartCard>
        </div>

        <div className="mkt-grid-2">
          <PlatformMatrix matrix={s?.contentMatrix} loading={loading} />
          <ChartCard title="Latest direct orders" sub="Largest first within each day · click to open the day" flush>
            {loading ? <div className="mkt-chart-skeleton" style={{ height: 220, margin: 16 }} /> : (s?.recentOrders.length ?? 0) === 0 ? (
              <Empty title="No direct orders in this range" />
            ) : (
              <div className="mkt-table-scroll">
                <table className="mkt-table mkt-table--compact">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Customer</th>
                      <th scope="col">Channel</th>
                      <th scope="col" className="mkt-num">Items</th>
                      <th scope="col" className="mkt-num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s!.recentOrders.map((o) => (
                      <tr key={o.id} className="mkt-tr" onClick={() => setDayOpen(o.date)}>
                        <td>
                          <button type="button" className="mkt-link-btn" onClick={(e) => { e.stopPropagation(); setDayOpen(o.date) }}>{shortDate(o.date)}</button>
                        </td>
                        <td>
                          <div className="mkt-cell-2">
                            <strong>{o.companyName}</strong>
                            <span>{o.customerName} · {o.store}</span>
                          </div>
                        </td>
                        <td>
                          <span className="mkt-chan">
                            <span className="mkt-swatch mkt-swatch--dot" style={{ background: CHANNEL_COLOR[o.channel] ?? OTHER }} />
                            {SALE_CHANNEL_LABELS[o.channel as SaleChannel] ?? o.channel}
                          </span>
                        </td>
                        <td className="mkt-num">{o.itemCount}</td>
                        <td className="mkt-num"><strong>{formatPHP(o.total)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ChartCard>
        </div>

        {agent && (
          <AgentCalendar agentId={agent.id} month={month} onMonthChange={setMonth} today={f.today} onSelectDay={setDayOpen} />
        )}
      </div>

      {agent && dayOpen && (
        <AgentDayModal
          agentId={agent.id}
          agentName={agent.username}
          agentColor={color}
          date={dayOpen}
          isToday={dayOpen === f.today}
          onClose={() => setDayOpen(null)}
        />
      )}
    </PageShell>
  )
}
