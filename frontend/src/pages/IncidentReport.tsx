import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ResponsiveContainer, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { INCIDENT_TYPE_LABELS, IncidentType, UserRole } from '@dom/shared'
import { useAuthStore } from '../stores/authStore'
import {
  useIncidents,
  useIncidentStats,
  useIncidentReport,
  useIncidentTypes,
  useDeleteIncident,
  type Incident,
} from '../api/incidents'
import { useBranding, brandingLogoUrl } from '../api/branding'
import { money } from '../api/accounting'
import DateRangePicker, { type DateRange } from '../components/accounting/DateRangePicker'
import CreateIncidentModal     from './incident/CreateIncidentModal'
import ViewIncidentModal       from './incident/ViewIncidentModal'
import CompanySettingsModal    from './incident/CompanySettingsModal'
import ConfirmModal            from '../components/shared/ConfirmModal'

const TYPE_COLORS = ['#dc2626', '#d97706', '#2563eb', '#7c3aed', '#0891b2', '#16a34a', '#db2777', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#9333ea']

export default function IncidentReport() {
  const navigate = useNavigate()

  const [page,        setPage]        = useState(1)
  const [search,      setSearch]      = useState('')
  const [typeFilter,  setTypeFilter]  = useState<IncidentType | ''>('')
  const [range,       setRange]       = useState<DateRange>({ from: '', to: '' })

  const periodLabel = !range.from && !range.to
    ? 'All time'
    : range.from === range.to ? range.from : `${range.from || '…'} → ${range.to || '…'}`

  const stats    = useIncidentStats()
  const report   = useIncidentReport({ from: range.from || undefined, to: range.to || undefined })
  const incidents = useIncidents({
    page, pageSize: 25,
    search: search.trim() || undefined,
    type:   typeFilter || undefined,
    from: range.from || undefined, to: range.to || undefined,
  })
  const branding  = useBranding()
  const types     = useIncidentTypes()

  const [createOpen,   setCreateOpen]   = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [viewing,      setViewing]      = useState<Incident | null>(null)
  const [editing,      setEditing]      = useState<Incident | null>(null)
  const [deleting,     setDeleting]     = useState<Incident | null>(null)
  const deleteIncident = useDeleteIncident()

  const totalPages = Math.max(1, Math.ceil((incidents.data?.total ?? 0) / 25))
  const smtpConfigured = !!stats.data?.smtpConfigured

  // Incident Reporters can create/edit/email any incident but may never delete one.
  const role = useAuthStore((s) => s.user?.role)
  const canDelete = role === UserRole.ADMIN || role === UserRole.WAREHOUSE_ADMIN

  const sortedTypes = useMemo(
    () => (types.data ?? []).slice().sort((a, b) => a.label.localeCompare(b.label)),
    [types.data],
  )

  const trendData = (report.data?.trend ?? []).map((t) => ({ label: t.label, count: t.count }))
  const byTypeRows = (report.data?.byType ?? []).map((t) => ({ type: t.type, name: t.label, count: t.count }))
  const topType = report.data?.byType[0] ?? null

  function goToEmployeeReport() {
    const params = new URLSearchParams()
    if (range.from) params.set('from', range.from)
    if (range.to)   params.set('to', range.to)
    navigate(`/incident-report/employees${params.toString() ? `?${params}` : ''}`)
  }

  return (
    <div className="panel-root">
      <main className="panel-body" style={{ display: 'grid', gap: 18 }}>

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
              {branding.data?.companyName ? `${branding.data.companyName} · ` : ''}Track and document employee incidents
            </div>
          </div>
          <div className="page-hero-actions" style={{ display: 'flex', gap: 10 }}>
            <button className="page-hero-cta" onClick={() => setSettingsOpen(true)} title="Company name & logo">
              ⚙ Branding
            </button>
            <button className="page-hero-cta" onClick={() => setCreateOpen(true)}>
              + Create Incident
            </button>
          </div>
        </section>

        {/* ── Date range control (drives stat cards, charts and the table) ───── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Overview</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{periodLabel}</div>
          </div>
          <DateRangePicker value={range} onChange={(r) => { setRange(r); setPage(1) }} />
        </div>

        {/* ── Stat cards ────────────────────────────────────────────────────── */}
        <div className="stats-grid">
          <Stat label="Total Incidents"    value={report.data?.total ?? 0}      tint="primary" />
          <Stat label="This Month"          value={stats.data?.thisMonth ?? 0} tint="info" />
          <Stat
            label="Top Incident Type"
            value={topType ? `${topType.label} (${topType.count})` : '—'}
            tint="warn"
            stringValue
          />
          <Stat
            label="Estimated Cost"
            value={money(report.data?.totalEstimatedCost ?? 0)}
            tint="danger"
            stringValue
          />
          <Stat
            label="Email Delivery"
            value={smtpConfigured ? 'Configured' : 'Not configured'}
            tint={smtpConfigured ? 'success' : 'danger'}
            stringValue
          />
        </div>

        {/* ── Trend chart ───────────────────────────────────────────────────── */}
        <ChartCard title="Incidents Over Time" subtitle={periodLabel}>
          {report.isLoading ? <div className="empty-state" style={{ padding: 24 }}><p className="empty-state-desc">Loading…</p></div>
            : trendData.length === 0 ? <div className="empty-state" style={{ padding: 24 }}><p className="empty-state-desc">No incidents for this period.</p></div>
            : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={trendData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} width={40} />
                  <Tooltip formatter={(v: any) => [`${v} incident${Number(v) === 1 ? '' : 's'}`, 'Incidents']} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }} />
                  <Bar dataKey="count" fill="#dc2626" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            )}
        </ChartCard>

        {/* ── Breakdown by type ────────────────────────────────────────────── */}
        <ChartCard title="Incidents by Type" subtitle={`${periodLabel} · ${report.data?.total ?? 0} total`}>
          {report.isLoading ? <div className="empty-state" style={{ padding: 24 }}><p className="empty-state-desc">Loading…</p></div>
            : byTypeRows.length === 0 ? <div className="empty-state" style={{ padding: 24 }}><p className="empty-state-desc">No incidents for this period.</p></div>
            : (
              <>
                <ResponsiveContainer width="100%" height={Math.max(180, byTypeRows.length * 34 + 30)}>
                  <BarChart data={byTypeRows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#334155' }} width={160} tickFormatter={shortLabel} />
                    <Tooltip formatter={(v: any) => [`${v} incident${Number(v) === 1 ? '' : 's'}`, 'Incidents']} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={26} cursor="pointer" onClick={(d: any) => { const t = d?.payload?.type ?? d?.type; setTypeFilter((cur) => (cur === t ? '' : t)); setPage(1) }}>
                      {byTypeRows.map((r, i) => <Cell key={r.type} fill={typeFilter && typeFilter !== r.type ? '#cbd5e1' : TYPE_COLORS[i % TYPE_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                {typeFilter && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-muted)' }}>
                    Filtered to <b>{INCIDENT_TYPE_LABELS[typeFilter as IncidentType]}</b> —{' '}
                    <button type="button" className="btn btn-sm btn-outline" onClick={() => setTypeFilter('')}>Clear</button>
                  </div>
                )}
              </>
            )}
        </ChartCard>

        {/* ── CTA → employee breakdown (page 2) ───────────────────────────────── */}
        <button
          type="button"
          onClick={goToEmployeeReport}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
            background: 'linear-gradient(135deg,#eef2ff,#e0e7ff)', border: '1px solid #c7d2fe',
            borderRadius: 12, padding: '18px 20px', cursor: 'pointer', textAlign: 'left',
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#4338ca', textTransform: 'uppercase', letterSpacing: 0.5 }}>Employee Breakdown</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>View Incident Count by Employee</div>
            <div style={{ fontSize: 13, color: '#475569', marginTop: 2 }}>Ranked leaderboard + full type breakdown per employee, for {periodLabel.toLowerCase()}</div>
          </div>
          <div style={{ fontSize: 22, color: '#4338ca' }}>→</div>
        </button>

        {/* ── Filter bar ────────────────────────────────────────────────────── */}
        <div className="filter-card">
          <div className="filter-field">
            <div className="filter-field-label">Search</div>
            <input
              type="text" value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Name, tracking #, email…"
              className="filter-field-input"
            />
          </div>
          <div className="filter-field">
            <div className="filter-field-label">Incident Type</div>
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value as IncidentType | ''); setPage(1) }}
              className="styled-select"
            >
              <option value="">All types</option>
              {sortedTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>

        {/* ── Recent Incidents ─────────────────────────────────────────────── */}
        <SectionCard title="Recent Incidents" count={incidents.data?.total ?? 0}>
          <div className="data-table-wrap">
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Date</Th>
                  <Th>Type</Th>
                  <Th>Employee</Th>
                  <Th>Reported By</Th>
                  <Th style={{ textAlign: 'center' }}>Email</Th>
                  <Th style={{ textAlign: 'center' }}>Signed</Th>
                  <Th style={{ textAlign: 'right' }}>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {incidents.data?.rows.length === 0 && (
                  <tr><td colSpan={8}>
                    <div className="empty-state">
                      <div className="empty-state-icon">📋</div>
                      <p className="empty-state-title">No incidents yet</p>
                      <p className="empty-state-desc">Click <b>+ Create Incident</b> to file the first report.</p>
                    </div>
                  </td></tr>
                )}
                {incidents.data?.rows.map((row, i) => (
                  <tr key={row.id}>
                    <Td>{(page - 1) * 25 + i + 1}</Td>
                    <Td>{new Date(row.incidentDate).toLocaleDateString()}</Td>
                    <Td>{INCIDENT_TYPE_LABELS[row.incidentType as IncidentType]}</Td>
                    <Td>{row.employeeFullName}</Td>
                    <Td>{row.reportedByFullName}</Td>
                    <Td style={{ textAlign: 'center' }}>
                      {row.emailSentAt
                        ? <span className="count-badge" style={{ background: '#d1fae5', color: '#047857' }}>Sent</span>
                        : <span className="count-badge" style={{ background: '#f1f5f9', color: '#64748b' }}>—</span>}
                    </Td>
                    <Td style={{ textAlign: 'center' }}>
                      {row.signedFilePath
                        ? <span className="count-badge" style={{ background: '#dbeafe', color: '#1d4ed8' }}>✓</span>
                        : <span className="count-badge" style={{ background: '#f1f5f9', color: '#64748b' }}>—</span>}
                    </Td>
                    <Td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button className="btn btn-sm btn-outline" onClick={() => setEditing(row)}>Edit</button>
                        <button className="btn btn-sm btn-outline" onClick={() => setViewing(row)}>Open</button>
                        {canDelete && (
                          <button
                            className="btn btn-sm btn-outline"
                            style={{ color: '#b91c1c', borderColor: '#fecaca' }}
                            onClick={() => setDeleting(row)}
                          >Delete</button>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', fontSize: 13, color: 'var(--color-text-muted)' }}>
              <span>Page {page} / {totalPages}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm btn-outline" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</button>
                <button className="btn btn-sm btn-outline" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next</button>
              </div>
            </div>
          )}
        </SectionCard>

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
      {settingsOpen && (
        <CompanySettingsModal onClose={() => setSettingsOpen(false)} />
      )}
      {viewing && (
        <ViewIncidentModal
          incident={viewing}
          smtpConfigured={smtpConfigured}
          onClose={() => setViewing(null)}
          onChanged={() => { incidents.refetch(); stats.refetch() }}
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

// ─── Sub-components ─────────────────────────────────────────────────────────

function Stat({ label, value, tint, stringValue }: { label: string; value: number | string; tint: 'primary' | 'success' | 'info' | 'warn' | 'danger'; stringValue?: boolean }) {
  const tintBg: Record<string, string> = {
    primary: 'linear-gradient(135deg,#eff6ff,#dbeafe)',
    success: 'linear-gradient(135deg,#ecfdf5,#d1fae5)',
    info:    'linear-gradient(135deg,#eff6ff,#e0e7ff)',
    warn:    'linear-gradient(135deg,#fffbeb,#fef3c7)',
    danger:  'linear-gradient(135deg,#fef2f2,#fee2e2)',
  }
  const tintColor: Record<string, string> = {
    primary: '#1d4ed8', success: '#047857', info: '#4338ca', warn: '#b45309', danger: '#b91c1c',
  }
  return (
    <div className="stat-card" style={{ background: tintBg[tint] }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: tintColor[tint], textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: stringValue ? 14 : 28, fontWeight: 800, color: '#0f172a', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 12, padding: 16 }}>
      <div style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{title}</h2>
        {subtitle && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function SectionCard({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden' }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px', borderBottom: '1px solid var(--color-border)',
        background: '#fafbff',
      }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{title}</h2>
        <span className="count-badge">{count}</span>
      </header>
      {children}
    </section>
  )
}

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'left', ...style }}>{children}</th>
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: '10px 12px', fontSize: 13, color: '#0f172a', borderTop: '1px solid #f1f5f9', ...style }}>{children}</td>
}

function shortLabel(label: string): string {
  // Strip parenthetical descriptions and trailing detail for a tighter chart axis label.
  const cleaned = String(label).replace(/\s*\/.*$/, '').trim()
  return cleaned.length > 20 ? cleaned.slice(0, 20) + '…' : cleaned
}
