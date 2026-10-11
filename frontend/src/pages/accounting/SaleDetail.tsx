// Invoice page (v2.99.0) — read first, act second. Looking at an invoice no longer means
// opening the edit form: totals, payments, items, customer balance and files are shown
// here, and money is recorded through the Record Payment sheet.
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ACC_PAYMENT_METHOD_LABELS, accBalance, accManilaToday, accDaysLate,
  type AccSale, type AccSalePayment,
} from '@dom/shared'
import { downloadInvoicePdf, money, useAttachments, useSale, useVoidPayment } from '../../api/accounting'
import InvoiceAttachments from '../../components/accounting/InvoiceAttachments'
import PaymentSheet from '../../components/accounting/PaymentSheet'
import AccIcon from '../../components/accounting/AccIcon'
import { METHOD_ICON, apiErrorMessage } from '../../components/accounting/paymentUtils'
import { PaidBar, StatusPill } from '../../components/accounting/paymentBits'

const fmtDate = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const fmtStamp = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' })

export default function SaleDetail() {
  const { id } = useParams()
  const { data: sale, isLoading } = useSale(id)
  if (isLoading) return <div className="acc-page"><div className="acc-empty">Loading…</div></div>
  if (!sale) {
    return (
      <div className="acc-page"><div className="acc-empty">
        This invoice was not found. It may have been moved to the Recycle Bin.
        <div style={{ marginTop: 12 }}><Link className="acc-btn acc-btn-outline" to="/accounting/sales">Back to Sales</Link></div>
      </div></div>
    )
  }
  return <SaleDetailBody sale={sale} />
}

function SaleDetailBody({ sale }: { sale: AccSale }) {
  const navigate = useNavigate()
  const today = accManilaToday()
  const balance = accBalance(sale.total, sale.paidTotal)
  const late = accDaysLate(sale.dueDate, sale.status, today)
  const payments = sale.payments ?? []
  const livePayments = payments.filter((p) => !p.voidedAt)
  const ratio = sale.total > 0 ? Math.min(1, sale.paidTotal / sale.total) : 1

  const [sheetOpen, setSheetOpen] = useState(false)
  const [voiding, setVoiding] = useState<AccSalePayment | null>(null)
  const [toast, setToast] = useState<null | { text: string; undoId?: string }>(null)
  const toastTimer = useRef<number>()
  const payBtn = useRef<HTMLButtonElement>(null)
  const voidPay = useVoidPayment(sale.id)
  const { data: proofs = [] } = useAttachments('sales', sale.id, 'PAYMENT_PROOF')
  const proofCount = (pid: string) => proofs.filter((a) => a.paymentId === pid).length

  const showToast = (t: { text: string; undoId?: string }) => {
    window.clearTimeout(toastTimer.current)
    setToast(t)
    toastTimer.current = window.setTimeout(() => setToast(null), 6000)
  }
  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  const closeSheet = () => { setSheetOpen(false); window.setTimeout(() => payBtn.current?.focus(), 0) }

  const dueText = !sale.dueDate ? 'No due date'
    : sale.status === 'PAID' ? `Due ${fmtDate(sale.dueDate)}`
    : late > 0 ? `${late} day${late === 1 ? '' : 's'} late`
    : `Due ${fmtDate(sale.dueDate)}`

  return (
    <div className="acc-page acc-v3">
      <Link to="/accounting/sales" className="acc-crumb"><AccIcon name="back" size={14} />Sales</Link>
      <div className="acc-head acc-head-row">
        <div>
          <div className="acc-title-row"><h1 className="acc-title">{sale.invoiceNo}</h1><StatusPill status={sale.status} /></div>
          <p className="acc-sub">
            {sale.customerName} · Issued {fmtDate(sale.dateIssued)}
            {sale.dueDate && <> · Due {fmtDate(sale.dueDate)}</>}
            {sale.storeName && <> · {sale.storeName}</>}
            {sale.salesAgentName && <> · {sale.salesAgentName}</>}
          </p>
        </div>
        <div className="acc-actions">
          <button type="button" className="acc-btn acc-btn-ghost" onClick={() => navigate(`/accounting/sales/${sale.id}/edit`)}><AccIcon name="edit" />Edit</button>
          <button type="button" className="acc-btn acc-btn-outline" onClick={() => void downloadInvoicePdf(sale.id, sale.invoiceNo)}><AccIcon name="file" />PDF</button>
          <button ref={payBtn} type="button" className="acc-btn acc-btn-go" disabled={balance <= 0} onClick={() => setSheetOpen(true)}
            title={balance <= 0 ? 'This invoice is fully paid' : undefined}><AccIcon name="plus" />Record Payment</button>
        </div>
      </div>

      <div className="acc-det">
        <div className="acc-stack">
          <section className="acc-card acc-sum" aria-label="Amounts">
            <div className="acc-sum-grid">
              <div><span>Invoice total</span><b>{money(sale.total)}</b></div>
              <div><span>Collected</span><b>{money(sale.paidTotal)}</b></div>
              <div><span>Balance due</span><b className={balance > 0 ? 'ink-warn' : 'ink-ok'}>{money(balance)}</b></div>
            </div>
            <PaidBar total={sale.total} paid={sale.paidTotal} wide />
            <div className="acc-sum-foot">
              <span>{livePayments.length} payment{livePayments.length === 1 ? '' : 's'} · {Math.round(ratio * 100)}% collected</span>
              <span className={late > 0 ? 'ink-bad' : ''}>{balance <= 0 ? 'Fully collected' : dueText}</span>
            </div>
          </section>

          <section className="acc-card">
            <div className="acc-sec-h"><h2>Payments</h2><small>Newest first</small></div>
            {payments.length === 0 ? (
              <div className="acc-empty-pay">
                <AccIcon name="cash" size={22} />
                <p>No payments recorded. When the customer pays, part or all, record it here and the balance updates.</p>
                {balance > 0 && <button type="button" className="acc-btn acc-btn-go acc-btn-sm" onClick={() => setSheetOpen(true)}><AccIcon name="plus" />Record Payment</button>}
              </div>
            ) : (
              <ul className="acc-pay-list">
                {payments.map((p) => {
                  const n = proofCount(p.id)
                  const detail = [
                    p.receivedByName && `Received by ${p.receivedByName}`,
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
                          {p.source === 'MIGRATED' && !p.voidedAt && <span className="acc-tag" title="This invoice was marked Paid before payments were tracked one by one. The payment is dated on the invoice date.">From Paid status</span>}
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
            <div className="acc-sec-h"><h2>Items</h2><small>{sale.items.length} line{sale.items.length === 1 ? '' : 's'}</small></div>
            <div className="acc-scroll-x">
              <table>
                <thead><tr><th>Item</th><th>Category</th><th className="acc-col-num">Qty</th><th className="acc-col-num">Unit price</th><th className="acc-col-num">Disc%</th><th className="acc-col-num">Tax%</th><th className="acc-col-num">Amount</th></tr></thead>
                <tbody>
                  {sale.items.map((it) => (
                    <tr key={it.id}>
                      <td>{it.itemName}{it.description && <div className="acc-muted" style={{ fontSize: 12 }}>{it.description}</div>}</td>
                      <td className="acc-muted">{it.categoryName || '—'}</td>
                      <td className="acc-col-num">{it.quantity}</td>
                      <td className="acc-col-num">{money(it.unitCost)}</td>
                      <td className="acc-col-num">{it.discountPct ? `${it.discountPct}%` : '—'}</td>
                      <td className="acc-col-num">{it.taxPct ? `${it.taxPct}%` : '—'}</td>
                      <td className="acc-col-num">{money(it.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {sale.discountTotal > 0 && <tr><td colSpan={6} className="acc-col-num acc-muted">Discount</td><td className="acc-col-num">−{money(sale.discountTotal)}</td></tr>}
                  {sale.taxTotal > 0 && <tr><td colSpan={6} className="acc-col-num acc-muted">Tax</td><td className="acc-col-num">{money(sale.taxTotal)}</td></tr>}
                  <tr><td colSpan={6} className="acc-col-num"><b>Total</b></td><td className="acc-col-num"><b>{money(sale.total)}</b></td></tr>
                </tfoot>
              </table>
            </div>
          </section>
        </div>

        <div className="acc-stack">
          <section className="acc-card">
            <div className="acc-sec-h"><h2>Customer</h2><small>{sale.customerType === 'CORPORATION' ? 'Corporation' : 'Individual'}</small></div>
            <dl className="acc-kv">
              <div><dt>Name</dt><dd>{sale.customerName}</dd></div>
              {(sale.contactPerson || sale.customerNumber) && <div><dt>Contact</dt><dd>{[sale.contactPerson, sale.customerNumber].filter(Boolean).join(' · ')}</dd></div>}
              {sale.customerEmail && <div><dt>Email</dt><dd>{sale.customerEmail}</dd></div>}
              <div><dt>Owes on all invoices</dt><dd className={(sale.customerOpenBalance ?? 0) > 0 ? 'ink-warn' : ''}>{money(sale.customerOpenBalance ?? 0)}</dd></div>
            </dl>
          </section>

          <section className="acc-card acc-files">
            <div className="acc-sec-h"><h2>Files</h2></div>
            <div className="acc-files-body">
              <InvoiceAttachments resource="sales" category="INVOICE" recordId={sale.id} staged={[]} onStagedChange={() => {}} />
              <InvoiceAttachments resource="sales" category="PAYMENT_PROOF" recordId={sale.id} staged={[]} onStagedChange={() => {}} />
            </div>
          </section>

          <section className="acc-card">
            <div className="acc-sec-h"><h2>History</h2></div>
            <dl className="acc-kv">
              <div><dt>Created</dt><dd>{sale.createdByName ? `${sale.createdByName} · ` : ''}{fmtStamp(sale.createdAt)}</dd></div>
              {sale.updatedByName && <div><dt>Last edited</dt><dd>{sale.updatedByName} · {fmtStamp(sale.updatedAt)}</dd></div>}
              {sale.orderReference && <div><dt>Order ref.</dt><dd>{sale.orderReference}</dd></div>}
              {sale.note && <div className="acc-kv-note"><dt>Note</dt><dd>{sale.note}</dd></div>}
            </dl>
          </section>
        </div>
      </div>

      <PaymentSheet sale={sale} open={sheetOpen} onClose={closeSheet}
        onSaved={({ amount, paymentId, sale: updated, proofFailed }) => {
          closeSheet()
          const left = accBalance(updated.total, updated.paidTotal)
          showToast({
            text: `${money(amount)} recorded · ${left > 0 ? `${money(left)} left` : 'invoice Paid'}${proofFailed ? ' · proof file failed to upload, add it under Files' : ''}`,
            undoId: paymentId ?? undefined,
          })
        }} />

      {voiding && <VoidDialog payment={voiding} busy={voidPay.isPending}
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

function VoidDialog({ payment, busy, onCancel, onConfirm }: {
  payment: AccSalePayment; busy: boolean; onCancel: () => void; onConfirm: (reason: string) => Promise<string | void>
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const ok = reason.trim().length >= 3
  return (
    <div className="acc-modal-backdrop" onClick={onCancel} onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}>
      <div className="acc-modal" role="dialog" aria-modal="true" aria-labelledby="acc-void-title" onClick={(e) => e.stopPropagation()}>
        <h3 className="acc-modal-title" id="acc-void-title">Void this {money(payment.amount)} payment?</h3>
        <p className="acc-modal-text">The payment stays in the list, struck through, with your name and reason. The invoice balance goes back up by {money(payment.amount)}.</p>
        <label className="acc-modal-label" htmlFor="acc-void-reason">Reason</label>
        <textarea id="acc-void-reason" className="acc-modal-input" autoFocus rows={2} maxLength={300} value={reason}
          onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered twice" />
        {error && <p className="acc-error" role="alert">{error}</p>}
        <div className="acc-modal-foot">
          <button type="button" className="acc-btn acc-btn-outline" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="acc-btn acc-btn-danger" disabled={!ok || busy}
            onClick={async () => { const err = await onConfirm(reason.trim()); if (err) setError(err) }}>{busy ? 'Voiding…' : 'Void Payment'}</button>
        </div>
      </div>
    </div>
  )
}
