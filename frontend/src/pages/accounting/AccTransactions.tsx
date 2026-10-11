import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ACC_PAYMENT_METHOD_LABELS } from '@dom/shared'
import { useSalesLedger, useExpenseLedger, usePaymentsLedger, money } from '../../api/accounting'
import DateRangePicker, { type DateRange } from '../../components/accounting/DateRangePicker'

type Tab = 'sales' | 'payments' | 'expenses' | 'paymentsOut'

// Default to the current month so the page isn't an unbounded full-history dump.
function thisMonth(): DateRange {
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const now = new Date()
  return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)) }
}

// Dates are calendar days stored as UTC midnight — format them in UTC, or a browser west
// of Greenwich shows the previous day.
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-US', { timeZone: 'UTC' }) }
function pct(n: number) { return n ? `${n}%` : '—' }

export default function AccTransactions() {
  const [tab, setTab] = useState<Tab>('sales')
  const [range, setRange] = useState<DateRange>(() => thisMonth())

  const salesQ = useSalesLedger(tab === 'sales' ? range : { from: '', to: '' })
  const expensesQ = useExpenseLedger(tab === 'expenses' ? range : { from: '', to: '' })
  // Payments are filtered by the day the money came in, not the invoice date.
  const paymentsInQ = usePaymentsLedger(tab === 'payments' ? range : { from: '', to: '' }, 'sale')
  const paymentsOutQ = usePaymentsLedger(tab === 'paymentsOut' ? range : { from: '', to: '' }, 'expense')
  const paymentsQ = tab === 'paymentsOut' ? paymentsOutQ : paymentsInQ
  const payments = paymentsQ.data

  const sales = salesQ.data
  const expenses = expensesQ.data
  const isLoading = tab === 'sales' ? salesQ.isLoading : tab === 'expenses' ? expensesQ.isLoading : paymentsQ.isLoading

  return (
    <div className="acc-page">
      <div className="acc-head acc-head-row">
        <div><h1 className="acc-title">Transactions</h1><p className="acc-sub">Every sale &amp; expense line item, and every payment received, one row each</p></div>
      </div>

      {/* Tabs */}
      <div className="acc-seg" style={{ marginBottom: 14 }}>
        <button type="button" className={`acc-seg-btn${tab === 'sales' ? ' active' : ''}`} onClick={() => setTab('sales')}>Sales</button>
        <button type="button" className={`acc-seg-btn${tab === 'payments' ? ' active' : ''}`} onClick={() => setTab('payments')}>Payments received</button>
        <button type="button" className={`acc-seg-btn${tab === 'paymentsOut' ? ' active' : ''}`} onClick={() => setTab('paymentsOut')}>Payments made</button>
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
        ) : tab === 'payments' || tab === 'paymentsOut' ? (
          <table>
            <thead><tr>
              <th>Date paid</th><th>{tab === 'payments' ? 'Invoice #' : 'Expense #'}</th><th>{tab === 'payments' ? 'Customer' : 'Vendor'}</th>
              <th>Method</th><th>Reference</th><th>{tab === 'payments' ? 'Received by' : 'Paid by'}</th><th className="acc-col-num">Amount</th>
            </tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={7} className="acc-empty">Loading…</td></tr>
                : (payments?.rows.length ?? 0) === 0 ? <tr><td colSpan={7} className="acc-empty">{tab === 'payments' ? 'No payments received in this range.' : 'No payments made in this range.'}</td></tr>
                : payments!.rows.map((r) => (
                  <tr key={r.id} className={r.voidedAt ? 'acc-row-void' : ''}>
                    <td>{fmtDate(r.paidOn)}</td>
                    <td style={{ fontWeight: 600 }}><Link to={`/accounting/${r.kind === 'sale' ? 'sales' : 'expenses'}/${r.recordId}`}>{r.docNo}</Link></td>
                    <td>{r.partyName}</td>
                    <td>{r.method ? ACC_PAYMENT_METHOD_LABELS[r.method] : <span className="acc-muted">Not recorded</span>}
                      {r.voidedAt && <span className="acc-tag">Voided</span>}</td>
                    <td>{r.referenceNumber || <span className="acc-muted">—</span>}</td>
                    <td>{r.personName || <span className="acc-muted">—</span>}</td>
                    <td className="acc-col-num" style={{ fontWeight: 600 }}>{money(r.amount)}</td>
                  </tr>
                ))}
            </tbody>
            {payments && payments.rows.length > 0 && (
              <tfoot><tr>
                <td colSpan={6} style={{ textAlign: 'right', fontWeight: 700 }}>Total {tab === 'payments' ? 'received' : 'paid'} ({payments.count} payment{payments.count === 1 ? '' : 's'}, voided not counted)</td>
                <td className="acc-col-num" style={{ fontWeight: 700 }}>{money(payments.total)}</td>
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
