import { Link } from 'react-router-dom'
import { useAccDashboard, money } from '../../api/accounting'

export default function AccDashboard() {
  const { data, isLoading } = useAccDashboard()

  return (
    <div className="acc-page">
      <div className="acc-head">
        <h1 className="acc-title">Accounting Dashboard</h1>
        <p className="acc-sub">Overview of sales, expenses and receivables</p>
      </div>

      {isLoading || !data ? (
        <div className="acc-empty">Loading…</div>
      ) : (
        <>
          <div className="acc-grid acc-grid-4" style={{ marginBottom: 24 }}>
            <div className="acc-stat"><div className="acc-stat-label">Total Sales</div><div className="acc-stat-value pos">{money(data.totalSales)}</div></div>
            <div className="acc-stat"><div className="acc-stat-label">Total Expenses</div><div className="acc-stat-value neg">{money(data.totalExpenses)}</div></div>
            <div className="acc-stat"><div className="acc-stat-label">Net</div><div className={`acc-stat-value ${data.net >= 0 ? 'pos' : 'neg'}`}>{money(data.net)}</div></div>
            <div className="acc-stat"><div className="acc-stat-label">Pending Receivables</div><div className="acc-stat-value warn">{money(data.pendingReceivables)}</div></div>
          </div>

          <div className="acc-grid acc-grid-2">
            <div className="acc-card acc-card-pad">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 className="acc-card-title" style={{ margin: 0 }}>Recent Sales</h3>
                <Link className="acc-btn acc-btn-ghost acc-btn-sm" to="/accounting/sales">View all</Link>
              </div>
              {data.recentSales.length === 0 ? <p className="acc-muted">No sales yet.</p> : (
                <table><tbody>
                  {data.recentSales.map((s) => (
                    <tr key={s.id}><td>{s.product}<div className="acc-muted" style={{ fontSize: 12 }}>{s.customerName}</div></td><td className="acc-col-num">{money(s.total)}</td></tr>
                  ))}
                </tbody></table>
              )}
            </div>
            <div className="acc-card acc-card-pad">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 className="acc-card-title" style={{ margin: 0 }}>Recent Expenses</h3>
                <Link className="acc-btn acc-btn-ghost acc-btn-sm" to="/accounting/expenses">View all</Link>
              </div>
              {data.recentExpenses.length === 0 ? <p className="acc-muted">No expenses yet.</p> : (
                <table><tbody>
                  {data.recentExpenses.map((e) => (
                    <tr key={e.id}><td>{e.itemName}<div className="acc-muted" style={{ fontSize: 12 }}>{e.category}</div></td><td className="acc-col-num">{money(e.total)}</td></tr>
                  ))}
                </tbody></table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
