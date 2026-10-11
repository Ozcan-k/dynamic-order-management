// Small read-only pieces shared by the Sales list, the invoice page and the mobile cards.
// Payment status and lateness are two separate signals: a part-paid invoice that is
// also overdue shows BOTH a "Partial" pill and "12 days late" — one never hides the other.
import { ACC_PAYMENT_STATUS_LABELS, accDaysLate, type AccPaymentStatus } from '@dom/shared'
import AccIcon from './AccIcon'
import { STATUS_ICON } from './paymentUtils'

const PILL_CLASS: Record<AccPaymentStatus, string> = { PAID: 'paid', PARTIAL: 'part', UNPAID: 'unp' }

export function StatusPill({ status }: { status: AccPaymentStatus }) {
  return (
    <span className={`acc-pill acc-pill--${PILL_CLASS[status]}`}>
      <AccIcon name={STATUS_ICON[status]} size={12} />
      {ACC_PAYMENT_STATUS_LABELS[status]}
    </span>
  )
}

const fmtDay = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** "12 days late" / "Due today" / "In 3 days" / "Oct 15" / "—". */
export function DueCell({ dueDate, status, today }: { dueDate: string | null; status: AccPaymentStatus; today: string }) {
  if (!dueDate) return <span className="acc-due acc-due--calm">—</span>
  if (status === 'PAID') return <span className="acc-due acc-due--calm">{fmtDay(dueDate)}</span>
  const late = accDaysLate(dueDate, status, today)
  if (late > 0) return <span className="acc-due acc-due--late"><AccIcon name="alert" size={13} />{late} day{late === 1 ? '' : 's'} late</span>
  const ahead = Math.round((Date.parse(dueDate.slice(0, 10) + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86_400_000)
  if (ahead === 0) return <span className="acc-due acc-due--soon"><AccIcon name="clock" size={13} />Due today</span>
  if (ahead <= 7) return <span className="acc-due acc-due--soon"><AccIcon name="clock" size={13} />In {ahead} day{ahead === 1 ? '' : 's'}</span>
  return <span className="acc-due acc-due--calm">{fmtDay(dueDate)}</span>
}

/** Collected-vs-total bar. Scales with transform only (cheap to animate). */
export function PaidBar({ total, paid, wide }: { total: number; paid: number; wide?: boolean }) {
  const ratio = total > 0 ? Math.min(1, paid / total) : 1
  return (
    <span className={`acc-paybar${wide ? ' acc-paybar--wide' : ''}`} aria-hidden="true">
      <i style={{ transform: `scaleX(${ratio.toFixed(4)})` }} />
    </span>
  )
}
