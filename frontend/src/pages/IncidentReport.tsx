import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  DISCIPLINARY_ACTION_LABELS,
  DisciplinaryAction,
  INCIDENT_TYPE_CATEGORY,
  INCIDENT_TYPE_LABELS,
  IncidentCategory,
  IncidentType,
  UserRole,
} from '@dom/shared'
import { useAuthStore } from '../stores/authStore'
import {
  useIncidents,
  useIncidentStats,
  useIncidentReport,
  useIncidentTypes,
  useDeleteIncident,
  fetchIncident,
  type Incident,
} from '../api/incidents'
import { useBranding, brandingLogoUrl } from '../api/branding'
import { money } from '../api/accounting'
import DateRangePicker, { type DateRange } from '../components/accounting/DateRangePicker'
import CreateIncidentModal from './incident/CreateIncidentModal'
import ViewIncidentModal from './incident/ViewIncidentModal'
import CompanySettingsModal from './incident/CompanySettingsModal'
import ConfirmModal from '../components/shared/ConfirmModal'
import { BarList, ChartCard, Empty, Legend, TooltipCard } from '../components/marketing/chartKit'
import { AXIS_PROPS, GRID_PROPS } from '../components/marketing/chartTheme'
import { relativeDelta } from '../components/marketing/format'
import { ACTION_ORDER, ACTION_STYLE, actionLabel, CATEGORY_COLOR, CATEGORY_ORDER, categoryLabel } from '../components/incident/incidentPalette'
import { ActionPill, LadderDots, OccurrenceBadge } from '../components/incident/incidentUi'
import PersonProfileDrawer from '../components/incident/PersonProfileDrawer'

const PAGE_SIZE = 25

function compactPeso(n: number): string {
  const a = Math.abs(n)
  if (a >= 1_000_000) return `₱${(n / 1_000_000).toFixed(1)}M`
  if (a >= 1_000) return `₱${(n / 1_000).toFixed(1)}K`
  return `₱${Math.round(n)}`
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export default function IncidentReport() {
  const navigate = useNavigate()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<IncidentType | ''>('')
  const [categoryFilter, setCategoryFilter] = useState<IncidentCategory | ''>('')
  const [actionFilter, setActionFilter] = useState<DisciplinaryAction | 'NOT_RECORDED' | ''>('')
  const [personFilter, setPersonFilter] = useState<{ userId: string; name: string } | null>(null)
  const [range, setRange] = useState<DateRange>({ from: '', to: '' })

  const periodLabel = !range.from && !range.to
    ? 'All time'
    : range.from === range.to ? range.from : `${range.from || '…'} → ${range.to || '…'}`

  const stats = useIncidentStats()
  const report = useIncidentReport({ from: range.from || undefined, to: range.to || undefined })
  const incidents = useIncidents({
    page, pageSize: PAGE_SIZE,
    search: search.trim() || undefined,
    type: typeFilter || undefined,
    category: typeFilter ? undefined : categoryFilter || undefined,
    action: actionFilter || undefined,
    samePersonAs: personFilter?.userId,
    from: range.from || undefined, to: range.to || undefined,
  })
  const branding = useBranding()
  const types = useIncidentTypes()

  const [createOpen, setCreateOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [viewing, setViewing] = useState<Incident | null>(null)
  const [editing, setEditing] = useState<Incident | null>(null)
  const [deleting, setDeleting] = useState<Incident | null>(null)
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const deleteIncident = useDeleteIncident()

  const totalPages = Math.max(1, Math.ceil((incidents.data?.total ?? 0) / PAGE_SIZE))
  const smtpConfigured = !!stats.data?.smtpConfigured

  // Incident Reporters can create/edit/email any incident but may never delete one.
  const role = useAuthStore((s) => s.user?.role)
  const canDelete = role === UserRole.ADMIN || role === UserRole.WAREHOUSE_ADMIN

  const sortedTypes = useMemo(
    () => (types.data ?? []).slice().sort((a, b) => a.label.localeCompare(b.label)),
    [types.data],
  )

  const r = report.data
  const loading = report.isLoading
  const prev = r?.previous ?? null
  const resetPage = () => setPage(1)
  const hasFilters = !!(search || typeFilter || categoryFilter || actionFilter || personFilter)

  function clearFilters() {
    setSearch(''); setTypeFilter(''); setCategoryFilter(''); setActionFilter(''); setPersonFilter(null); resetPage()
  }

  function goToEmployeeReport() {
    const params = new URLSearchParams()
    if (range.from) params.set('from', range.from)
    if (range.to) params.set('to', range.to)
    navigate(`/incident-report/employees${params.toString() ? `?${params}` : ''}`)
  }

  function scrollToTable() {
    document.getElementById('incident-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ─── Chart data ────────────────────────────────────────────────────────────
  const trendData = (r?.trend ?? []).map((t) => ({ label: t.label, total: t.count, ...(t.byCategory ?? {}) }))
  const presentCategories = CATEGORY_ORDER.filter((c) => (r?.byCategory ?? []).some((x) => x.category === c))

  const categoryItems = (r?.byCategory ?? []).map((c) => ({
    id: c.category,
    label: categoryLabel(c.category),
    value: c.count,
    display: `${c.count}`,
    color: CATEGORY_COLOR[c.category],
    sub: c.cost > 0 ? `${money(c.cost)} cost` : undefined,
  }))

  const actionCounts = new Map((r?.byAction ?? []).map((a) => [a.action, a.count]))
  const actionItems = ACTION_ORDER
    .filter((a) => (actionCounts.get(a) ?? 0) > 0)
    .map((a) => ({
      id: a,
      label: actionLabel(a),
      value: actionCounts.get(a) ?? 0,
      display: `${actionCounts.get(a) ?? 0}`,
      color: ACTION_STYLE[a].fill,
    }))
  const notRecorded = actionCounts.get('NOT_RECORDED') ?? 0

  const typeItems = (r?.byType ?? []).slice(0, 10).map((t) => ({
    id: t.type,
    label: t.label,
    value: t.count,
    display: `${t.count}`,
    color: CATEGORY_COLOR[INCIDENT_TYPE_CATEGORY[t.type as IncidentType]],
  }))

  const costItems = (r?.byEmployeeCost ?? []).slice(0, 8).map((e) => ({
    id: e.employeeUserId,
    label: e.employeeFullName,
    value: e.cost,
    display: money(e.cost),
    color: '#DC2626',
  }))

  return (
    <div className="panel-root">
      <main className="panel-body mkt-root inc-root" style={{ display: 'grid', gap: 18 }}>

        {/* ── Page hero ─────────────────────────────────────────────────────── */}
        <section className="page-hero" style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {branding.data?.hasLogo && (
            <img
              src={brandingLogoUrl(branding.data.updatedAt)}
              alt="logo"
              style={{ width: 56, height: 56, borderRadius: 12, background: 'rgba(255,255,255,0.15)', padding: 4, objectFit: 'contain' }}
            />
          )}
          <div className="page-hero-content" style={{ flex: 1 }}>
            <div className="page-hero-label">HR &amp; Operations</div>
            <h1 className="page-hero-title">Incident Reports</h1>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
              {branding.data?.companyName ? `${branding.data.companyName} · ` : ''}Track incidents, repeat offenders and the disciplinary ladder
            </div>
          </div>
          <div className="page-hero-actions" style={{ display: 'flex', gap: 10 }}>
            <button className="page-hero-cta" onClick={() => setSettingsOpen(true)} title="Company name & logo">⚙ Branding</button>
            <button className="page-hero-cta" onClick={() => setCreateOpen(true)}>+ Create Incident</button>
          </div>
        </section>

        {/* ── Period (drives KPIs, charts and the table) ─────────────────────── */}
        <div className="inc-period">
          <div>
            <div className="inc-eyebrow">Overview</div>
            <div className="inc-period-title">{periodLabel}</div>
            {prev && <div className="inc-period-sub">compared with {prev.from} → {prev.to}</div>}
          </div>
          <DateRangePicker value={range} onChange={(v) => { setRange(v); resetPage() }} />
        </div>

        {/* ── KPIs ──────────────────────────────────────────────────────────── */}
        <div className="mkt-kpis">
          <Kpi color="#DC2626" label="Incidents" value={r?.total ?? 0} loading={loading}
            delta={prev ? relativeDelta(r?.total ?? 0, prev.total) : null} deltaGoodWhenDown
            sub={prev ? `prev ${prev.total}` : `${stats.data?.thisMonth ?? 0} this month`} />
          <Kpi color="#3B82F6" label="People involved" value={r?.employeesInvolved ?? 0} loading={loading}
            delta={prev ? relativeDelta(r?.employeesInvolved ?? 0, prev.employeesInvolved) : null} deltaGoodWhenDown
            sub="distinct employees" />
          <Kpi color="#C2410C" label="Repeat offenders" value={r?.repeatOffenders ?? 0} loading={loading}
            sub="2+ incidents in this period" onClick={() => document.getElementById('repeat-offenders')?.scrollIntoView({ behavior: 'smooth' })} />
          <Kpi color="#9A3412" label="Warnings issued" value={r?.warningsIssued ?? 0} loading={loading}
            delta={prev ? relativeDelta(r?.warningsIssued ?? 0, prev.warningsIssued) : null} deltaGoodWhenDown
            sub={notRecorded > 0 ? `${notRecorded} without a recorded action` : 'every incident has an action'} />
          <Kpi color="#16A34A" label="Total cost" value={money(r?.totalCost ?? 0)} loading={loading}
            delta={prev ? relativeDelta(r?.totalCost ?? 0, prev.totalCost) : null} deltaGoodWhenDown
            sub={prev ? `prev ${compactPeso(prev.totalCost)}` : 'estimated loss + shipping'} />
          <Kpi color="#4C1D95" label="Awaiting signed copy" value={r?.unsignedCount ?? 0} loading={loading}
            sub={r?.total ? `${Math.round(((r.total - (r.unsignedCount ?? 0)) / r.total) * 100)}% signed` : '—'} />
        </div>

        {/* ── Trend by category ─────────────────────────────────────────────── */}
        <ChartCard title="Incidents over time" sub={`${periodLabel} · stacked by category`}>
          {loading ? <div className="mkt-chart-skeleton" style={{ height: 280 }} /> : trendData.length === 0 ? (
            <Empty title="No incidents in this period" />
          ) : (
            <>
              <Legend items={presentCategories.map((c) => ({ label: categoryLabel(c), color: CATEGORY_COLOR[c] }))} />
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={trendData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }} barCategoryGap="18%">
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={16} />
                  <YAxis {...AXIS_PROPS} allowDecimals={false} width={32} />
                  <Tooltip
                    cursor={{ fill: '#94A3B8', fillOpacity: 0.12 }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      const row = payload[0].payload as Record<string, number>
                      return (
                        <TooltipCard
                          title={`${label} · ${row.total} incident${row.total === 1 ? '' : 's'}`}
                          rows={presentCategories.filter((c) => row[c]).map((c) => ({ label: categoryLabel(c), value: String(row[c]), color: CATEGORY_COLOR[c] }))}
                        />
                      )
                    }}
                  />
                  {presentCategories.map((c, i) => (
                    <Bar key={c} dataKey={c} stackId="cat" fill={CATEGORY_COLOR[c]} radius={i === presentCategories.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} maxBarSize={30} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </ChartCard>

        {/* ── Category + disciplinary actions ───────────────────────────────── */}
        <div className="mkt-grid-2">
          <ChartCard title="By category" sub="Click a category to filter the table">
            {loading ? <div className="mkt-chart-skeleton" style={{ height: 200 }} /> : (
              <BarList items={categoryItems} onSelect={(id) => { setCategoryFilter(id as IncidentCategory); setTypeFilter(''); resetPage(); scrollToTable() }} emptyTitle="No incidents in this period" />
            )}
          </ChartCard>
          <ChartCard title="Disciplinary actions" sub="Coaching → Verbal → Written → Final → Suspension → Termination">
            {loading ? <div className="mkt-chart-skeleton" style={{ height: 200 }} /> : (
              <>
                <BarList items={actionItems} onSelect={(id) => { setActionFilter(id as DisciplinaryAction | 'NOT_RECORDED'); resetPage(); scrollToTable() }} emptyTitle="No incidents in this period" />
                {notRecorded > 0 && (
                  <p className="inc-note">
                    <b>{notRecorded}</b> incident{notRecorded === 1 ? ' has' : 's have'} no recorded action — incidents filed before this feature
                    stay <i>Not recorded</i>. Open one and use <b>Edit</b> to record the action that was actually taken.
                  </p>
                )}
              </>
            )}
          </ChartCard>
        </div>

        {/* ── Repeat offenders + types ──────────────────────────────────────── */}
        <div className="mkt-grid-2">
          <ChartCard title="Repeat offenders" sub="2+ incidents in this period · ladder = highest action in the period · click for full history">
            <div id="repeat-offenders" />
            {loading ? <div className="mkt-chart-skeleton" style={{ height: 240 }} /> : (r?.repeatList ?? []).length === 0 ? (
              <Empty title="No repeat offenders in this period" />
            ) : (
              <ol className="inc-repeat">
                {(r?.repeatList ?? []).slice(0, 10).map((p) => (
                  <li key={p.personKey}>
                    <button type="button" className="inc-repeat-row" onClick={() => setProfileUserId(p.userId)} title={`Open ${p.name}'s incident history`}>
                      <span className="inc-repeat-count">{p.count}</span>
                      <span className="inc-repeat-main">
                        <b>{p.name}</b>
                        <small>
                          {p.allTime > p.count ? `${p.allTime} all time · ` : ''}
                          {p.topType ? `${p.topType.label} ×${p.topType.count}` : ''}
                          {' · last '}{p.lastDate}
                        </small>
                      </span>
                      <span className="inc-repeat-ladder">
                        <LadderDots highest={p.highestAction} />
                        <small>{p.highestAction ? DISCIPLINARY_ACTION_LABELS[p.highestAction] : p.notRecorded === p.count ? 'Not recorded' : '—'}{p.warnings > 0 ? ` · ${p.warnings} warning${p.warnings === 1 ? '' : 's'}` : ''}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </ChartCard>
          <ChartCard title="Top incident types" sub="Colour = category · click to filter">
            {loading ? <div className="mkt-chart-skeleton" style={{ height: 240 }} /> : (
              <div className="mkt-scroll-list">
                <BarList items={typeItems} onSelect={(id) => { setTypeFilter(id as IncidentType); setCategoryFilter(''); resetPage(); scrollToTable() }} emptyTitle="No incidents in this period" />
              </div>
            )}
          </ChartCard>
        </div>

        {/* ── Cost + employee breakdown CTA ─────────────────────────────────── */}
        <div className="mkt-grid-2">
          <ChartCard title="Cost by employee" sub={`${periodLabel} · total ${money(r?.totalCost ?? 0)}`}>
            {loading ? <div className="mkt-chart-skeleton" style={{ height: 200 }} /> : (
              <BarList items={costItems} emptyTitle="No cost-incurring incidents in this period" />
            )}
          </ChartCard>
          <button type="button" className="inc-cta" onClick={goToEmployeeReport}>
            <div>
              <div className="inc-eyebrow" style={{ color: '#4338ca' }}>Employee breakdown</div>
              <div className="inc-cta-title">Incident count by employee →</div>
              <div className="inc-cta-sub">Ranked leaderboard + full type breakdown per employee, for {periodLabel.toLowerCase()}</div>
            </div>
          </button>
        </div>

        {/* ── Filters ───────────────────────────────────────────────────────── */}
        <div className="filter-card" id="incident-table">
          <div className="filter-field">
            <div className="filter-field-label">Search</div>
            <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); resetPage() }}
              placeholder="Name, tracking #, email…" className="filter-field-input" />
          </div>
          <div className="filter-field">
            <div className="filter-field-label">Category</div>
            <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value as IncidentCategory | ''); setTypeFilter(''); resetPage() }} className="styled-select">
              <option value="">All categories</option>
              {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
            </select>
          </div>
          <div className="filter-field">
            <div className="filter-field-label">Incident type</div>
            <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value as IncidentType | ''); resetPage() }} className="styled-select">
              <option value="">All types</option>
              {sortedTypes
                .filter((t) => !categoryFilter || INCIDENT_TYPE_CATEGORY[t.value] === categoryFilter)
                .map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="filter-field">
            <div className="filter-field-label">Disciplinary action</div>
            <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value as DisciplinaryAction | 'NOT_RECORDED' | ''); resetPage() }} className="styled-select">
              <option value="">All actions</option>
              {ACTION_ORDER.map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}
            </select>
          </div>
        </div>

        {/* ── Incidents table ───────────────────────────────────────────────── */}
        <section className="mkt-card">
          <header className="mkt-card-head">
            <div>
              <h3 className="mkt-card-title">Incidents <span className="count-badge" style={{ marginLeft: 6 }}>{incidents.data?.total ?? 0}</span></h3>
              <p className="mkt-card-sub"># = the person's incident count across all time (both logins when linked to one employee)</p>
            </div>
            {hasFilters && (
              <div className="inc-active-filters">
                {personFilter && <span className="inc-chip">Employee: {personFilter.name}</span>}
                {categoryFilter && <span className="inc-chip">{categoryLabel(categoryFilter)}</span>}
                {typeFilter && <span className="inc-chip">{INCIDENT_TYPE_LABELS[typeFilter]}</span>}
                {actionFilter && <span className="inc-chip">{actionLabel(actionFilter)}</span>}
                <button type="button" className="mkt-btn-ghost" onClick={clearFilters}>Clear filters</button>
              </div>
            )}
          </header>
          <div className="mkt-table-scroll">
            <table className="mkt-table mkt-table--compact inc-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Type</th>
                  <th scope="col">Employee</th>
                  <th scope="col">Action</th>
                  <th scope="col">Reported by</th>
                  <th scope="col" style={{ textAlign: 'center' }}>Email</th>
                  <th scope="col" style={{ textAlign: 'center' }}>Signed</th>
                  <th scope="col" style={{ textAlign: 'right' }}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {incidents.data?.rows.length === 0 && (
                  <tr><td colSpan={8}>
                    <Empty title={hasFilters ? 'No incidents match these filters' : 'No incidents yet'}>
                      {hasFilters ? <button type="button" className="mkt-btn-ghost" style={{ marginTop: 8 }} onClick={clearFilters}>Clear filters</button> : <>Click <b>+ Create Incident</b> to file the first report.</>}
                    </Empty>
                  </td></tr>
                )}
                {incidents.data?.rows.map((row) => {
                  const cat = INCIDENT_TYPE_CATEGORY[row.incidentType as IncidentType]
                  return (
                    <tr key={row.id}>
                      <td>{fmtDate(row.incidentDate)}</td>
                      <td>
                        <span className="inc-type">
                          <i style={{ background: CATEGORY_COLOR[cat] }} title={categoryLabel(cat)} />
                          {INCIDENT_TYPE_LABELS[row.incidentType as IncidentType]}
                        </span>
                      </td>
                      <td>
                        <span className="inc-emp">
                          <button type="button" className="inc-link inc-link--strong" onClick={() => setProfileUserId(row.employeeUserId)} title="Open incident history">
                            {row.employeeFullName}
                          </button>
                          <OccurrenceBadge occ={row.occurrence} />
                        </span>
                      </td>
                      <td><ActionPill action={row.disciplinaryAction} warningNo={row.occurrence?.warningNo} compact /></td>
                      <td>{row.reportedByFullName}</td>
                      <td style={{ textAlign: 'center' }}>
                        {row.emailSentAt
                          ? <span className="inc-status inc-status--ok" title={`Sent ${fmtDate(row.emailSentAt)}`}>Sent</span>
                          : <span className="inc-status">—</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {row.hasSignedCopy ?? !!row.signedFilePath
                          ? <span className="inc-status inc-status--signed" title={`${row.documentCount ?? 1} document${(row.documentCount ?? 1) === 1 ? '' : 's'}`}>✓ {row.documentCount && row.documentCount > 1 ? row.documentCount : ''}</span>
                          : <span className="inc-status inc-status--missing" title="No signed copy uploaded yet">Missing</span>}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button className="btn btn-sm btn-outline" onClick={() => setEditing(row)}>Edit</button>
                          <button className="btn btn-sm btn-outline" onClick={() => setViewing(row)}>Open</button>
                          {canDelete && (
                            <button className="btn btn-sm btn-outline" style={{ color: '#b91c1c', borderColor: '#fecaca' }} onClick={() => setDeleting(row)}>Delete</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="inc-pager">
              <span>Page {page} / {totalPages}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm btn-outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
                <button className="btn btn-sm btn-outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
              </div>
            </div>
          )}
        </section>
      </main>

      {createOpen && (
        <CreateIncidentModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => { stats.refetch(); incidents.refetch(); report.refetch() }}
        />
      )}
      {editing && (
        <CreateIncidentModal
          editing={editing}
          onClose={() => setEditing(null)}
          onCreated={() => { stats.refetch(); incidents.refetch(); report.refetch() }}
        />
      )}
      {settingsOpen && <CompanySettingsModal onClose={() => setSettingsOpen(false)} />}
      {viewing && (
        <ViewIncidentModal
          incident={viewing}
          smtpConfigured={smtpConfigured}
          onClose={() => setViewing(null)}
          onChanged={() => { incidents.refetch(); stats.refetch(); report.refetch() }}
          onOpenHistory={() => { const uid = viewing.employeeUserId; setViewing(null); setProfileUserId(uid) }}
        />
      )}
      {profileUserId && (
        <PersonProfileDrawer
          userId={profileUserId}
          onClose={() => setProfileUserId(null)}
          onOpenIncident={async (id) => {
            try {
              const inc = await fetchIncident(id)
              setProfileUserId(null)
              setViewing(inc)
            } catch { /* keep the drawer open */ }
          }}
          onShowInTable={(userId, name) => {
            setProfileUserId(null)
            setPersonFilter({ userId, name })
            resetPage()
            setTimeout(scrollToTable, 50)
          }}
        />
      )}
      {deleting && (
        <ConfirmModal
          title="Delete Incident Report"
          message={`Are you sure you want to delete the ${INCIDENT_TYPE_LABELS[deleting.incidentType as IncidentType]} report for ${deleting.employeeFullName}?`}
          detail="This permanently deletes the report and its signed file. This action cannot be undone."
          confirmLabel="Delete"
          tone="danger"
          busy={deleteIncident.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await deleteIncident.mutateAsync(deleting.id)
              setDeleting(null)
            } catch { /* keep modal open so the user can retry */ }
          }}
        />
      )}
    </div>
  )
}

// ─── KPI tile (Marketing Report styling, incident semantics) ────────────────

/** For incidents fewer is better: an increase is shown red, a decrease green — the arrow always tells the truth. */
function Kpi({ color, label, value, sub, delta, deltaGoodWhenDown, loading, onClick }: {
  color: string
  label: string
  value: number | string
  sub: string
  delta?: ReturnType<typeof relativeDelta> | null
  deltaGoodWhenDown?: boolean
  loading: boolean
  onClick?: () => void
}) {
  const increase = delta?.dir === 'up' || delta?.dir === 'new'
  const decrease = delta?.dir === 'down'
  const tone = !delta || delta.dir === 'none' ? null
    : delta.dir === 'flat' ? 'flat'
      : increase === !!deltaGoodWhenDown ? 'bad' : 'good'
  return (
    <article
      className={`mkt-kpi${loading ? ' mkt-kpi--skeleton' : ''}${onClick ? ' inc-kpi--link' : ''}`}
      style={{ '--kpi': color } as React.CSSProperties}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
    >
      {!loading && (
        <>
          <div className="mkt-kpi-label">{label}</div>
          <div className="mkt-kpi-value">{value}</div>
          <div className="mkt-kpi-sub">
            {tone && (
              <span className={`inc-delta inc-delta--${tone}`} title="vs previous period">
                {increase ? '▲ ' : decrease ? '▼ ' : ''}{delta!.dir === 'new' ? 'New' : delta!.label}
              </span>
            )}
            <span>{sub}</span>
          </div>
        </>
      )}
    </article>
  )
}
