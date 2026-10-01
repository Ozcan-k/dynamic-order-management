import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import PageShell from '../components/shared/PageShell'
import { getOldOrders } from '../api/dispatch'
import { fmtManilaDateTime, fmtDuration } from '../components/outbound/obFormat'

const OldOrdersIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15 14" />
  </svg>
)

export default function OldOrdersReport() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const from = params.get('from') ?? undefined
  const to = params.get('to') ?? undefined

  const { data, isLoading } = useQuery({
    queryKey: ['old-orders', from, to],
    queryFn: () => getOldOrders(from, to),
  })

  const rows = data ?? []
  const rangeLabel = from && to ? (from === to ? from : `${from} → ${to}`) : 'All time'
  const openHistory = (tn: string) => navigate(`/outbound/history?tn=${encodeURIComponent(tn)}`)

  return (
    <PageShell
      icon={OldOrdersIcon}
      title="Old Orders"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
    >
      {/* Back + range header */}
      <div className="page-hero" style={{ marginBottom: 20 }}>
        <div className="page-hero-content">
          <div className="page-hero-label">Backlog dispatched in</div>
          <div className="page-hero-title">{rangeLabel}</div>
        </div>
        <div className="page-hero-actions">
          <button type="button" className="preset-btn" onClick={() => navigate('/outbound/report')}>
            ← Back to Report
          </button>
        </div>
      </div>

      <section className="ob-card ob-card--flush">
        <div className="ob-card-head">
          <div>
            <h2 className="ob-card-title">Old orders</h2>
            <p className="ob-card-sub">
              In-house parcels shipped in this range whose order was packed on an earlier day. Click a barcode for its full history.
            </p>
          </div>
          {!isLoading && <span className="ob-pill ob-pill--warn">{rows.length} {rows.length === 1 ? 'parcel' : 'parcels'}</span>}
        </div>
        <div className="ob-table-wrap">
          <table className="ob-table">
            <thead>
              <tr>
                <th>Barcode</th>
                <th>Inbound</th>
                <th>Packer complete</th>
                <th>Picker</th>
                <th>Packer</th>
                <th>Outbound scan</th>
                <th>Waited</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8' }}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8' }}>No old orders in this range.</td></tr>
              ) : (
                rows.map((r, i) => {
                  const waited = r.packerCompleteDate
                    ? new Date(r.scanDate).getTime() - new Date(r.packerCompleteDate).getTime()
                    : null
                  return (
                    <tr key={`${r.trackingNumber}-${i}`}>
                      <td>
                        <button type="button" className="ob-tn-link" onClick={() => openHistory(r.trackingNumber)}>
                          {r.trackingNumber}
                        </button>
                        {r.archived && <span className="ob-tag">archived</span>}
                      </td>
                      <td style={{ color: '#475569' }}>{fmtManilaDateTime(r.inboundDate)}</td>
                      <td style={{ color: '#475569' }}>{fmtManilaDateTime(r.packerCompleteDate)}</td>
                      <td>{r.assignedPicker ?? '—'}</td>
                      <td>{r.assignedPacker ?? '—'}</td>
                      <td style={{ color: '#16a34a', fontWeight: 600 }}>{fmtManilaDateTime(r.scanDate)}</td>
                      <td><span className="ob-age">{waited == null ? '—' : fmtDuration(waited)}</span></td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </PageShell>
  )
}
