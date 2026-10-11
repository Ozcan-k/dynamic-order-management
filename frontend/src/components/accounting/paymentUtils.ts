// Non-component helpers for the Accounting v3 payment UI (kept out of .tsx files so
// React fast refresh keeps working on the components).
import type { AccAgingBucket, AccPaymentMethod, AccPaymentStatus } from '@dom/shared'

// Chart colours, validated with the dataviz palette checker (light surface):
// Invoiced blue / Collected teal pass the categorical CVD + contrast checks; the late
// buckets are one ordinal orange ramp (light → dark), "Not due" is a neutral outside it.
export const SERIES_COLOR = { invoiced: '#3b82f6', collected: '#0d9488' } as const
export const AGING_COLOR: Record<AccAgingBucket, string> = {
  notDue: '#94a3b8', d1_30: '#f97316', d31_60: '#c2410c', d60: '#7c2d12',
}
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
