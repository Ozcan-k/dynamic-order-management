import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ACC_PAYMENT_STATUS_LABELS, type AccSale } from '@dom/shared'
import { useSales, useSalesStats, useDeleteSale, downloadInvoicePdf, money, type SaleFilters } from '../../api/accounting'
import ConfirmModal from '../../components/shared/ConfirmModal'
import DateRangePicker from '../../components/accounting/DateRangePicker'

export default function AccInvoices() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState<SaleFilters>({ page: 1, pageSize: 25 })
  const { data, isLoading } = useSales(filters)
  const { data: stats } = useSalesStats()
  const del = useDeleteSale()
  const [toDelete, setToDelete] = useState<AccSale | null>(null)

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1

  return (
    <div className="acc-page">
      <div className="acc-head acc-head-row">
        <div><h1 className="acc-title">Invoices</h1><p className="acc-sub">Manage and track all your invoices</p></div>
        <button className="acc-btn acc-btn-success" onClick={() => navigate('/accounting/sales/new')}>+ New Invoice</button>
      </div>

      <div className="acc-grid acc-grid-4" style={{ marginBottom: 20 }}>
        <div className="acc-stat acc-stat--blue"><div className="acc-stat-label">Total Invoices</div><div className="acc-stat-value">{money(stats?.total ?? 0)}</div><div className="acc-stat-sub">{stats?.count ?? 0} invoices</div></div>
        <div className="acc-stat acc-stat--red"><div className="acc-stat-label">Unpaid</div><div className="acc-stat-value neg">{money(stats?.unpaid ?? 0)}</div><div className="acc-stat-sub">pending</div></div>
        <div className="acc-stat acc-stat--green"><div className="acc-stat-label">Collected</div><div className="acc-stat-value pos">{money(stats?.paid ?? 0)}</div><div className="acc-stat-sub">paid</div></div>
        <div className="acc-stat acc-stat--amber"><div className="acc-stat-label">This Month</div><div className="acc-stat-value warn">{money(stats?.thisMonth ?? 0)}</div><div className="acc-stat-sub">issued</div></div>
      </div>

      <div className="acc-filter-bar">
        <div className="acc-field"><label>Status</label>
          <select value={filters.status || ''} onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}>
            <option value="">All</option><option value="PAID">Paid</option><option value="UNPAID">Unpaid</option>
          </select></div>
        <div className="acc-field"><label>Date</label>
          <DateRangePicker value={{ from: filters.from || '', to: filters.to || '' }} onChange={(r) => setFilters({ ...filters, from: r.from, to: r.to, page: 1 })} />
        </div>
        <div className="acc-field" style={{ flex: 1, minWidth: 180 }}><label>Search</label><input placeholder="Invoice no. or customer…" value={filters.search || ''} onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })} /></div>
      </div>

      <div className="acc-table-wrap">
        <table>
          <thead><tr>
            <th>Invoice Number</th><th>Record Date</th><th>Customer Name</th><th>Due Date</th>
            <th className="acc-col-num">Amount</th><th>Status</th><th className="acc-col-actions">Actions</th>
          </tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={7} className="acc-empty">Loading…</td></tr>
              : (data?.items.length ?? 0) === 0 ? <tr><td colSpan={7} className="acc-empty">No invoices present.</td></tr>
              : data!.items.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.invoiceNo}</td>
                  <td>{new Date(s.dateIssued).toLocaleDateString('en-US')}</td>
                  <td>{s.customerName}{s.salesAgentName && <div className="acc-muted" style={{ fontSize: 12 }}>by {s.salesAgentName}</div>}</td>
                  <td>{s.dueDate ? new Date(s.dueDate).toLocaleDateString('en-US') : <span className="acc-muted">—</span>}</td>
                  <td className="acc-col-num">{money(s.total)}</td>
                  <td><span className={`acc-badge ${s.status === 'PAID' ? 'acc-badge-paid' : 'acc-badge-pending'}`}>{ACC_PAYMENT_STATUS_LABELS[s.status]}</span></td>
                  <td className="acc-col-actions"><span className="acc-row-actions">
                    <button className="acc-btn acc-btn-outline acc-btn-sm" onClick={() => downloadInvoicePdf(s.id, s.invoiceNo)}>PDF</button>
                    <button className="acc-btn acc-btn-outline acc-btn-sm" onClick={() => navigate(`/accounting/sales/${s.id}/edit`)}>Edit</button>
                    <button className="acc-btn acc-btn-ghost acc-btn-sm" onClick={() => setToDelete(s)}>Delete</button>
                  </span></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {data && data.total > data.pageSize && (
        <div className="acc-pagination">
          <button className="acc-btn acc-btn-outline acc-btn-sm" disabled={(filters.page || 1) <= 1} onClick={() => setFilters({ ...filters, page: (filters.page || 1) - 1 })}>Prev</button>
          <span>Page {filters.page || 1} / {totalPages}</span>
          <button className="acc-btn acc-btn-outline acc-btn-sm" disabled={(filters.page || 1) >= totalPages} onClick={() => setFilters({ ...filters, page: (filters.page || 1) + 1 })}>Next</button>
        </div>
      )}

      {toDelete && (
        <ConfirmModal title={`Delete ${toDelete.invoiceNo}?`} message="This permanently removes the invoice and its line items." confirmLabel="Delete" tone="danger"
          busy={del.isPending} onCancel={() => setToDelete(null)} onConfirm={async () => { await del.mutateAsync(toDelete.id); setToDelete(null) }} />
      )}
    </div>
  )
}
