import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { accBalance, accManilaToday, type AccSale } from '@dom/shared'
import { useSales, useSalesStats, downloadInvoicePdf, fetchAllSales, money, type SaleFilters } from '../../api/accounting'
import ExportButtons from '../../components/accounting/ExportButtons'
import { exportCsv, exportName, exportXlsx } from '../../components/accounting/tableExport'
import { saleColumns } from '../../components/accounting/exportColumns'
import DateRangePicker from '../../components/accounting/DateRangePicker'
import AccIcon from '../../components/accounting/AccIcon'
import { DueCell, PaidBar, StatusPill } from '../../components/accounting/paymentBits'

// Tabs = payment status (UNPAID / PARTIAL / PAID) plus "Late", which is a filter across
// unpaid + partial invoices past their due date — lateness is never a status of its own.
type Tab = 'all' | 'UNPAID' | 'PARTIAL' | 'PAID' | 'late'
const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'UNPAID', label: 'Unpaid' }, { key: 'PARTIAL', label: 'Partial' },
  { key: 'PAID', label: 'Paid' }, { key: 'late', label: 'Late' },
]
const tabOf = (f: SaleFilters): Tab => (f.late ? 'late' : (f.status as Tab) || 'all')
const fmtDay = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export default function AccInvoices() {
  const navigate = useNavigate()
  // Seed filters from the URL query so a Restore from the Recycle Bin can deep-link
  // straight to the restored invoice's month (?from=&to=). No params → same defaults.
  const [sp] = useSearchParams()
  const [filters, setFilters] = useState<SaleFilters>(() => ({
    page: 1, pageSize: 25,
    from: sp.get('from') || undefined,
    to: sp.get('to') || undefined,
    status: ['PAID', 'UNPAID', 'PARTIAL'].includes(sp.get('status') || '') ? sp.get('status')! : undefined,
    late: sp.get('late') === '1' || undefined,
    search: sp.get('search') || undefined,
  }))
  const { data, isLoading, isFetching } = useSales(filters)
  const { data: stats } = useSalesStats({ from: filters.from, to: filters.to })
  const today = accManilaToday()
  const tab = tabOf(filters)
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  const count = (t: Tab) => !stats ? null
    : t === 'all' ? stats.count : t === 'late' ? stats.lateCount : stats.byStatus[t]
  const setTab = (t: Tab) => setFilters({ ...filters, page: 1, status: t === 'all' || t === 'late' ? undefined : t, late: t === 'late' || undefined })
  const open = (s: AccSale) => navigate(`/accounting/sales/${s.id}`)

  return (
    <div className="acc-page acc-v3">
      <div className="acc-head acc-head-row">
        <div><h1 className="acc-title">Sales</h1><p className="acc-sub">Invoices, what has been collected, and what is still owed</p></div>
        <div className="acc-actions">
          <ExportButtons onExport={async (format) => {
            const rows = await fetchAllSales(filters)
            const name = exportName('Sales', filters.from, filters.to)
            const title = `Sales · ${filters.from || filters.to ? `${filters.from || 'start'} to ${filters.to || 'today'}` : 'all dates'}${tab !== 'all' ? ` · ${TABS.find((t) => t.key === tab)?.label}` : ''}`
            if (format === 'csv') exportCsv(`${name}.csv`, saleColumns(), rows)
            else exportXlsx(`${name}.xlsx`, 'Sales', title, saleColumns(), rows)
          }} />
          <button className="acc-btn acc-btn-primary" onClick={() => navigate('/accounting/sales/new')}><AccIcon name="plus" />New Invoice</button>
        </div>
      </div>

      <div className="acc-money" aria-label="Summary for the selected dates">
        <div><span>Invoiced</span><b>{money(stats?.invoiced ?? 0)}</b><small>{stats?.count ?? 0} invoice{stats?.count === 1 ? '' : 's'}</small></div>
        <div><span><i className="acc-dot acc-dot--collected" />Collected</span><b>{money(stats?.collected ?? 0)}</b>
          <small>{stats && stats.invoiced > 0 ? `${Math.round((stats.collected / stats.invoiced) * 100)}% of invoiced` : '—'}</small></div>
        <div className="is-warn"><span>Still owed</span><b>{money(stats?.owed ?? 0)}</b><small>{stats?.openCount ?? 0} open invoice{stats?.openCount === 1 ? '' : 's'}</small></div>
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
          <div className="acc-field acc-tools-search"><label htmlFor="acc-sales-search">Search</label>
            <input id="acc-sales-search" placeholder="Invoice no. or customer…" value={filters.search || ''} autoComplete="off"
              onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })} /></div>
          <div className="acc-field"><label>Date</label>
            <DateRangePicker value={{ from: filters.from || '', to: filters.to || '' }} onChange={(r) => setFilters({ ...filters, from: r.from, to: r.to, page: 1 })} />
          </div>
        </div>

        <div className="acc-scroll-x acc-only-wide" aria-busy={isFetching}>
          <table className="acc-sales-table">
            <thead><tr>
              <th>Invoice</th><th>Customer</th><th>Issued</th><th>Due</th>
              <th className="acc-col-num">Total</th><th className="acc-col-num">Collected</th><th className="acc-col-num">Balance</th>
              <th>Status</th><th className="acc-col-actions"><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={9} className="acc-empty">Loading…</td></tr>
                : (data?.items.length ?? 0) === 0 ? <tr><td colSpan={9} className="acc-empty">{emptyText(tab, !!filters.search)}</td></tr>
                : data!.items.map((s) => {
                  const bal = accBalance(s.total, s.paidTotal)
                  const pct = s.total > 0 ? Math.round((s.paidTotal / s.total) * 100) : 100
                  return (
                    <tr key={s.id} className="is-link" onClick={() => open(s)}>
                      <td>
                        <Link className="acc-inv-no" to={`/accounting/sales/${s.id}`} onClick={(e) => e.stopPropagation()}>{s.invoiceNo}</Link>
                        {s.note?.trim() && <span className="acc-note-dot" title={s.note} aria-label="Has a note" />}
                      </td>
                      <td className="acc-who"><b>{s.customerName}</b><span>{[s.storeName, s.salesAgentName].filter(Boolean).join(' · ') || '—'}</span></td>
                      <td className="acc-nowrap">{fmtDay(s.dateIssued)}</td>
                      <td><DueCell dueDate={s.dueDate} status={s.status} today={today} /></td>
                      <td className="acc-col-num">{money(s.total)}</td>
                      <td className="acc-col-num"><div className="acc-prog"><PaidBar total={s.total} paid={s.paidTotal} /><small>{money(s.paidTotal)} · {pct}%</small></div></td>
                      <td className="acc-col-num">{bal > 0 ? <b>{money(bal)}</b> : <span className="acc-muted">{money(0)}</span>}</td>
                      <td><StatusPill status={s.status} /></td>
                      <td className="acc-col-actions">
                        <button className="acc-btn acc-btn-ghost acc-btn-sm" title="Download PDF" aria-label={`Download ${s.invoiceNo} as PDF`}
                          onClick={(e) => { e.stopPropagation(); void downloadInvoicePdf(s.id, s.invoiceNo) }}><AccIcon name="download" /></button>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>

        {/* Phone: the same rows as cards — a 9-column table does not fit 390px. */}
        <ul className="acc-cards acc-only-narrow">
          {isLoading ? <li className="acc-empty">Loading…</li>
            : (data?.items.length ?? 0) === 0 ? <li className="acc-empty">{emptyText(tab, !!filters.search)}</li>
            : data!.items.map((s) => (
              <li key={s.id}>
                <Link to={`/accounting/sales/${s.id}`} className="acc-mcard">
                  <span className="acc-mcard-row"><span className="acc-inv-no">{s.invoiceNo}</span><StatusPill status={s.status} /></span>
                  <span className="acc-mcard-row"><span>{s.customerName}</span><b>{money(accBalance(s.total, s.paidTotal))}</b></span>
                  <PaidBar total={s.total} paid={s.paidTotal} wide />
                  <span className="acc-mcard-row"><DueCell dueDate={s.dueDate} status={s.status} today={today} /><small className="acc-muted">of {money(s.total)}</small></span>
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
  if (searching) return 'No invoice matches this search in the selected dates.'
  switch (tab) {
    case 'UNPAID': return 'No unpaid invoices in these dates.'
    case 'PARTIAL': return 'No part-paid invoices in these dates.'
    case 'PAID': return 'No fully paid invoices in these dates.'
    case 'late': return 'Nothing is late. Every invoice in these dates is paid or not yet due.'
    default: return 'No invoices in these dates yet. Create one with New Invoice.'
  }
}
