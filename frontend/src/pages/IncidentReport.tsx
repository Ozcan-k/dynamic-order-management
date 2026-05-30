import { useMemo, useState } from 'react'
import { INCIDENT_TYPE_LABELS, IncidentType } from '@dom/shared'
import {
  useIncidents,
  useIncidentStats,
  useIncidentPivot,
  useIncidentTypes,
  useDeleteIncident,
  type Incident,
} from '../api/incidents'
import { useBranding, brandingLogoUrl } from '../api/branding'
import CreateIncidentModal     from './incident/CreateIncidentModal'
import ViewIncidentModal       from './incident/ViewIncidentModal'
import CompanySettingsModal    from './incident/CompanySettingsModal'
import ConfirmModal            from '../components/shared/ConfirmModal'

const PRESET_RANGES = [
  { id: 'all', label: 'All time', days: 0 },
  { id: '7',   label: 'Last 7 days',  days: 7 },
  { id: '30',  label: 'Last 30 days', days: 30 },
  { id: '90',  label: 'Last 90 days', days: 90 },
] as const

function todayManila(): string {
  const ms = Date.now() + 8 * 60 * 60 * 1000
  return new Date(ms).toISOString().slice(0, 10)
}

function shiftDate(dateStr: string, days: number): string {
  const ms = new Date(`${dateStr}T00:00:00.000Z`).getTime() + days * 24 * 60 * 60 * 1000
  return new Date(ms).toISOString().slice(0, 10)
}

export default function IncidentReport() {
  const [page,        setPage]        = useState(1)
  const [search,      setSearch]      = useState('')
  const [typeFilter,  setTypeFilter]  = useState<IncidentType | ''>('')

  const today = todayManila()
  const [presetId,   setPresetId]   = useState<string>('all')
  const [customFrom, setCustomFrom] = useState<string>(shiftDate(today, -29))
  const [customTo,   setCustomTo]   = useState<string>(today)

  const { from, to } = useMemo(() => {
    if (presetId === 'all') return { from: undefined, to: undefined }
    if (presetId === 'custom') return { from: customFrom, to: customTo }
    const days = PRESET_RANGES.find((p) => p.id === presetId)?.days ?? 30
    return { from: shiftDate(today, -(days - 1)), to: today }
  }, [presetId, customFrom, customTo, today])

  const stats    = useIncidentStats()
  const incidents = useIncidents({
    page, pageSize: 25,
    search: search.trim() || undefined,
    type:   typeFilter || undefined,
    from, to,
  })
  const pivot     = useIncidentPivot()
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

  const sortedTypes = useMemo(
    () => (types.data ?? []).slice().sort((a, b) => a.label.localeCompare(b.label)),
    [types.data],
  )

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

        {/* ── Stat cards ────────────────────────────────────────────────────── */}
        <div className="stats-grid">
          <Stat label="Total Incidents"    value={stats.data?.total ?? 0}      tint="primary" />
          <Stat label="This Month"          value={stats.data?.thisMonth ?? 0} tint="info" />
          <Stat
            label="Top Incident Type"
            value={stats.data?.topType ? `${INCIDENT_TYPE_LABELS[stats.data.topType.type]} (${stats.data.topType.count})` : '—'}
            tint="warn"
            stringValue
          />
          <Stat
            label="Email Delivery"
            value={smtpConfigured ? 'Configured' : 'Not configured'}
            tint={smtpConfigured ? 'success' : 'danger'}
            stringValue
          />
        </div>

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

        {/* ── Date range strip (filters the Recent Incidents table) ──────────── */}
        <div className="page-hero">
          <div className="page-hero-content">
            <div className="page-hero-label">Date Range</div>
            <div className="page-hero-title">
              {presetId === 'all' ? 'All time' : `${from} → ${to}`}
            </div>
          </div>
          <div className="page-hero-actions">
            <div className="preset-btn-group">
              {PRESET_RANGES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setPresetId(p.id); setPage(1) }}
                  className={`preset-btn${presetId === p.id ? ' preset-btn--active' : ''}`}
                >{p.label}</button>
              ))}
              <button
                type="button"
                onClick={() => { setPresetId('custom'); setPage(1) }}
                className={`preset-btn${presetId === 'custom' ? ' preset-btn--active' : ''}`}
              >Custom</button>
            </div>
            {presetId === 'custom' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="date" value={customFrom} max={customTo}
                  onChange={(e) => { setCustomFrom(e.target.value); setPage(1) }}
                  style={{ padding: '8px 10px', borderRadius: 8, border: 'none', fontWeight: 600, color: '#0f172a' }} />
                <span>→</span>
                <input type="date" value={customTo} min={customFrom} max={today}
                  onChange={(e) => { setCustomTo(e.target.value); setPage(1) }}
                  style={{ padding: '8px 10px', borderRadius: 8, border: 'none', fontWeight: 600, color: '#0f172a' }} />
              </div>
            )}
          </div>
        </div>

        {/* ── Table A: Recent Incidents ─────────────────────────────────────── */}
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
                        <button
                          className="btn btn-sm btn-outline"
                          style={{ color: '#b91c1c', borderColor: '#fecaca' }}
                          onClick={() => setDeleting(row)}
                        >Delete</button>
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

        {/* ── Table B: Pivot — employee × incident type ──────────────────────── */}
        <SectionCard title="Incident Count by Employee" count={pivot.data?.rows.length ?? 0}>
          {(pivot.data?.rows.length ?? 0) === 0
            ? <div className="empty-state" style={{ padding: 24 }}>
                <p className="empty-state-desc">No incident records yet.</p>
              </div>
            : <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                      <th style={pivotHeadSticky}>Employee</th>
                      {sortedTypes.map((t) => (
                        <th key={t.value} style={pivotHead} title={t.label}>{shortLabel(t.label)}</th>
                      ))}
                      <th style={{ ...pivotHead, background: '#f1f5f9' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pivot.data!.rows.map((row) => (
                      <tr key={row.userId}>
                        <td style={pivotCellSticky}>{row.fullName}</td>
                        {sortedTypes.map((t) => {
                          const c = row.counts[t.value] ?? 0
                          return (
                            <td key={t.value} style={{ ...pivotCell, color: c ? 'var(--color-text-primary)' : 'var(--color-text-muted)', fontWeight: c ? 700 : 400 }}>{c || ''}</td>
                          )
                        })}
                        <td style={{ ...pivotCell, fontWeight: 700, background: '#f8fafc' }}>{row.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
        </SectionCard>

      </main>

      {createOpen && (
        <CreateIncidentModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => { stats.refetch(); incidents.refetch(); pivot.refetch() }}
        />
      )}
      {editing && (
        <CreateIncidentModal
          editing={editing}
          onClose={() => setEditing(null)}
          onCreated={() => { stats.refetch(); incidents.refetch(); pivot.refetch() }}
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

const pivotHead: React.CSSProperties = {
  padding: '8px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
  color: '#475569', letterSpacing: 0.5, textAlign: 'center',
  borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap',
}
const pivotHeadSticky: React.CSSProperties = {
  ...pivotHead, position: 'sticky', left: 0, background: '#f8fafc', textAlign: 'left', minWidth: 180,
}
const pivotCell: React.CSSProperties = {
  padding: '6px 10px', textAlign: 'center', borderBottom: '1px solid #f1f5f9',
  fontVariantNumeric: 'tabular-nums',
}
const pivotCellSticky: React.CSSProperties = {
  ...pivotCell, position: 'sticky', left: 0, background: '#fff', textAlign: 'left', fontWeight: 600,
}

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'left', ...style }}>{children}</th>
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: '10px 12px', fontSize: 13, color: '#0f172a', borderTop: '1px solid #f1f5f9', ...style }}>{children}</td>
}

function shortLabel(label: string): string {
  // Strip parenthetical descriptions and trailing detail for a tighter pivot header.
  const cleaned = label.replace(/\s*\/.*$/, '').trim()
  return cleaned.length > 16 ? cleaned.slice(0, 16) + '…' : cleaned
}
