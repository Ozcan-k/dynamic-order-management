import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { ACC_PAYMENT_STATUS_LABELS, ACC_COUNTRY_LABELS } from '@dom/shared'
import { useExpenses, useExpensesStats, useCategories, money, type ExpenseFilters } from '../../api/accounting'
import DateRangePicker from '../../components/accounting/DateRangePicker'

const PAGE_SIZE = 25

// Filters live in the URL query so they survive navigating away to the edit page
// and back (the list remounts fresh, but re-reads the URL). PurchaseForm returns
// here with this exact query string via location.state.listSearch.
function parseFilters(sp: URLSearchParams): ExpenseFilters {
  return {
    page: Number(sp.get('page')) || 1,
    pageSize: PAGE_SIZE,
    status: sp.get('status') || undefined,
    country: sp.get('country') || undefined,
    category: sp.get('category') || undefined,
    subcategory: sp.get('subcategory') || undefined,
    from: sp.get('from') || undefined,
    to: sp.get('to') || undefined,
    search: sp.get('search') || undefined,
  }
}
function toParams(f: ExpenseFilters): Record<string, string> {
  const o: Record<string, string> = {}
  if (f.status) o.status = f.status
  if (f.country) o.country = f.country
  if (f.category) o.category = f.category
  if (f.subcategory) o.subcategory = f.subcategory
  if (f.from) o.from = f.from
  if (f.to) o.to = f.to
  if (f.search) o.search = f.search
  if (f.page && f.page > 1) o.page = String(f.page)
  return o
}

export default function AccPurchases() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = parseFilters(searchParams)
  const setFilters = (f: ExpenseFilters) => setSearchParams(toParams(f), { replace: true })
  const goEdit = (path: string) => navigate(path, { state: { listSearch: location.search } })
  const { data, isLoading } = useExpenses(filters)
  const { data: stats } = useExpensesStats({ from: filters.from, to: filters.to })
  const { data: categories = [] } = useCategories('EXPENSE')

  const subOptions = categories.find((c) => c.name === filters.category)?.subcategories ?? []
  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1

  return (
    <div className="acc-page">
      <div className="acc-head acc-head-row">
        <div><h1 className="acc-title">Expenses</h1><p className="acc-sub">Manage and track all your expenses</p></div>
        <button className="acc-btn acc-btn-success" onClick={() => goEdit('/accounting/expenses/new')}>+ New Expense</button>
      </div>

      <div className="acc-grid acc-grid-4" style={{ marginBottom: 20 }}>
        <div className="acc-stat acc-stat--blue"><div className="acc-stat-label">Total Expenses</div><div className="acc-stat-value">{money(stats?.total ?? 0)}</div><div className="acc-stat-sub">{stats?.count ?? 0} expenses</div></div>
        <div className="acc-stat acc-stat--red"><div className="acc-stat-label">Unpaid</div><div className="acc-stat-value neg">{money(stats?.unpaid ?? 0)}</div><div className="acc-stat-sub">pending</div></div>
        <div className="acc-stat acc-stat--green"><div className="acc-stat-label">Paid</div><div className="acc-stat-value pos">{money(stats?.paid ?? 0)}</div><div className="acc-stat-sub">fully paid</div></div>
        <div className="acc-stat acc-stat--amber"><div className="acc-stat-label">Avg / Expense</div><div className="acc-stat-value warn">{money(stats?.avg ?? 0)}</div><div className="acc-stat-sub">per expense</div></div>
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
                    <button className="acc-btn acc-btn-outline acc-btn-sm" onClick={() => goEdit(`/accounting/expenses/${e.id}/edit`)}>Edit</button>
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

    </div>
  )
}
