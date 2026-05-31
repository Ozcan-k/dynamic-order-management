import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ReturnCancelType,
  RETURN_CANCEL_TYPE_LABELS,
  PLATFORM_LABELS,
  CARRIER_LABELS,
} from '@dom/shared'
import { useReturnCancelList, useDeleteReturnCancel, type ReturnCancelRow } from '../api/returns'
import { TypeBadge } from './ReturnCancelScan'
import ConfirmModal from '../components/shared/ConfirmModal'

const PAGE_SIZE = 25

const PRESET_RANGES = [
  { id: '1',  label: '1 Day',   days: 1 },
  { id: '7',  label: '7 Days',  days: 7 },
  { id: '30', label: '1 Month', days: 30 },
] as const

function todayManila(): string {
  const ms = Date.now() + 8 * 60 * 60 * 1000
  return new Date(ms).toISOString().slice(0, 10)
}

function shiftDate(dateStr: string, days: number): string {
  const ms = new Date(`${dateStr}T00:00:00.000Z`).getTime() + days * 24 * 60 * 60 * 1000
  return new Date(ms).toISOString().slice(0, 10)
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Manila',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function ReturnCancel() {
  const [page,       setPage]       = useState(1)
  const [search,     setSearch]     = useState('')
  const [typeFilter, setTypeFilter] = useState<ReturnCancelType | ''>('')

  const today = todayManila()
  const [presetId,   setPresetId]   = useState<string>('7')
  const [customFrom, setCustomFrom] = useState<string>(shiftDate(today, -29))
  const [customTo,   setCustomTo]   = useState<string>(today)

  const { from, to } = useMemo(() => {
    if (presetId === 'custom') return { from: customFrom, to: customTo }
    const days = PRESET_RANGES.find((p) => p.id === presetId)?.days ?? 7
    return { from: shiftDate(today, -(days - 1)), to: today }
  }, [presetId, customFrom, customTo, today])

  const list = useReturnCancelList({
    page, pageSize: PAGE_SIZE,
    search: search.trim() || undefined,
    type:   typeFilter || undefined,
    from, to,
  })

  const [deleting, setDeleting] = useState<ReturnCancelRow | null>(null)
  const deleteRow = useDeleteReturnCancel()

  const stats = list.data?.stats ?? { total: 0, returns: 0, cancels: 0 }
  const totalPages = Math.max(1, Math.ceil((list.data?.total ?? 0) / PAGE_SIZE))

  return (
    <div className="panel-root">
      <main className="panel-body" style={{ display: 'grid', gap: 18 }}>

        {/* ── Page hero ─────────────────────────────────────────────────────── */}
        <section className="page-hero">
          <div className="page-hero-content">
            <div className="page-hero-label">Outbound</div>
            <h1 className="page-hero-title">Return &amp; Cancel Report</h1>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
              Returned and cancelled parcels. Records are kept for 6 months.
            </div>
          </div>
          <div className="page-hero-actions">
            <Link to="/returns/scan" className="page-hero-cta">+ Scan Parcel</Link>
          </div>
        </section>

        {/* ── Stat cards ────────────────────────────────────────────────────── */}
        <div className="stats-grid">
          <Stat label="Total"   value={stats.total}   tint="primary" />
          <Stat label="Returns" value={stats.returns} tint="warn" />
          <Stat label="Cancels" value={stats.cancels} tint="danger" />
        </div>

        {/* ── Filter bar ────────────────────────────────────────────────────── */}
        <div className="filter-card">
          <div className="filter-field">
            <div className="filter-field-label">Search Waybill</div>
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Tracking number…"
              className="filter-field-input"
            />
          </div>
          <div className="filter-field">
            <div className="filter-field-label">Type</div>
            <select
              className="styled-select"
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value as ReturnCancelType | ''); setPage(1) }}
            >
              <option value="">All</option>
              {Object.values(ReturnCancelType).map((t) => (
                <option key={t} value={t}>{RETURN_CANCEL_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Date range strip ──────────────────────────────────────────────── */}
        <div className="page-hero">
          <div className="page-hero-content">
            <div className="page-hero-label">Date Range</div>
            <div className="page-hero-title">{from} → {to}</div>
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

        {/* ── Table ─────────────────────────────────────────────────────────── */}
        <section style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden' }}>
          <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--color-border)', background: '#fafbff' }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Records</h2>
            <span className="count-badge">{list.data?.total ?? 0}</span>
          </header>
          <div className="data-table-wrap">
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Waybill</Th>
                  <Th>Type</Th>
                  <Th>Store</Th>
                  <Th>Platform</Th>
                  <Th>Courier</Th>
                  <Th>Date / Time</Th>
                  <Th style={{ textAlign: 'right' }}>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {list.data?.rows.length === 0 && (
                  <tr><td colSpan={8}>
                    <div className="empty-state">
                      <div className="empty-state-icon">📦</div>
                      <p className="empty-state-title">No records in this range</p>
                      <p className="empty-state-desc">Use <b>+ Scan Parcel</b> to record a return or cancellation.</p>
                    </div>
                  </td></tr>
                )}
                {list.data?.rows.map((row, i) => (
                  <tr key={row.id}>
                    <Td>{(page - 1) * PAGE_SIZE + i + 1}</Td>
                    <Td style={{ fontWeight: 700, letterSpacing: 0.3 }}>{row.trackingNumber}</Td>
                    <Td><TypeBadge type={row.type} /></Td>
                    <Td>{row.storeName}</Td>
                    <Td>{PLATFORM_LABELS[row.platform]}</Td>
                    <Td>{CARRIER_LABELS[row.carrier]}</Td>
                    <Td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(row.createdAt)}</Td>
                    <Td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-sm btn-outline"
                        style={{ color: '#b91c1c', borderColor: '#fecaca' }}
                        onClick={() => setDeleting(row)}
                      >Delete</button>
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
                <button className="btn btn-sm btn-outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
                <button className="btn btn-sm btn-outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
              </div>
            </div>
          )}
        </section>
      </main>

      {deleting && (
        <ConfirmModal
          title="Delete Record"
          message={`Delete the ${RETURN_CANCEL_TYPE_LABELS[deleting.type]} record for waybill ${deleting.trackingNumber}?`}
          detail="This permanently removes the record. This action cannot be undone."
          confirmLabel="Delete"
          tone="danger"
          busy={deleteRow.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await deleteRow.mutateAsync(deleting.id)
              setDeleting(null)
            } catch { /* keep modal open so the user can retry */ }
          }}
        />
      )}
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Stat({ label, value, tint }: { label: string; value: number; tint: 'primary' | 'warn' | 'danger' }) {
  const tintBg: Record<string, string> = {
    primary: 'linear-gradient(135deg,#eff6ff,#dbeafe)',
    warn:    'linear-gradient(135deg,#fffbeb,#fef3c7)',
    danger:  'linear-gradient(135deg,#fef2f2,#fee2e2)',
  }
  const tintColor: Record<string, string> = { primary: '#1d4ed8', warn: '#b45309', danger: '#b91c1c' }
  return (
    <div className="stat-card" style={{ background: tintBg[tint] }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: tintColor[tint], textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'left', ...style }}>{children}</th>
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: '10px 12px', fontSize: 13, color: '#0f172a', borderTop: '1px solid #f1f5f9', ...style }}>{children}</td>
}
