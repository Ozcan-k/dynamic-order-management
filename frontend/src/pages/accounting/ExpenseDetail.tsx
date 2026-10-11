// Expense page (v2.101.0) — the money-out twin of the invoice page: totals, payments made
// (with Void), items, what is still owed to the vendor, files and history. Payments are
// recorded through the same Record Payment sheet as invoices.
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  ACC_COUNTRY_LABELS, ACC_PAYMENT_METHOD_LABELS, accBalance, accManilaToday, accDaysLate,
  type AccExpense, type AccExpensePayment,
} from '@dom/shared'
import { money, useAttachments, useExpense, useVoidPayment } from '../../api/accounting'
import InvoiceAttachments from '../../components/accounting/InvoiceAttachments'
import PaymentSheet from '../../components/accounting/PaymentSheet'
import VoidPaymentDialog from '../../components/accounting/VoidPaymentDialog'
import AccIcon from '../../components/accounting/AccIcon'
import { METHOD_ICON, apiErrorMessage } from '../../components/accounting/paymentUtils'
import { PaidBar, StatusPill } from '../../components/accounting/paymentBits'

const fmtDate = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const fmtStamp = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' })

export default function ExpenseDetail() {
  const { id } = useParams()
  const { data: exp, isLoading } = useExpense(id)
  if (isLoading) return <div className="acc-page"><div className="acc-empty">Loading…</div></div>
  if (!exp) {
    return (
      <div className="acc-page"><div className="acc-empty">
        This expense was not found. It may have been moved to the Recycle Bin.
        <div style={{ marginTop: 12 }}><Link className="acc-btn acc-btn-outline" to="/accounting/expenses">Back to Expenses</Link></div>
      </div></div>
    )
  }
  return <ExpenseDetailBody exp={exp} />
}

function ExpenseDetailBody({ exp }: { exp: AccExpense }) {
  const navigate = useNavigate()
  // The Expenses list's filters ride along in location.state so "back" restores them.
  const listSearch: string = (useLocation().state as { listSearch?: string } | null)?.listSearch ?? ''
  const today = accManilaToday()
  const balance = accBalance(exp.total, exp.paidTotal)
  const late = accDaysLate(exp.dueDate, exp.status, today)
  const payments = exp.payments ?? []
  const livePayments = payments.filter((p) => !p.voidedAt)
  const ratio = exp.total > 0 ? Math.min(1, exp.paidTotal / exp.total) : 1

  const [sheetOpen, setSheetOpen] = useState(false)
  const [voiding, setVoiding] = useState<AccExpensePayment | null>(null)
  const [toast, setToast] = useState<null | { text: string; undoId?: string }>(null)
  const toastTimer = useRef<number>()
  const payBtn = useRef<HTMLButtonElement>(null)
  const voidPay = useVoidPayment('expenses', exp.id)
  const { data: proofs = [] } = useAttachments('expenses', exp.id, 'PAYMENT_PROOF')
  const proofCount = (pid: string) => proofs.filter((a) => a.paymentId === pid).length

  const showToast = (t: { text: string; undoId?: string }) => {
    window.clearTimeout(toastTimer.current)
    setToast(t)
    toastTimer.current = window.setTimeout(() => setToast(null), 6000)
  }
  useEffect(() => () => window.clearTimeout(toastTimer.current), [])
  const closeSheet = () => { setSheetOpen(false); window.setTimeout(() => payBtn.current?.focus(), 0) }

  const dueText = !exp.dueDate ? 'No due date'
    : exp.status === 'PAID' ? `Due ${fmtDate(exp.dueDate)}`
    : late > 0 ? `${late} day${late === 1 ? '' : 's'} late`
    : `Due ${fmtDate(exp.dueDate)}`

  return (
    <div className="acc-page acc-v3">
      <Link to={`/accounting/expenses${listSearch}`} className="acc-crumb"><AccIcon name="back" size={14} />Expenses</Link>
      <div className="acc-head acc-head-row">
        <div>
          <div className="acc-title-row"><h1 className="acc-title">{exp.purchaseNo}</h1><StatusPill status={exp.status} /></div>
          <p className="acc-sub">
            {exp.vendorName} · Issued {fmtDate(exp.dateIssued)}
            {exp.dueDate && <> · Due {fmtDate(exp.dueDate)}</>}
            {exp.invoiceNumber && <> · Supplier invoice {exp.invoiceNumber}</>}
            {' · '}{ACC_COUNTRY_LABELS[exp.country]}
          </p>
        </div>
        <div className="acc-actions">
          <button type="button" className="acc-btn acc-btn-ghost" onClick={() => navigate(`/accounting/expenses/${exp.id}/edit`, { state: { listSearch } })}><AccIcon name="edit" />Edit</button>
          <button ref={payBtn} type="button" className="acc-btn acc-btn-go" disabled={balance <= 0} onClick={() => setSheetOpen(true)}
            title={balance <= 0 ? 'This expense is fully paid' : undefined}><AccIcon name="plus" />Record Payment</button>
        </div>
      </div>

      <div className="acc-det">
        <div className="acc-stack">
          <section className="acc-card acc-sum" aria-label="Amounts">
            <div className="acc-sum-grid">
              <div><span>Expense total</span><b>{money(exp.total)}</b></div>
              <div><span>Paid</span><b>{money(exp.paidTotal)}</b></div>
              <div><span>Still to pay</span><b className={balance > 0 ? 'ink-warn' : 'ink-ok'}>{money(balance)}</b></div>
            </div>
            <PaidBar total={exp.total} paid={exp.paidTotal} wide />
            <div className="acc-sum-foot">
              <span>{livePayments.length} payment{livePayments.length === 1 ? '' : 's'} · {Math.round(ratio * 100)}% paid</span>
              <span className={late > 0 ? 'ink-bad' : ''}>{balance <= 0 ? 'Fully paid' : dueText}</span>
            </div>
          </section>

          <section className="acc-card">
            <div className="acc-sec-h"><h2>Payments made</h2><small>Newest first</small></div>
            {payments.length === 0 ? (
              <div className="acc-empty-pay">
                <AccIcon name="cash" size={22} />
                <p>No payments recorded. When you pay the vendor, part or all, record it here and what is owed updates.</p>
                {balance > 0 && <button type="button" className="acc-btn acc-btn-go acc-btn-sm" onClick={() => setSheetOpen(true)}><AccIcon name="plus" />Record Payment</button>}
              </div>
            ) : (
              <ul className="acc-pay-list">
                {payments.map((p) => {
                  const n = proofCount(p.id)
                  const detail = [
                    p.paidByName && `Paid by ${p.paidByName}`,
                    p.method === 'BANK_TRANSFER' && p.bankName,
                    p.method === 'GCASH' && p.gcashNumber,
                    p.referenceNumber && `Ref ${p.referenceNumber}`,
                    p.note,
                  ].filter(Boolean).join(' · ')
                  return (
                    <li key={p.id} className={`acc-pay${p.voidedAt ? ' is-void' : ''}`}>
                      <span className={`acc-pay-ic m-${(p.method ?? 'NONE').toLowerCase()}`}><AccIcon name={p.method ? METHOD_ICON[p.method] : 'cash'} /></span>
                      <div className="acc-pay-txt">
                        <b>
                          {p.method ? ACC_PAYMENT_METHOD_LABELS[p.method] : 'Method not recorded'} · {fmtDate(p.paidOn)}
                          {p.voidedAt && <span className="acc-tag">Voided</span>}
                          {p.source === 'MIGRATED' && !p.voidedAt && <span className="acc-tag" title="This expense was marked Paid before payments were tracked one by one. The payment is dated on the expense date.">From Paid status</span>}
                        </b>
                        <small>
                          {p.voidedAt
                            ? `Voided by ${p.voidedByName || '—'} on ${fmtStamp(p.voidedAt)} · ${p.voidReason || ''}`
                            : detail || (p.createdByName ? `Recorded by ${p.createdByName}` : '—')}
                        </small>
                      </div>
                      <span className="acc-pay-proof">{n > 0 && <><AccIcon name="clip" size={13} />{n}</>}</span>
                      <span className="acc-pay-amt">{money(p.amount)}</span>
                      <span className="acc-pay-act">
                        {!p.voidedAt && <button type="button" className="acc-btn acc-btn-ghost acc-btn-sm" onClick={() => setVoiding(p)}>Void</button>}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="acc-card">
            <div className="acc-sec-h"><h2>Items</h2><small>{exp.items.length} line{exp.items.length === 1 ? '' : 's'}</small></div>
            <div className="acc-scroll-x">
              <table>
                <thead><tr><th>Item</th><th>Category</th><th className="acc-col-num">Qty</th><th className="acc-col-num">Unit cost</th><th className="acc-col-num">Amount</th></tr></thead>
                <tbody>
                  {exp.items.map((it) => (
                    <tr key={it.id}>
                      <td>{it.itemName}{it.description && <div className="acc-muted" style={{ fontSize: 12 }}>{it.description}</div>}</td>
                      <td className="acc-muted">{[it.categoryName, it.subcategoryName].filter(Boolean).join(' › ') || '—'}</td>
                      <td className="acc-col-num">{it.quantity}</td>
                      <td className="acc-col-num">{money(it.unitCost)}</td>
                      <td className="acc-col-num">{money(it.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={4} className="acc-col-num"><b>Total</b></td><td className="acc-col-num"><b>{money(exp.total)}</b></td></tr></tfoot>
              </table>
            </div>
          </section>
        </div>

        <div className="acc-stack">
          <section className="acc-card">
            <div className="acc-sec-h"><h2>Vendor</h2><small>{ACC_COUNTRY_LABELS[exp.country]}</small></div>
            <dl className="acc-kv">
              <div><dt>Name</dt><dd>{exp.vendorName}</dd></div>
              {exp.invoiceNumber && <div><dt>Supplier invoice</dt><dd>{exp.invoiceNumber}</dd></div>}
              <div><dt>Still owed on all expenses</dt><dd className={(exp.vendorOpenBalance ?? 0) > 0 ? 'ink-warn' : ''}>{money(exp.vendorOpenBalance ?? 0)}</dd></div>
            </dl>
          </section>

          <section className="acc-card acc-files">
            <div className="acc-sec-h"><h2>Files</h2></div>
            <div className="acc-files-body">
              <InvoiceAttachments resource="expenses" category="INVOICE" recordId={exp.id} staged={[]} onStagedChange={() => {}} />
              <InvoiceAttachments resource="expenses" category="PAYMENT_PROOF" recordId={exp.id} staged={[]} onStagedChange={() => {}} />
            </div>
          </section>

          <section className="acc-card">
            <div className="acc-sec-h"><h2>History</h2></div>
            <dl className="acc-kv">
              <div><dt>Created</dt><dd>{exp.createdByName ? `${exp.createdByName} · ` : ''}{fmtStamp(exp.createdAt)}</dd></div>
              {exp.updatedByName && <div><dt>Last edited</dt><dd>{exp.updatedByName} · {fmtStamp(exp.updatedAt)}</dd></div>}
            </dl>
          </section>
        </div>
      </div>

      <PaymentSheet resource="expenses" open={sheetOpen} onClose={closeSheet}
        record={{ id: exp.id, number: exp.purchaseNo, party: exp.vendorName, total: exp.total, paidTotal: exp.paidTotal, payments: exp.payments }}
        onSaved={({ amount, paymentId, record: updated, proofFailed }) => {
          closeSheet()
          const left = accBalance(updated.total, updated.paidTotal)
          showToast({
            text: `${money(amount)} paid · ${left > 0 ? `${money(left)} still to pay` : 'expense Paid'}${proofFailed ? ' · proof file failed to upload, add it under Files' : ''}`,
            undoId: paymentId ?? undefined,
          })
        }} />

      {voiding && <VoidPaymentDialog amount={voiding.amount} busy={voidPay.isPending} nounBack="What is owed to the vendor goes back up"
        onCancel={() => setVoiding(null)}
        onConfirm={async (reason) => {
          try {
            await voidPay.mutateAsync({ paymentId: voiding.id, reason })
            setVoiding(null)
            showToast({ text: `${money(voiding.amount)} payment voided. It stays in the list, struck through.` })
          } catch (e) { return apiErrorMessage(e, 'Could not void the payment.') }
        }} />}

      <div className={`acc-toast${toast ? ' is-on' : ''}`} role="status" aria-live="polite">
        <span>{toast?.text}</span>
        {toast?.undoId && (
          <button type="button" onClick={async () => {
            const id = toast.undoId!
            setToast(null)
            try { await voidPay.mutateAsync({ paymentId: id, reason: 'Undone right after it was entered' }) }
            catch { showToast({ text: 'Undo failed. Use Void on the payment instead.' }) }
          }}>Undo</button>
        )}
      </div>
    </div>
  )
}
