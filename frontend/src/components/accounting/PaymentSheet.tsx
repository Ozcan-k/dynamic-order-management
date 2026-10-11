// Record Payment — a side sheet over the invoice page (v2.99.0) and the expense page (v2.101.0).
// The amount starts at the full balance, the outcome ("Stays Partial · ₱X left") is
// previewed live from the same shared math the backend uses, and an amount above the
// balance is stopped inline before it ever reaches the server (which refuses it too).
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ACC_PAYMENT_METHOD_LABELS, AccPaymentMethod, accBalance, accCents, accDeriveStatus, accManilaToday,
  type AccPaymentInput, type AccSale, type AccExpense,
} from '@dom/shared'
import { money, uploadAttachment, useRecordPayment, type PaymentResource } from '../../api/accounting'
import { useAuthStore } from '../../stores/authStore'
import { downscaleImage } from '../../lib/imageDownscale'
import { validateAttachment, ACCEPT } from './InvoiceAttachments'
import AccIcon from './AccIcon'
import { METHOD_ICON, apiErrorMessage, parseAmount } from './paymentUtils'

const METHODS: AccPaymentMethod[] = [AccPaymentMethod.CASH, AccPaymentMethod.GCASH, AccPaymentMethod.BANK_TRANSFER, AccPaymentMethod.CHECK, AccPaymentMethod.CREDIT_CARD]
const SHORT: Record<AccPaymentMethod, string> = { CASH: 'Cash', GCASH: 'GCash', BANK_TRANSFER: 'Bank', CHECK: 'Check', CREDIT_CARD: 'Card' }

const asInput = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** What the sheet needs from an invoice or an expense. */
export interface PayableRecord {
  id: string
  number: string
  party: string
  total: number
  paidTotal: number
  payments?: { id: string }[]
}

interface Props {
  /** 'sales' = money received (invoice); 'expenses' = money paid out. */
  resource: PaymentResource
  record: PayableRecord
  open: boolean
  onClose: () => void
  /** Called after the payment is stored (and its proof, if any, uploaded). */
  onSaved: (info: { amount: number; paymentId: string | null; record: AccSale | AccExpense; proofFailed: boolean }) => void
}

export default function PaymentSheet({ resource, record: sale, open, onClose, onSaved }: Props) {
  const me = useAuthStore((s) => s.user?.username ?? '')
  const record = useRecordPayment(resource, sale.id)
  const isSale = resource === 'sales'
  const balance = accBalance(sale.total, sale.paidTotal)

  const [amount, setAmount] = useState('')
  const [paidOn, setPaidOn] = useState(accManilaToday())
  const [receivedBy, setReceivedBy] = useState(me)
  const [method, setMethod] = useState<AccPaymentMethod>(AccPaymentMethod.CASH)
  const [bankName, setBankName] = useState('')
  const [accountName, setAccountName] = useState('')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [gcashNumber, setGcashNumber] = useState('')
  const [note, setNote] = useState('')
  const [proof, setProof] = useState<File | null>(null)
  const [error, setError] = useState('')
  // Method fields are only nagged about after a Save attempt, not while the person is still typing.
  const [tried, setTried] = useState(false)
  const amountRef = useRef<HTMLInputElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Fresh form every time the sheet opens, amount pre-filled with what is left.
  useEffect(() => {
    if (!open) return
    setAmount(asInput(balance)); setPaidOn(accManilaToday()); setReceivedBy(me)
    setMethod(AccPaymentMethod.CASH); setBankName(''); setAccountName(''); setReferenceNumber(''); setGcashNumber('')
    setNote(''); setProof(null); setError(''); setTried(false)
    const t = window.setTimeout(() => { amountRef.current?.focus(); amountRef.current?.select() }, 60)
    return () => window.clearTimeout(t)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const value = parseAmount(amount)
  const tooMuch = value !== null && accCents(value) > accCents(balance)
  const amountError =
    amount.trim() === '' ? '' :
    value === null || value <= 0 ? 'Enter an amount like 5,000 or 5,000.50.' :
    tooMuch ? `${money(value)} is more than the ${money(balance)} left. Use Full balance or lower the amount.` : ''

  const methodError =
    method === 'BANK_TRANSFER' && (!bankName.trim() || !accountName.trim() || !referenceNumber.trim()) ? 'Bank, account name and reference number are needed for a bank transfer.' :
    method === 'GCASH' && !gcashNumber.trim() ? 'The GCash number is needed.' : ''

  const outcome = useMemo(() => {
    if (value === null || value <= 0 || tooMuch) return null
    const after = accDeriveStatus(sale.total, sale.paidTotal + value)
    return { after, left: accBalance(sale.total, sale.paidTotal + value) }
  }, [value, tooMuch, sale.total, sale.paidTotal])

  const canSave = !!outcome && !!paidOn && !record.isPending

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave || value === null) return
    if (methodError) { setTried(true); return }
    setError('')
    const before = new Set((sale.payments ?? []).map((p) => p.id))
    const input: AccPaymentInput = {
      amount: value, paidOn, method,
      bankName: bankName || null, accountName: accountName || null, referenceNumber: referenceNumber || null,
      gcashNumber: gcashNumber || null, note: note || null,
      ...(isSale ? { receivedByName: receivedBy || null } : { paidByName: receivedBy || null }),
    }
    let updated: AccSale | AccExpense
    try { updated = await record.mutateAsync(input) }
    catch (err) { setError(apiErrorMessage(err, 'The payment could not be saved. Try again.')); return }
    const created = ((updated.payments ?? []) as { id: string }[]).find((p) => !before.has(p.id)) ?? null
    let proofFailed = false
    if (proof && created) {
      try { await uploadAttachment(resource, sale.id, 'PAYMENT_PROOF', await downscaleImage(proof), created.id) }
      catch { proofFailed = true }
    }
    onSaved({ amount: value, paymentId: created?.id ?? null, record: updated, proofFailed })
  }

  // Esc closes; Tab stays inside the sheet while it is open.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key !== 'Tab' || !sheetRef.current) return
    const els = Array.from(sheetRef.current.querySelectorAll<HTMLElement>('button, input, textarea, select'))
      .filter((el) => !(el as HTMLButtonElement).disabled && el.offsetParent !== null && !((el as HTMLInputElement).type === 'radio' && !(el as HTMLInputElement).checked))
    if (!els.length) return
    const first = els[0], last = els[els.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  return createPortal(
    <div className={`acc-sheet-root${open ? ' is-open' : ''}`} aria-hidden={!open}>
      <div className="acc-sheet-scrim" onClick={onClose} />
      <div ref={sheetRef} className="acc-sheet" role="dialog" aria-modal="true" aria-labelledby="acc-pay-title" onKeyDown={onKeyDown}>
        <div className="acc-sheet-head">
          <div>
            <h2 id="acc-pay-title">Record Payment</h2>
            <p>{sale.number} · {sale.party} · {money(balance)} left</p>
          </div>
          <button type="button" className="acc-icon-btn" onClick={onClose} aria-label="Close"><AccIcon name="x" /></button>
        </div>

        <form id="acc-pay-form" className="acc-sheet-body" onSubmit={submit} noValidate>
          <div className={`acc-pf${amountError ? ' has-error' : ''}`}>
            <label htmlFor="acc-pay-amount">{isSale ? 'Amount received' : 'Amount paid'}</label>
            <div className="acc-money-input">
              <span aria-hidden="true">₱</span>
              <input id="acc-pay-amount" ref={amountRef} name="amount" inputMode="decimal" autoComplete="off" spellCheck={false}
                value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!amountError} aria-describedby="acc-pay-amount-hint" />
            </div>
            <div className="acc-chips">
              <button type="button" onClick={() => setAmount(asInput(balance))}>Full balance · {money(balance)}</button>
            </div>
            <div className="acc-pf-hint" id="acc-pay-amount-hint" aria-live="polite">{amountError || `Up to the balance of ${money(balance)}.`}</div>
          </div>

          <div className="acc-pf-row">
            <div className="acc-pf"><label htmlFor="acc-pay-date">Date paid</label>
              <input id="acc-pay-date" type="date" value={paidOn} max={accManilaToday()} onChange={(e) => setPaidOn(e.target.value)} /></div>
            <div className="acc-pf"><label htmlFor="acc-pay-by">{isSale ? 'Received by' : 'Paid by'}</label>
              <input id="acc-pay-by" value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} autoComplete="off" /></div>
          </div>

          <fieldset className="acc-methods">
            <legend>Method</legend>
            {METHODS.map((m) => (
              <label key={m} className={method === m ? 'is-on' : ''} title={ACC_PAYMENT_METHOD_LABELS[m]}>
                <input type="radio" name="acc-pay-method" value={m} checked={method === m} onChange={() => setMethod(m)} />
                <AccIcon name={METHOD_ICON[m]} size={18} />{SHORT[m]}
              </label>
            ))}
          </fieldset>

          {method === 'BANK_TRANSFER' && <>
            <div className="acc-pf-row">
              <div className="acc-pf"><label htmlFor="acc-pay-bank">Bank</label><input id="acc-pay-bank" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. BDO" autoComplete="off" /></div>
              <div className="acc-pf"><label htmlFor="acc-pay-ref">Reference no.</label><input id="acc-pay-ref" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} autoComplete="off" spellCheck={false} /></div>
            </div>
            <div className="acc-pf"><label htmlFor="acc-pay-acct">Account name</label><input id="acc-pay-acct" value={accountName} onChange={(e) => setAccountName(e.target.value)} autoComplete="off" /></div>
          </>}
          {method === 'GCASH' && (
            <div className="acc-pf-row">
              <div className="acc-pf"><label htmlFor="acc-pay-gc">GCash number</label><input id="acc-pay-gc" inputMode="tel" value={gcashNumber} onChange={(e) => setGcashNumber(e.target.value)} placeholder="e.g. 0917 555 0142" autoComplete="off" /></div>
              <div className="acc-pf"><label htmlFor="acc-pay-ref">Reference no.</label><input id="acc-pay-ref" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} autoComplete="off" spellCheck={false} /></div>
            </div>
          )}
          {method === 'CHECK' && (
            <div className="acc-pf-row">
              <div className="acc-pf"><label htmlFor="acc-pay-ref">Check no.</label><input id="acc-pay-ref" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} autoComplete="off" spellCheck={false} /></div>
              <div className="acc-pf"><label htmlFor="acc-pay-acct">Account name</label><input id="acc-pay-acct" value={accountName} onChange={(e) => setAccountName(e.target.value)} autoComplete="off" /></div>
            </div>
          )}
          {method === 'CREDIT_CARD' && (
            <div className="acc-pf"><label htmlFor="acc-pay-ref">Reference no. (optional)</label><input id="acc-pay-ref" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} autoComplete="off" spellCheck={false} /></div>
          )}

          <div className="acc-pf"><label htmlFor="acc-pay-note">Note (optional)</label>
            <input id="acc-pay-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} autoComplete="off" placeholder="e.g. Second instalment" /></div>

          <div className="acc-pf">
            <span className="acc-pf-label">Payment proof (optional)</span>
            <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={(e) => {
              const f = e.target.files?.[0] ?? null; e.target.value = ''
              if (!f) return
              const bad = validateAttachment(f)
              if (bad) { setError(bad); return }
              setError(''); setProof(f)
            }} />
            {proof
              ? <div className="acc-proof-chip"><AccIcon name="clip" size={14} /><span>{proof.name}</span><button type="button" onClick={() => setProof(null)} aria-label="Remove file"><AccIcon name="x" size={14} /></button></div>
              : <button type="button" className="acc-drop" onClick={() => fileRef.current?.click()}><AccIcon name="clip" size={15} />Add a photo or PDF</button>}
          </div>

          <div className={`acc-outcome${outcome?.after === 'PAID' ? ' is-full' : ''}`} aria-live="polite">
            {outcome
              ? outcome.after === 'PAID'
                ? <><AccIcon name="ok" style={{ color: 'var(--acc-ok-ink)' }} /><span>{isSale ? 'Invoice' : 'Expense'} becomes <b className="ink-ok">Paid</b> · nothing left to {isSale ? 'collect' : 'pay'}.</span></>
                : <><AccIcon name="half" style={{ color: 'var(--acc-warn-ink)' }} /><span>Stays <b className="ink-warn">Partial</b> · {money(outcome.left)} left after this.</span></>
              : <><AccIcon name="alert" /><span>{amountError ? 'Nothing is saved until the amount fits.' : (isSale ? 'Enter the amount the customer paid.' : 'Enter the amount paid to the vendor.')}</span></>}
          </div>
          {(error || (tried && methodError)) && <p className="acc-pf-error" role="alert">{error || methodError}</p>}
        </form>

        <div className="acc-sheet-foot">
          <button type="button" className="acc-btn acc-btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" form="acc-pay-form" className="acc-btn acc-btn-go" disabled={!canSave}>
            {record.isPending ? 'Saving…' : 'Save Payment'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
