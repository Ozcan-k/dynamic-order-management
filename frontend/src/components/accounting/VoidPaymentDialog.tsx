// "Void this payment?" — shared by the invoice and expense pages. A payment is never
// deleted: it stays in the list, struck through, with who voided it and why.
import { useState } from 'react'
import { money } from '../../api/accounting'

export default function VoidPaymentDialog({ amount, busy, nounBack, onCancel, onConfirm }: {
  amount: number
  busy: boolean
  /** e.g. "The invoice balance goes back up" / "What is owed to the vendor goes back up" */
  nounBack: string
  onCancel: () => void
  /** Resolves to an error message to show, or nothing on success. */
  onConfirm: (reason: string) => Promise<string | void>
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const ok = reason.trim().length >= 3
  return (
    <div className="acc-modal-backdrop" onClick={onCancel} onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}>
      <div className="acc-modal" role="dialog" aria-modal="true" aria-labelledby="acc-void-title" onClick={(e) => e.stopPropagation()}>
        <h3 className="acc-modal-title" id="acc-void-title">Void this {money(amount)} payment?</h3>
        <p className="acc-modal-text">The payment stays in the list, struck through, with your name and reason. {nounBack} by {money(amount)}.</p>
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
