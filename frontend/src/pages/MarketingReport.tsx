import { useMemo } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import PageShell from '../components/shared/PageShell'
import ActivityTab from '../components/marketing/ActivityTab'
import ContentTab from '../components/marketing/ContentTab'
import FilterHero from '../components/marketing/FilterHero'
import KpiRow from '../components/marketing/KpiRow'
import LiveTab from '../components/marketing/LiveTab'
import OverviewTab from '../components/marketing/OverviewTab'
import SalesTab from '../components/marketing/SalesTab'
import { IconTrend } from '../components/marketing/icons'
import { buildAgentColors } from '../components/marketing/palette'
import { TABS, useMarketingFilters, type TabId } from '../components/marketing/useMarketingFilters'
import { fetchActivityGrid, fetchAnalyticsOverview, fetchMarketingAgents } from '../api/marketing'
import { useAuthStore } from '../stores/authStore'

export default function MarketingReport() {
  const user = useAuthStore((s) => s.user)
  const f = useMarketingFilters()
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  // Agent profile keeps the report's filters in its URL so "back" restores this exact view
  const openAgent = (id: string) => navigate(`/marketing-report/agents/${id}${sp.toString() ? `?${sp.toString()}` : ''}`)

  const liveRefetch = f.isLive ? (f.preset === 'today' ? 30_000 : 60_000) : false

  const agentsQuery = useQuery({ queryKey: ['marketing-agents'], queryFn: fetchMarketingAgents, staleTime: 5 * 60_000 })
  const overviewQuery = useQuery({
    queryKey: ['marketing-overview', f.filter],
    queryFn: () => fetchAnalyticsOverview(f.filter),
    placeholderData: keepPreviousData,
    staleTime: f.isLive ? 10_000 : 60_000,
    refetchInterval: liveRefetch,
  })
  const needsGrid = f.tab === 'content' || f.tab === 'activity'
  const gridQuery = useQuery({
    queryKey: ['marketing-activity-grid', f.filter],
    queryFn: () => fetchActivityGrid(f.filter),
    enabled: needsGrid,
    placeholderData: keepPreviousData,
    staleTime: f.isLive ? 10_000 : 60_000,
    refetchInterval: needsGrid ? liveRefetch : false,
  })

  const agents = useMemo(() => agentsQuery.data ?? [], [agentsQuery.data])
  const agentColors = useMemo(() => buildAgentColors(agents), [agents])
  const overview = overviewQuery.data
  const loading = overviewQuery.isLoading

  const tabProps = { data: overview, loading, agentColors, onSelectAgent: openAgent }

  return (
    <PageShell
      icon={<IconTrend size={20} />}
      title="Marketing Report"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
    >
      <div className="mkt-root">
        <FilterHero
          f={f}
          agents={agents}
          agentColors={agentColors}
          previous={overview?.previous}
          fetching={(overviewQuery.isFetching && !overviewQuery.isLoading) || (gridQuery.isFetching && !gridQuery.isLoading)}
        />

        {(overviewQuery.isError || gridQuery.isError) && (
          <div className="mkt-error" role="alert">Could not load the report. Check your connection and try again.</div>
        )}

        <KpiRow
          current={overview?.kpis.current}
          previous={overview?.kpis.previous}
          daily={overview?.daily}
          loading={loading}
        />

        <TabBar tab={f.tab} onChange={f.setTab} />

        <div className="mkt-tabpanel" role="tabpanel" id={`mkt-panel-${f.tab}`} aria-labelledby={`mkt-tab-${f.tab}`}>
          {f.tab === 'overview' && <OverviewTab {...tabProps} />}
          {f.tab === 'content' && (
            <ContentTab {...tabProps} grid={gridQuery.data} gridLoading={gridQuery.isLoading} today={f.today} />
          )}
          {f.tab === 'live' && <LiveTab {...tabProps} />}
          {f.tab === 'sales' && <SalesTab {...tabProps} />}
          {f.tab === 'activity' && (
            <ActivityTab grid={gridQuery.data} loading={gridQuery.isLoading} agentColors={agentColors} today={f.today} onSelectAgent={openAgent} />
          )}
        </div>
      </div>
    </PageShell>
  )
}

function TabBar({ tab, onChange }: { tab: TabId; onChange: (t: TabId) => void }) {
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const i = TABS.findIndex((t) => t.id === tab)
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]
    onChange(next.id)
    document.getElementById(`mkt-tab-${next.id}`)?.focus()
  }
  return (
    <div className="mkt-tabs" role="tablist" aria-label="Report sections" onKeyDown={onKeyDown}>
      {TABS.map((t) => (
        <button
          key={t.id}
          id={`mkt-tab-${t.id}`}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          aria-controls={`mkt-panel-${t.id}`}
          tabIndex={tab === t.id ? 0 : -1}
          className="mkt-tab"
          onClick={() => onChange(t.id)}
        >{t.label}</button>
      ))}
    </div>
  )
}
