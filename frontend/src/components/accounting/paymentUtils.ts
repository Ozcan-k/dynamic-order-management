// Non-component helpers for the Accounting v3 payment UI (kept out of .tsx files so
// React fast refresh keeps working on the components).
import type { AccPaymentMethod, AccPaymentStatus } from '@dom/shared'
import type { AccIconName } from './AccIcon'

/** "12,500.5" / "₱12500" → 12500.5; null when it isn't a money amount (max 2 decimals). */
export function parseAmount(raw: string): number | null {
  const s = raw.replace(/[₱,\s]/g, '')
  if (!s || s === '.' || !/^\d*(\.\d{0,2})?$/.test(s)) return null
  return Number(s)
}

export const METHOD_ICON: Record<AccPaymentMethod, AccIconName> = {
  CASH: 'cash', GCASH: 'phone', BANK_TRANSFER: 'bank', CHECK: 'check', CREDIT_CARD: 'card',
}

export const STATUS_ICON: Record<AccPaymentStatus, AccIconName> = { PAID: 'ok', PARTIAL: 'half', UNPAID: 'ring' }

/** The backend's `{ error }` sentence when there is one, otherwise the fallback. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error
  return typeof msg === 'string' && msg ? msg : fallback
}
