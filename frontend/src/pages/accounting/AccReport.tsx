import { useState } from 'react'
import { ACC_PAYMENT_STATUS_LABELS } from '@dom/shared'
import { useReport, money } from '../../api/accounting'

type Tab = 'sales' | 'expenses'

function BarChart({ data, color }: { data: { day: number; value: number }[]; color: string }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="acc-chart">
      {data.map((d) => (
        <div key={d.day} className="acc-chart-col" title={`Day ${d.day}: ${money(d.value)}`}>
          <div className="acc-chart-bar" style={{ height: `${(d.value / max) * 100}%`, background: color }} />
          <div className="acc-chart-x">{d.day}</div>
        </div>
      ))}
    </div>
  )
}

export default function AccReport() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [tab, setTab] = useState<Tab>('sales')
  const { data, isLoading } = useReport(month)

  const bars = (data?.byDay ?? []).map((d) => ({ day: d.day, value: tab === 'sales' ? d.sales : d.expenses }))

  return (
    <div className="acc-page">
      <div className="acc-head acc-head-row">
        <div><h1 className="acc-title">Sales / Expense Report</h1><p className="acc-sub">Monthly performance overview</p></div>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 180 }} />
      </div>

      {/* summary */}
      <div className="acc-grid acc-grid-4" style={{ marginBottom: 18 }}>
        <div className="acc-stat acc-stat--green"><div className="acc-stat-label">Total Sales</div><div className="acc-stat-value pos">{money(data?.totalSales ?? 0)}</div></div>
        <div className="acc-stat acc-stat--red"><div className="acc-stat-label">Total Expenses</div><div className="acc-stat-value neg">{money(data?.totalExpenses ?? 0)}</div></div>
        <div className="acc-stat acc-stat--blue"><div className="acc-stat-label">Net</div><div className={`acc-stat-value ${(data?.net ?? 0) >= 0 ? 'pos' : 'neg'}`}>{money(data?.net ?? 0)}</div></div>
        <div className="acc-stat acc-stat--amber"><div className="acc-stat-label">Records</div><div className="acc-stat-value">{(data?.sales.length ?? 0) + (data?.expenses.length ?? 0)}</div></div>
      </div>

      {/* tabs */}
      <div className="acc-tabs">
        <button className={`acc-tab${tab === 'sales' ? ' active' : ''}`} onClick={() => setTab('sales')}>Sales Report</button>
        <button className={`acc-tab${tab === 'expenses' ? ' active' : ''}`} onClick={() => setTab('expenses')}>Expense Report</button>
      </div>

      {isLoading || !data ? <div className="acc-empty">Loading…</div> : (
        <>
          <div className="acc-card acc-card-pad" style={{ marginBottom: 18 }}>
            <h3 className="acc-card-title">{tab === 'sales' ? 'Daily Sales' : 'Daily Expenses'}</h3>
            <BarChart data={bars} color={tab === 'sales' ? '#16a34a' : '#dc2626'} />
          </div>

          <div className="acc-card acc-card-pad">
            <h3 className="acc-card-title">{tab === 'sales' ? 'Sales this month' : 'Expenses this month'}</h3>
            <div className="acc-table-wrap">
              {tab === 'sales' ? (
                <table>
                  <thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Agent</th><th className="acc-col-num">Amount</th><th>Status</th></tr></thead>
                  <tbody>
                    {data.sales.length === 0 ? <tr><td colSpan={6} className="acc-empty">No sales this month.</td></tr>
                      : data.sales.map((s) => (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 600 }}>{s.invoiceNo}</td>
                          <td>{new Date(s.dateIssued).toLocaleDateString('en-US')}</td>
                          <td>{s.customerName}</td><td>{s.salesAgentName || <span className="acc-muted">—</span>}</td>
                          <td className="acc-col-num">{money(s.total)}</td>
                          <td><span className={`acc-badge ${s.status === 'PAID' ? 'acc-badge-paid' : 'acc-badge-pending'}`}>{ACC_PAYMENT_STATUS_LABELS[s.status]}</span></td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              ) : (
                <table>
                  <thead><tr><th>Expense</th><th>Date</th><th>Vendor</th><th className="acc-col-num">Amount</th><th>Status</th></tr></thead>
                  <tbody>
                    {data.expenses.length === 0 ? <tr><td colSpan={5} className="acc-empty">No expenses this month.</td></tr>
                      : data.expenses.map((e) => (
                        <tr key={e.id}>
                          <td style={{ fontWeight: 600 }}>{e.purchaseNo}</td>
                          <td>{new Date(e.dateIssued).toLocaleDateString('en-US')}</td>
                          <td>{e.vendorName}</td>
                          <td className="acc-col-num">{money(e.total)}</td>
                          <td><span className={`acc-badge ${e.status === 'PAID' ? 'acc-badge-paid' : 'acc-badge-pending'}`}>{ACC_PAYMENT_STATUS_LABELS[e.status]}</span></td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
