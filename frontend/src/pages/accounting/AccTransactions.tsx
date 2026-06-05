import { useState } from 'react'
import { useSalesLedger, useExpenseLedger, money } from '../../api/accounting'
import DateRangePicker, { type DateRange } from '../../components/accounting/DateRangePicker'

type Tab = 'sales' | 'expenses'

// Default to the current month so the page isn't an unbounded full-history dump.
function thisMonth(): DateRange {
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const now = new Date()
  return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)) }
}

function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-US') }
function pct(n: number) { return n ? `${n}%` : '—' }

export default function AccTransactions() {
  const [tab, setTab] = useState<Tab>('sales')
  const [range, setRange] = useState<DateRange>(() => thisMonth())

  const salesQ = useSalesLedger(tab === 'sales' ? range : { from: '', to: '' })
  const expensesQ = useExpenseLedger(tab === 'expenses' ? range : { from: '', to: '' })

  const sales = salesQ.data
  const expenses = expensesQ.data
  const isLoading = tab === 'sales' ? salesQ.isLoading : expensesQ.isLoading

  return (
    <div className="acc-page">
      <div className="acc-head acc-head-row">
        <div><h1 className="acc-title">Transactions</h1><p className="acc-sub">Every sale &amp; expense line item, one row each</p></div>
      </div>

      {/* Tabs */}
      <div className="acc-seg" style={{ marginBottom: 14 }}>
        <button type="button" className={`acc-seg-btn${tab === 'sales' ? ' active' : ''}`} onClick={() => setTab('sales')}>Sales</button>
        <button type="button" className={`acc-seg-btn${tab === 'expenses' ? ' active' : ''}`} onClick={() => setTab('expenses')}>Expenses</button>
      </div>

      <div className="acc-filter-bar">
        <div className="acc-field"><label>Date</label>
          <DateRangePicker value={range} onChange={setRange} />
        </div>
      </div>

      <div className="acc-table-wrap">
        {tab === 'sales' ? (
          <table>
            <thead><tr>
              <th>Date</th><th>Invoice #</th><th>Customer</th><th>Store</th><th>Item</th><th>Description</th>
              <th className="acc-col-num">Qty</th><th className="acc-col-num">Unit</th><th className="acc-col-num">Disc%</th><th className="acc-col-num">Tax%</th><th className="acc-col-num">Line Total</th>
            </tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={11} className="acc-empty">Loading…</td></tr>
                : (sales?.rows.length ?? 0) === 0 ? <tr><td colSpan={11} className="acc-empty">No sales in this range.</td></tr>
                : sales!.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtDate(r.dateIssued)}</td>
                    <td style={{ fontWeight: 600 }}>{r.invoiceNo}</td>
                    <td>{r.customerName}</td>
                    <td>{r.storeName || <span className="acc-muted">—</span>}</td>
                    <td>{r.itemName}{r.categoryName && <div className="acc-muted" style={{ fontSize: 12 }}>{r.categoryName}</div>}</td>
                    <td>{r.description || <span className="acc-muted">—</span>}</td>
                    <td className="acc-col-num">{r.quantity}</td>
                    <td className="acc-col-num">{money(r.unitCost)}</td>
                    <td className="acc-col-num">{pct(r.discountPct)}</td>
                    <td className="acc-col-num">{pct(r.taxPct)}</td>
                    <td className="acc-col-num" style={{ fontWeight: 600 }}>{money(r.lineTotal)}</td>
                  </tr>
                ))}
            </tbody>
            {sales && sales.rows.length > 0 && (
              <tfoot><tr>
                <td colSpan={10} style={{ textAlign: 'right', fontWeight: 700 }}>Total ({sales.count} lines)</td>
                <td className="acc-col-num" style={{ fontWeight: 700 }}>{money(sales.total)}</td>
              </tr></tfoot>
            )}
          </table>
        ) : (
          <table>
            <thead><tr>
              <th>Date</th><th>Expense #</th><th>Vendor</th><th>Category</th><th>Subcategory</th><th>Item</th><th>Description</th>
              <th className="acc-col-num">Qty</th><th className="acc-col-num">Unit</th><th className="acc-col-num">Line Total</th>
            </tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={10} className="acc-empty">Loading…</td></tr>
                : (expenses?.rows.length ?? 0) === 0 ? <tr><td colSpan={10} className="acc-empty">No expenses in this range.</td></tr>
                : expenses!.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtDate(r.dateIssued)}</td>
                    <td style={{ fontWeight: 600 }}>{r.purchaseNo}</td>
                    <td>{r.vendorName}</td>
                    <td>{r.categoryName || <span className="acc-muted">—</span>}</td>
                    <td>{r.subcategoryName || <span className="acc-muted">—</span>}</td>
                    <td>{r.itemName}</td>
                    <td>{r.description || <span className="acc-muted">—</span>}</td>
                    <td className="acc-col-num">{r.quantity}</td>
                    <td className="acc-col-num">{money(r.unitCost)}</td>
                    <td className="acc-col-num" style={{ fontWeight: 600 }}>{money(r.lineTotal)}</td>
                  </tr>
                ))}
            </tbody>
            {expenses && expenses.rows.length > 0 && (
              <tfoot><tr>
                <td colSpan={9} style={{ textAlign: 'right', fontWeight: 700 }}>Total ({expenses.count} lines)</td>
                <td className="acc-col-num" style={{ fontWeight: 700 }}>{money(expenses.total)}</td>
              </tr></tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  )
}
