import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ACC_PAYMENT_STATUS_LABELS, ACC_COUNTRY_LABELS, type AccExpense } from '@dom/shared'
import { useExpenses, useExpensesStats, useDeleteExpense, useCategories, money, type ExpenseFilters } from '../../api/accounting'
import ConfirmModal from '../../components/shared/ConfirmModal'
import DateRangePicker from '../../components/accounting/DateRangePicker'

export default function AccPurchases() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState<ExpenseFilters>({ page: 1, pageSize: 25 })
  const { data, isLoading } = useExpenses(filters)
  const { data: stats } = useExpensesStats()
  const { data: categories = [] } = useCategories('EXPENSE')
  const del = useDeleteExpense()
  const [toDelete, setToDelete] = useState<AccExpense | null>(null)

  const subOptions = categories.find((c) => c.name === filters.category)?.subcategories ?? []
  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1

  return (
    <div className="acc-page">
      <div className="acc-head acc-head-row">
        <div><h1 className="acc-title">Expenses</h1><p className="acc-sub">Manage and track all your expenses</p></div>
        <button className="acc-btn acc-btn-success" onClick={() => navigate('/accounting/expenses/new')}>+ New Expense</button>
      </div>

      <div className="acc-grid acc-grid-4" style={{ marginBottom: 20 }}>
        <div className="acc-stat acc-stat--blue"><div className="acc-stat-label">Total Expenses</div><div className="acc-stat-value">{money(stats?.total ?? 0)}</div><div className="acc-stat-sub">{stats?.count ?? 0} expenses</div></div>
        <div className="acc-stat acc-stat--red"><div className="acc-stat-label">Unpaid</div><div className="acc-stat-value neg">{money(stats?.unpaid ?? 0)}</div><div className="acc-stat-sub">pending</div></div>
        <div className="acc-stat acc-stat--green"><div className="acc-stat-label">Paid</div><div className="acc-stat-value pos">{money(stats?.paid ?? 0)}</div><div className="acc-stat-sub">fully paid</div></div>
        <div className="acc-stat acc-stat--amber"><div className="acc-stat-label">This Month</div><div className="acc-stat-value warn">{money(stats?.thisMonth ?? 0)}</div><div className="acc-stat-sub">expenses</div></div>
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
        <div className="acc-field"><label>Category</label>
          <select value={filters.category || ''} onChange={(e) => setFilters({ ...filters, category: e.target.value, subcategory: '', page: 1 })}>
            <option value="">All</option>{categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select></div>
        <div className="acc-field"><label>Subcategory</label>
          <select value={filters.subcategory || ''} disabled={!filters.category} onChange={(e) => setFilters({ ...filters, subcategory: e.target.value, page: 1 })}>
            <option value="">{filters.category ? 'All' : '—'}</option>{subOptions.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select></div>
        <div className="acc-field"><label>Date</label>
          <DateRangePicker value={{ from: filters.from || '', to: filters.to || '' }} onChange={(r) => setFilters({ ...filters, from: r.from, to: r.to, page: 1 })} />
        </div>
        <div className="acc-field" style={{ flex: 1, minWidth: 160 }}><label>Search</label><input placeholder="Expense no. or vendor…" value={filters.search || ''} onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })} /></div>
      </div>

      <div className="acc-table-wrap">
        <table>
          <thead><tr>
            <th>Expense Number</th><th>Record Date</th><th>Vendor Name</th><th>Country</th><th>Due Date</th>
            <th className="acc-col-num">Amount</th><th>Status</th><th className="acc-col-actions">Actions</th>
          </tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={8} className="acc-empty">Loading…</td></tr>
              : (data?.items.length ?? 0) === 0 ? <tr><td colSpan={8} className="acc-empty">No expenses present.</td></tr>
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
                    <button className="acc-btn acc-btn-outline acc-btn-sm" onClick={() => navigate(`/accounting/expenses/${e.id}/edit`)}>Edit</button>
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

      {toDelete && (
        <ConfirmModal title={`Delete ${toDelete.purchaseNo}?`} message="This permanently removes the expense and its line items." confirmLabel="Delete" tone="danger"
          busy={del.isPending} onCancel={() => setToDelete(null)} onConfirm={async () => { await del.mutateAsync(toDelete.id); setToDelete(null) }} />
      )}
    </div>
  )
}
