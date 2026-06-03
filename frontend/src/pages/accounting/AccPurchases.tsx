import { useState } from 'react'
import { ACC_PAYMENT_STATUS_LABELS, ACC_COUNTRY_LABELS, type AccExpense } from '@dom/shared'
import { useExpenses, useExpensesStats, useDeleteExpense, money, type ExpenseFilters } from '../../api/accounting'
import ConfirmModal from '../../components/shared/ConfirmModal'
import PurchaseForm from './PurchaseForm'

export default function AccPurchases() {
  const [filters, setFilters] = useState<ExpenseFilters>({ page: 1, pageSize: 25 })
  const { data, isLoading } = useExpenses(filters)
  const { data: stats } = useExpensesStats()
  const del = useDeleteExpense()
  const [form, setForm] = useState<null | { initial: AccExpense | null }>(null)
  const [toDelete, setToDelete] = useState<AccExpense | null>(null)

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1

  return (
    <div className="acc-page">
      <div className="acc-head acc-head-row">
        <div><h1 className="acc-title">Purchases</h1><p className="acc-sub">Manage and track all your purchases</p></div>
        <button className="acc-btn acc-btn-success" onClick={() => setForm({ initial: null })}>+ New Purchase</button>
      </div>

      <div className="acc-grid acc-grid-4" style={{ marginBottom: 20 }}>
        <div className="acc-stat acc-stat--blue"><div className="acc-stat-label">Total Purchases</div><div className="acc-stat-value">{money(stats?.total ?? 0)}</div><div className="acc-stat-sub">{stats?.count ?? 0} purchases</div></div>
        <div className="acc-stat acc-stat--red"><div className="acc-stat-label">Unpaid</div><div className="acc-stat-value neg">{money(stats?.unpaid ?? 0)}</div><div className="acc-stat-sub">pending</div></div>
        <div className="acc-stat acc-stat--green"><div className="acc-stat-label">Paid</div><div className="acc-stat-value pos">{money(stats?.paid ?? 0)}</div><div className="acc-stat-sub">fully paid</div></div>
        <div className="acc-stat acc-stat--amber"><div className="acc-stat-label">This Month</div><div className="acc-stat-value warn">{money(stats?.thisMonth ?? 0)}</div><div className="acc-stat-sub">purchases</div></div>
      </div>

      <div className="acc-filter-bar">
        <div className="acc-field"><label>Status</label>
          <select value={filters.status || ''} onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}>
            <option value="">All</option><option value="PAID">Paid</option><option value="UNPAID">Unpaid</option>
          </select></div>
        <div className="acc-field"><label>Country</label>
          <select value={filters.country || ''} onChange={(e) => setFilters({ ...filters, country: e.target.value, page: 1 })}>
            <option value="">All</option>{Object.entries(ACC_COUNTRY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></div>
        <div className="acc-field"><label>From</label><input type="date" value={filters.from || ''} onChange={(e) => setFilters({ ...filters, from: e.target.value, page: 1 })} /></div>
        <div className="acc-field"><label>To</label><input type="date" value={filters.to || ''} onChange={(e) => setFilters({ ...filters, to: e.target.value, page: 1 })} /></div>
        <div className="acc-field" style={{ flex: 1, minWidth: 160 }}><label>Search</label><input placeholder="Purchase no. or vendor…" value={filters.search || ''} onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })} /></div>
      </div>

      <div className="acc-table-wrap">
        <table>
          <thead><tr>
            <th>Purchase Number</th><th>Record Date</th><th>Vendor Name</th><th>Country</th><th>Due Date</th>
            <th className="acc-col-num">Amount</th><th>Status</th><th className="acc-col-actions">Actions</th>
          </tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={8} className="acc-empty">Loading…</td></tr>
              : (data?.items.length ?? 0) === 0 ? <tr><td colSpan={8} className="acc-empty">No purchases present.</td></tr>
              : data!.items.map((e) => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 600 }}>{e.purchaseNo}{e.invoiceNumber && <div className="acc-muted" style={{ fontSize: 12 }}>inv {e.invoiceNumber}</div>}</td>
                  <td>{new Date(e.dateIssued).toLocaleDateString('en-US')}</td>
                  <td>{e.vendorName}</td>
                  <td>{ACC_COUNTRY_LABELS[e.country]}</td>
                  <td>{e.dueDate ? new Date(e.dueDate).toLocaleDateString('en-US') : <span className="acc-muted">—</span>}</td>
                  <td className="acc-col-num">{money(e.total)}</td>
                  <td><span className={`acc-badge ${e.status === 'PAID' ? 'acc-badge-paid' : 'acc-badge-pending'}`}>{ACC_PAYMENT_STATUS_LABELS[e.status]}</span></td>
                  <td className="acc-col-actions"><span className="acc-row-actions">
                    <button className="acc-btn acc-btn-outline acc-btn-sm" onClick={() => setForm({ initial: e })}>Edit</button>
                    <button className="acc-btn acc-btn-ghost acc-btn-sm" onClick={() => setToDelete(e)}>Delete</button>
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

      {form && <PurchaseForm initial={form.initial} onClose={() => setForm(null)} />}
      {toDelete && (
        <ConfirmModal title={`Delete ${toDelete.purchaseNo}?`} message="This permanently removes the purchase and its line items." confirmLabel="Delete" tone="danger"
          busy={del.isPending} onCancel={() => setToDelete(null)} onConfirm={async () => { await del.mutateAsync(toDelete.id); setToDelete(null) }} />
      )}
    </div>
  )
}
