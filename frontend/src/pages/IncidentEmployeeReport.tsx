import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { INCIDENT_TYPE_LABELS, IncidentType } from '@dom/shared'
import { useIncidentPivot, useIncidentTypes } from '../api/incidents'
import { money } from '../api/accounting'

const EMP_COLORS = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#9333ea']

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function topTypeOf(counts: Record<string, number>): { type: string; count: number } | null {
  let best: { type: string; count: number } | null = null
  for (const [type, count] of Object.entries(counts)) {
    if (!best || count > best.count) best = { type, count }
  }
  return best
}

export default function IncidentEmployeeReport() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const from = params.get('from') ?? undefined
  const to   = params.get('to') ?? undefined

  const [showDetail, setShowDetail] = useState(false)

  const pivot = useIncidentPivot({ from, to })
  const types = useIncidentTypes()

  const sortedTypes = useMemo(
    () => (types.data ?? []).slice().sort((a, b) => a.label.localeCompare(b.label)),
    [types.data],
  )

  const rows = pivot.data?.rows ?? []
  const maxTotal = Math.max(...rows.map((r) => r.total), 1)
  const rangeLabel = from && to ? (from === to ? from : `${from} → ${to}`) : 'All time'

  return (
    <div className="panel-root">
      <main className="panel-body" style={{ display: 'grid', gap: 18 }}>

        <div className="page-hero">
          <div className="page-hero-content">
            <div className="page-hero-label">Incident Count by Employee</div>
            <div className="page-hero-title">{rangeLabel}</div>
          </div>
          <div className="page-hero-actions">
            <button type="button" className="preset-btn" onClick={() => navigate('/incident-report')}>
              ← Back to Report
            </button>
          </div>
        </div>

        <section style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 12, padding: 18 }}>
          <div style={{ marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Ranked by Incident Count</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>{rangeLabel} · {rows.length} employee{rows.length === 1 ? '' : 's'}</p>
          </div>

          {pivot.isLoading ? (
            <div className="empty-state" style={{ padding: 24 }}><p className="empty-state-desc">Loading…</p></div>
          ) : rows.length === 0 ? (
            <div className="empty-state" style={{ padding: 24 }}><p className="empty-state-desc">No incident records for this period.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {rows.map((r, i) => {
                const color = EMP_COLORS[i % EMP_COLORS.length]
                const top = topTypeOf(r.counts)
                const topLabel = top ? (INCIDENT_TYPE_LABELS[top.type as IncidentType] ?? top.type) : '—'
                return (
                  <div key={r.userId} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ width: 22, textAlign: 'center', fontWeight: 700, fontSize: 13, color: '#94a3b8' }}>{i + 1}</span>
                    <span style={{ width: 38, height: 38, borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{initials(r.fullName)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {r.fullName} <span style={{ fontWeight: 400, fontSize: 12, color: '#94a3b8' }}>· top: {topLabel}</span>
                        </span>
                        <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', whiteSpace: 'nowrap' }}>{r.total} incident{r.total === 1 ? '' : 's'}</span>
                      </div>
                      <div style={{ height: 8, borderRadius: 6, background: '#f1f5f9', overflow: 'hidden' }}>
                        <div style={{ width: `${(r.total / maxTotal) * 100}%`, height: '100%', borderRadius: 6, background: color, transition: 'width .3s' }} />
                      </div>
                    </div>
                    <div style={{ width: 110, textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: r.totalCost > 0 ? '#b91c1c' : '#94a3b8' }}>{r.totalCost > 0 ? money(r.totalCost) : '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>est. cost</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <div>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => setShowDetail((v) => !v)}>
            {showDetail ? 'Hide full type breakdown ▲' : 'Show full type breakdown ▼'}
          </button>
        </div>

        {showDetail && (
          <section style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden' }}>
            <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--color-border)', background: '#fafbff' }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Full Breakdown — Employee × Incident Type</h2>
            </header>
            {rows.length === 0 ? (
              <div className="empty-state" style={{ padding: 24 }}><p className="empty-state-desc">No incident records for this period.</p></div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
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
                    {rows.map((row, i) => (
                      <tr key={row.userId} style={{ background: i % 2 === 0 ? '#fff' : '#fafbff' }}>
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
              </div>
            )}
          </section>
        )}

      </main>
    </div>
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

function shortLabel(label: string): string {
  const cleaned = label.replace(/\s*\/.*$/, '').trim()
  return cleaned.length > 16 ? cleaned.slice(0, 16) + '…' : cleaned
}
