import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import PageShell from '../components/shared/PageShell'
import { getOldOrders } from '../api/dispatch'

const OldOrdersIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15 14" />
  </svg>
)

// ISO → "YYYY-MM-DD HH:mm" in Manila (UTC+8). "—" for null.
function fmtManila(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000)
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700,
  color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em',
  borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = {
  padding: '11px 14px', fontSize: 13, color: '#0f172a',
  borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap',
}

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

      <div className="acc-card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '4px 0 0', marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflowX: 'auto' }}>
        <div style={{ padding: '14px 16px 8px' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
            Old Orders {!isLoading && <span style={{ color: '#b45309' }}>({rows.length})</span>}
          </h3>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
            In-house parcels shipped in this range whose order was packed (packer-complete) on an earlier day.
          </p>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>
              <th style={th}>Barcode</th>
              <th style={th}>Inbound Date</th>
              <th style={th}>Packer Complete</th>
              <th style={th}>Packed By</th>
              <th style={th}>Outbound Scan</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td style={{ ...td, textAlign: 'center', color: '#94a3b8' }} colSpan={5}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td style={{ ...td, textAlign: 'center', color: '#94a3b8' }} colSpan={5}>No old orders in this range.</td></tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.trackingNumber}-${i}`}>
                  <td style={{ ...td, fontWeight: 700, fontFamily: 'monospace' }}>
                    {r.trackingNumber}
                    {r.archived && (
                      <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 999, padding: '1px 7px', fontFamily: 'inherit' }}>
                        archived
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, color: '#475569', fontVariantNumeric: 'tabular-nums' }}>{fmtManila(r.inboundDate)}</td>
                  <td style={{ ...td, color: '#475569', fontVariantNumeric: 'tabular-nums' }}>{fmtManila(r.packerCompleteDate)}</td>
                  <td style={td}>{r.packedBy ?? '—'}</td>
                  <td style={{ ...td, color: '#16a34a', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtManila(r.scanDate)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PageShell>
  )
}
