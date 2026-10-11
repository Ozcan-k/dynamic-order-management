// Customer account (v2.100.0): what they owe now, how late, and every invoice and
// payment on one timeline with a running balance — the same data as the Statement PDF.
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ACC_AGING_LABELS } from '@dom/shared'
import { downloadStatementPdf, money, useCustomerStatement } from '../../api/accounting'
import DateRangePicker, { type DateRange } from '../../components/accounting/DateRangePicker'
import AccIcon from '../../components/accounting/AccIcon'
import { AGING_COLOR } from '../../components/accounting/paymentUtils'

const fmtDay = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export default function CustomerStatement() {
  const { id } = useParams()
  const [range, setRange] = useState<DateRange>({ from: '', to: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const { data: st, isLoading, isFetching } = useCustomerStatement(id, { from: range.from, to: range.to })

  if (isLoading) return <div className="acc-page acc-v3"><div className="acc-empty">Loading…</div></div>
  if (!st) return (
    <div className="acc-page acc-v3"><div className="acc-empty">
      This customer was not found.
      <div style={{ marginTop: 12 }}><Link className="acc-btn acc-btn-outline" to="/accounting/contacts">Back to Customers</Link></div>
    </div></div>
  )

  const c = st.customer
  const owedLate = st.aging.filter((a) => a.bucket !== 'notDue').reduce((t, a) => t + a.amount, 0)

  return (
    <div className="acc-page acc-v3">
      <Link to="/accounting/contacts" className="acc-crumb"><AccIcon name="back" size={14} />Customers</Link>
      <div className="acc-head acc-head-row">
        <div>
          <h1 className="acc-title">{c.name}</h1>
          <p className="acc-sub">{[c.type === 'CORPORATION' ? 'Corporation' : 'Individual', c.contactPerson, c.contactNumber, c.email].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="acc-actions">
          <Link className="acc-btn acc-btn-outline" to={`/accounting/sales?search=${encodeURIComponent(c.name)}`}>Invoices</Link>
          <button type="button" className="acc-btn acc-btn-primary" disabled={busy} onClick={async () => {
            setBusy(true); setErr('')
            try { await downloadStatementPdf(c.id, c.name, { from: range.from, to: range.to }) }
            catch { setErr('The statement PDF could not be created. Try again.') }
            finally { setBusy(false) }
          }}><AccIcon name="download" />{busy ? 'Preparing…' : 'Statement PDF'}</button>
        </div>
      </div>
      {err && <p className="acc-error" role="alert" style={{ marginTop: -10 }}>{err}</p>}

      <div className="acc-money">
        <div className={st.owedNow > 0 ? 'is-warn' : ''}><span>Owes you now</span><b>{money(st.owedNow)}</b><small>{st.openInvoices.length} open invoice{st.openInvoices.length === 1 ? '' : 's'}</small></div>
        <div className={owedLate > 0 ? 'is-bad' : ''}><span>Of that, late</span><b>{money(owedLate)}</b><small>past the due date</small></div>
        <div><span>Invoiced {range.from || range.to ? 'in period' : 'all time'}</span><b>{money(st.invoicedInPeriod)}</b><small>by issue date</small></div>
        <div><span><i className="acc-dot acc-dot--collected" />Paid {range.from || range.to ? 'in period' : 'all time'}</span><b>{money(st.paidInPeriod)}</b><small>by payment date</small></div>
      </div>

      <div className="acc-det">
        <section className="acc-card" aria-labelledby="acc-st-h">
          <div className="acc-sec-h acc-sec-h--tools">
            <h2 id="acc-st-h">Statement</h2>
            <DateRangePicker value={range} onChange={setRange} />
          </div>
          <div className="acc-scroll-x" aria-busy={isFetching}>
            <table className="acc-statement">
              <thead><tr><th>Date</th><th>Details</th><th className="acc-col-num">Invoiced</th><th className="acc-col-num">Paid</th><th className="acc-col-num">Balance</th></tr></thead>
              <tbody>
                {st.from && (
                  <tr className="is-opening"><td className="acc-nowrap">{fmtDay(st.from)}</td><td>Opening balance</td><td /><td /><td className="acc-col-num">{money(st.opening)}</td></tr>
                )}
                {st.rows.length === 0
                  ? <tr><td colSpan={5} className="acc-empty">No invoices or payments in this period.</td></tr>
                  : st.rows.map((r, i) => (
                    <tr key={i} className={r.kind === 'PAYMENT' ? 'is-payment' : ''}>
                      <td className="acc-nowrap">{fmtDay(r.date)}</td>
                      <td>{r.kind === 'INVOICE'
                        ? <Link to={`/accounting/sales/${r.saleId}`}>{r.details}</Link>
                        : r.details}</td>
                      <td className="acc-col-num">{r.invoiced ? money(r.invoiced) : ''}</td>
                      <td className="acc-col-num">{r.paid ? money(r.paid) : ''}</td>
                      <td className="acc-col-num">{money(r.balance)}</td>
                    </tr>
                  ))}
              </tbody>
              <tfoot><tr><td colSpan={4} className="acc-col-num"><b>Amount due{st.to ? ` on ${fmtDay(st.to)}` : ''}</b></td><td className="acc-col-num"><b>{money(st.closing)}</b></td></tr></tfoot>
            </table>
          </div>
        </section>

        <div className="acc-stack">
          <section className="acc-card" aria-labelledby="acc-st-age">
            <div className="acc-sec-h"><h2 id="acc-st-age">Owed by age</h2><small>today</small></div>
            <ul className="acc-age-list">
              {st.aging.map((a) => (
                <li key={a.bucket}>
                  <span><i className="acc-dot" style={{ background: AGING_COLOR[a.bucket] }} />{ACC_AGING_LABELS[a.bucket]}</span>
                  <b>{money(a.amount)}</b>
                </li>
              ))}
            </ul>
          </section>
          <section className="acc-card" aria-labelledby="acc-st-open">
            <div className="acc-sec-h"><h2 id="acc-st-open">Open invoices</h2><small>{st.openInvoices.length}</small></div>
            {st.openInvoices.length === 0
              ? <div className="acc-empty-pay"><AccIcon name="ok" size={20} /><p>Nothing open. Every invoice is paid.</p></div>
              : (
                <ul className="acc-open-list">
                  {st.openInvoices.map((o) => (
                    <li key={o.id}>
                      <Link to={`/accounting/sales/${o.id}`}>
                        <span><b className="acc-inv-no">{o.invoiceNo}</b><small>{o.daysLate > 0 ? <span className="ink-bad">{o.daysLate} day{o.daysLate === 1 ? '' : 's'} late</span> : o.dueDate ? `Due ${fmtDay(o.dueDate)}` : `Issued ${fmtDay(o.dateIssued)}`}</small></span>
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
