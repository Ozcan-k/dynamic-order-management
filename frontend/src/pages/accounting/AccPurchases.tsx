import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { ACC_COUNTRY_LABELS, accBalance, accManilaToday } from '@dom/shared'
import { useExpenses, useExpensesStats, useCategories, money, type ExpenseFilters } from '../../api/accounting'
import DateRangePicker from '../../components/accounting/DateRangePicker'
import AccIcon from '../../components/accounting/AccIcon'
import { DueCell, PaidBar, StatusPill } from '../../components/accounting/paymentBits'

const PAGE_SIZE = 25

// Filters live in the URL query so they survive navigating away to an expense and back
// (the list remounts fresh, but re-reads the URL). PurchaseForm / ExpenseDetail return
// here with this exact query string via location.state.listSearch.
function parseFilters(sp: URLSearchParams): ExpenseFilters {
  const status = sp.get('status')
  return {
    page: Number(sp.get('page')) || 1,
    pageSize: PAGE_SIZE,
    status: status === 'PAID' || status === 'UNPAID' || status === 'PARTIAL' ? status : undefined,
    late: sp.get('late') === '1' || undefined,
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
  if (f.late) o.late = '1'
  if (f.country) o.country = f.country
  if (f.category) o.category = f.category
  if (f.subcategory) o.subcategory = f.subcategory
  if (f.from) o.from = f.from
  if (f.to) o.to = f.to
  if (f.search) o.search = f.search
  if (f.page && f.page > 1) o.page = String(f.page)
  return o
}

// Same tabs as Sales: payment status + "Late" (a filter across unpaid + part-paid).
type Tab = 'all' | 'UNPAID' | 'PARTIAL' | 'PAID' | 'late'
const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'UNPAID', label: 'Unpaid' }, { key: 'PARTIAL', label: 'Partial' },
  { key: 'PAID', label: 'Paid' }, { key: 'late', label: 'Late' },
]
const fmtDay = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export default function AccPurchases() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = parseFilters(searchParams)
  const setFilters = (f: ExpenseFilters) => setSearchParams(toParams(f), { replace: true })
  const go = (path: string) => navigate(path, { state: { listSearch: location.search } })
  const { data, isLoading, isFetching } = useExpenses(filters)
  const { data: stats } = useExpensesStats({ from: filters.from, to: filters.to })
  const { data: categories = [] } = useCategories('EXPENSE')
  const today = accManilaToday()

  const subOptions = categories.find((c) => c.name === filters.category)?.subcategories ?? []
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const tab: Tab = filters.late ? 'late' : (filters.status as Tab) || 'all'
  const count = (t: Tab) => !stats ? null : t === 'all' ? stats.count : t === 'late' ? stats.lateCount : stats.byStatus[t]
  const setTab = (t: Tab) => setFilters({ ...filters, page: 1, status: t === 'all' || t === 'late' ? undefined : t, late: t === 'late' || undefined })

  return (
    <div className="acc-page acc-v3">
      <div className="acc-head acc-head-row">
        <div><h1 className="acc-title">Expenses</h1><p className="acc-sub">Bills, what has been paid, and what is still owed to vendors</p></div>
        <button className="acc-btn acc-btn-primary" onClick={() => go('/accounting/expenses/new')}><AccIcon name="plus" />New Expense</button>
      </div>

      <div className="acc-money" aria-label="Summary for the selected dates">
        <div><span>Billed</span><b>{money(stats?.invoiced ?? 0)}</b><small>{stats?.count ?? 0} expense{stats?.count === 1 ? '' : 's'}</small></div>
        <div><span><i className="acc-dot acc-dot--collected" />Paid</span><b>{money(stats?.collected ?? 0)}</b>
          <small>{stats && stats.invoiced > 0 ? `${Math.round((stats.collected / stats.invoiced) * 100)}% of billed` : '—'}</small></div>
        <div className={stats && stats.owed > 0 ? 'is-warn' : ''}><span>Still to pay</span><b>{money(stats?.owed ?? 0)}</b><small>{stats?.openCount ?? 0} open expense{stats?.openCount === 1 ? '' : 's'}</small></div>
        <div className={stats && stats.late > 0 ? 'is-bad' : ''}><span>Late</span><b>{money(stats?.late ?? 0)}</b><small>{stats?.lateCount ?? 0} past due date</small></div>
      </div>

      <div className="acc-card acc-list-card">
        <div className="acc-tabs-v3" role="tablist" aria-label="Payment status">
          {TABS.map((t) => {
            const n = count(t.key)
            return (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
                className={`acc-tab-v3${t.key === 'late' ? ' is-flag' : ''}`} onClick={() => setTab(t.key)}>
                {t.label}{n !== null && <span className="n">{n}</span>}
              </button>
            )
          })}
        </div>
        <div className="acc-tools">
          <div className="acc-field acc-tools-search"><label htmlFor="acc-exp-search">Search</label>
            <input id="acc-exp-search" placeholder="Expense no., vendor or supplier invoice…" value={filters.search || ''} autoComplete="off"
              onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })} /></div>
          <div className="acc-field"><label htmlFor="acc-exp-country">Country</label>
            <select id="acc-exp-country" value={filters.country || ''} onChange={(e) => setFilters({ ...filters, country: e.target.value || undefined, page: 1 })}>
              <option value="">All</option>{Object.entries(ACC_COUNTRY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></div>
          <div className="acc-field"><label htmlFor="acc-exp-cat">Category</label>
            <select id="acc-exp-cat" value={filters.category || ''} onChange={(e) => setFilters({ ...filters, category: e.target.value || undefined, subcategory: undefined, page: 1 })}>
              <option value="">All</option>{categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select></div>
          <div className="acc-field"><label htmlFor="acc-exp-sub">Subcategory</label>
            <select id="acc-exp-sub" value={filters.subcategory || ''} disabled={!filters.category} onChange={(e) => setFilters({ ...filters, subcategory: e.target.value || undefined, page: 1 })}>
              <option value="">{filters.category ? 'All' : '—'}</option>{subOptions.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select></div>
          <div className="acc-field"><label>Date</label>
            <DateRangePicker value={{ from: filters.from || '', to: filters.to || '' }} onChange={(r) => setFilters({ ...filters, from: r.from, to: r.to, page: 1 })} />
          </div>
        </div>

        <div className="acc-scroll-x acc-only-wide" aria-busy={isFetching}>
          <table className="acc-sales-table">
            <thead><tr>
              <th>Expense</th><th>Vendor</th><th>Issued</th><th>Due</th>
              <th className="acc-col-num">Total</th><th className="acc-col-num">Paid</th><th className="acc-col-num">Still to pay</th><th>Status</th>
            </tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={8} className="acc-empty">Loading…</td></tr>
                : (data?.items.length ?? 0) === 0 ? <tr><td colSpan={8} className="acc-empty">{emptyText(tab, !!filters.search)}</td></tr>
                : data!.items.map((e) => {
                  const bal = accBalance(e.total, e.paidTotal)
                  const pct = e.total > 0 ? Math.round((e.paidTotal / e.total) * 100) : 100
                  return (
                    <tr key={e.id} className="is-link" onClick={() => go(`/accounting/expenses/${e.id}`)}>
                      <td><Link className="acc-inv-no" to={`/accounting/expenses/${e.id}`} state={{ listSearch: location.search }} onClick={(ev) => ev.stopPropagation()}>{e.purchaseNo}</Link>
                        {e.invoiceNumber && <div className="acc-muted" style={{ fontSize: 12 }}>inv {e.invoiceNumber}</div>}</td>
                      <td className="acc-who"><b>{e.vendorName}</b><span>{ACC_COUNTRY_LABELS[e.country]}</span></td>
                      <td className="acc-nowrap">{fmtDay(e.dateIssued)}</td>
                      <td><DueCell dueDate={e.dueDate} status={e.status} today={today} /></td>
                      <td className="acc-col-num">{money(e.total)}</td>
                      <td className="acc-col-num"><div className="acc-prog"><PaidBar total={e.total} paid={e.paidTotal} /><small>{money(e.paidTotal)} · {pct}%</small></div></td>
                      <td className="acc-col-num">{bal > 0 ? <b>{money(bal)}</b> : <span className="acc-muted">{money(0)}</span>}</td>
                      <td><StatusPill status={e.status} /></td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>

        <ul className="acc-cards acc-only-narrow">
          {isLoading ? <li className="acc-empty">Loading…</li>
            : (data?.items.length ?? 0) === 0 ? <li className="acc-empty">{emptyText(tab, !!filters.search)}</li>
            : data!.items.map((e) => (
              <li key={e.id}>
                <Link to={`/accounting/expenses/${e.id}`} state={{ listSearch: location.search }} className="acc-mcard">
                  <span className="acc-mcard-row"><span className="acc-inv-no">{e.purchaseNo}</span><StatusPill status={e.status} /></span>
                  <span className="acc-mcard-row"><span>{e.vendorName}</span><b>{money(accBalance(e.total, e.paidTotal))}</b></span>
                  <PaidBar total={e.total} paid={e.paidTotal} wide />
                  <span className="acc-mcard-row"><DueCell dueDate={e.dueDate} status={e.status} today={today} /><small className="acc-muted">of {money(e.total)}</small></span>
                </Link>
              </li>
            ))}
        </ul>
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

function emptyText(tab: Tab, searching: boolean): string {
  if (searching) return 'No expense matches this search in the selected dates.'
  switch (tab) {
    case 'UNPAID': return 'No unpaid expenses in these dates.'
    case 'PARTIAL': return 'No part-paid expenses in these dates.'
    case 'PAID': return 'No fully paid expenses in these dates.'
    case 'late': return 'Nothing is late. Every expense in these dates is paid or not yet due.'
    default: return 'No expenses in these dates yet. Add one with New Expense.'
  }
}
