// Vendor account (v2.103.0): the expense-side twin of CustomerStatement — what we still owe
// the vendor, how late, and every expense and payment on one timeline with a running balance.
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ACC_AGING_LABELS } from '@dom/shared'
import { downloadVendorStatementPdf, money, useVendorStatement } from '../../api/accounting'
import DateRangePicker, { type DateRange } from '../../components/accounting/DateRangePicker'
import AccIcon from '../../components/accounting/AccIcon'
import { AGING_COLOR } from '../../components/accounting/paymentUtils'

const fmtDay = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export default function VendorStatement() {
  const { id } = useParams()
  const [range, setRange] = useState<DateRange>({ from: '', to: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const { data: st, isLoading, isFetching } = useVendorStatement(id, { from: range.from, to: range.to })

  if (isLoading) return <div className="acc-page acc-v3"><div className="acc-empty">Loading…</div></div>
  if (!st) return (
    <div className="acc-page acc-v3"><div className="acc-empty">
      This vendor was not found.
      <div style={{ marginTop: 12 }}><Link className="acc-btn acc-btn-outline" to="/accounting/contacts?tab=vendors">Back to Vendors</Link></div>
    </div></div>
  )

  const v = st.vendor
  const owedLate = st.aging.filter((a) => a.bucket !== 'notDue').reduce((t, a) => t + a.amount, 0)
  const inPeriod = range.from || range.to ? 'in period' : 'all time'

  return (
    <div className="acc-page acc-v3">
      <Link to="/accounting/contacts?tab=vendors" className="acc-crumb"><AccIcon name="back" size={14} />Vendors</Link>
      <div className="acc-head acc-head-row">
        <div>
          <h1 className="acc-title">{v.name}</h1>
          <p className="acc-sub">{['Vendor', v.contactNumber, v.email].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="acc-actions">
          <Link className="acc-btn acc-btn-outline" to={`/accounting/expenses?search=${encodeURIComponent(v.name)}`}>Expenses</Link>
          <button type="button" className="acc-btn acc-btn-primary" disabled={busy} onClick={async () => {
            setBusy(true); setErr('')
            try { await downloadVendorStatementPdf(v.id, v.name, { from: range.from, to: range.to }) }
            catch { setErr('The statement PDF could not be created. Try again.') }
            finally { setBusy(false) }
          }}><AccIcon name="download" />{busy ? 'Preparing…' : 'Statement PDF'}</button>
        </div>
      </div>
      {err && <p className="acc-error" role="alert" style={{ marginTop: -10 }}>{err}</p>}

      <div className="acc-money">
        <div className={st.owedNow > 0 ? 'is-warn' : ''}><span>You owe now</span><b>{money(st.owedNow)}</b><small>{st.openExpenses.length} open expense{st.openExpenses.length === 1 ? '' : 's'}</small></div>
        <div className={owedLate > 0 ? 'is-bad' : ''}><span>Of that, late</span><b>{money(owedLate)}</b><small>past the due date</small></div>
        <div><span>Billed {inPeriod}</span><b>{money(st.billedInPeriod)}</b><small>by issue date</small></div>
        <div><span><i className="acc-dot acc-dot--collected" />Paid {inPeriod}</span><b>{money(st.paidInPeriod)}</b><small>by payment date</small></div>
      </div>

      <div className="acc-det">
        <section className="acc-card" aria-labelledby="acc-vst-h">
          <div className="acc-sec-h acc-sec-h--tools">
            <h2 id="acc-vst-h">Statement</h2>
            <DateRangePicker value={range} onChange={setRange} />
          </div>
          <div className="acc-scroll-x" aria-busy={isFetching}>
            <table className="acc-statement">
              <thead><tr><th>Date</th><th>Details</th><th className="acc-col-num">Billed</th><th className="acc-col-num">Paid</th><th className="acc-col-num">Balance</th></tr></thead>
              <tbody>
                {st.from && (
                  <tr className="is-opening"><td className="acc-nowrap">{fmtDay(st.from)}</td><td>Opening balance</td><td /><td /><td className="acc-col-num">{money(st.opening)}</td></tr>
                )}
                {st.rows.length === 0
                  ? <tr><td colSpan={5} className="acc-empty">No expenses or payments in this period.</td></tr>
                  : st.rows.map((r, i) => (
                    <tr key={i} className={r.kind === 'PAYMENT' ? 'is-payment' : ''}>
                      <td className="acc-nowrap">{fmtDay(r.date)}</td>
                      <td>{r.kind === 'BILL'
                        ? <Link to={`/accounting/expenses/${r.expenseId}`}>{r.details}</Link>
                        : r.details}</td>
                      <td className="acc-col-num">{r.billed ? money(r.billed) : ''}</td>
                      <td className="acc-col-num">{r.paid ? money(r.paid) : ''}</td>
                      <td className="acc-col-num">{money(r.balance)}</td>
                    </tr>
                  ))}
              </tbody>
              <tfoot><tr><td colSpan={4} className="acc-col-num"><b>Still to pay{st.to ? ` on ${fmtDay(st.to)}` : ''}</b></td><td className="acc-col-num"><b>{money(st.closing)}</b></td></tr></tfoot>
            </table>
          </div>
        </section>

        <div className="acc-stack">
          <section className="acc-card" aria-labelledby="acc-vst-age">
            <div className="acc-sec-h"><h2 id="acc-vst-age">Owed by age</h2><small>today</small></div>
            <ul className="acc-age-list">
              {st.aging.map((a) => (
                <li key={a.bucket}>
                  <span><i className="acc-dot" style={{ background: AGING_COLOR[a.bucket] }} />{ACC_AGING_LABELS[a.bucket]}</span>
                  <b>{money(a.amount)}</b>
                </li>
              ))}
            </ul>
          </section>
          <section className="acc-card" aria-labelledby="acc-vst-open">
            <div className="acc-sec-h"><h2 id="acc-vst-open">Open expenses</h2><small>{st.openExpenses.length}</small></div>
            {st.openExpenses.length === 0
              ? <div className="acc-empty-pay"><AccIcon name="ok" size={20} /><p>Nothing open. Every expense is paid.</p></div>
              : (
                <ul className="acc-open-list">
                  {st.openExpenses.map((o) => (
                    <li key={o.id}>
                      <Link to={`/accounting/expenses/${o.id}`}>
                        <span><b className="acc-inv-no">{o.purchaseNo}</b><small>{o.daysLate > 0 ? <span className="ink-bad">{o.daysLate} day{o.daysLate === 1 ? '' : 's'} late</span> : o.dueDate ? `Due ${fmtDay(o.dueDate)}` : `Issued ${fmtDay(o.dateIssued)}`}</small></span>
                        <b>{money(o.balance)}</b>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
          </section>
        </div>
      </div>
    </div>
  )
}
