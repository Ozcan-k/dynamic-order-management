// Formatting + delta helpers shared by the Marketing Report and Agent panel.

const php0 = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export function formatPHP(n: number): string {
  return php0.format(n)
}

/** ₱12.4K style — for axes and dense tiles. */
export function formatPHPCompact(n: number): string {
  return Math.abs(n) < 1000 ? php0.format(n) : `₱${compact.format(n)}`
}

export function formatInt(n: number): string {
  return int.format(n)
}

export function formatCompact(n: number): string {
  return Math.abs(n) < 1000 ? int.format(n) : compact.format(n)
}

export function formatHours(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1)
}

export function formatPct(ratio: number, digits = 0): string {
  return `${(ratio * 100).toFixed(digits)}%`
}

export type DeltaDir = 'up' | 'down' | 'flat' | 'new' | 'none'

export interface Delta {
  dir: DeltaDir
  label: string
}

/** Relative change vs the previous period. */
export function relativeDelta(current: number, previous: number): Delta {
  if (previous === 0 && current === 0) return { dir: 'none', label: '—' }
  if (previous === 0) return { dir: 'new', label: 'New' }
  const pct = ((current - previous) / Math.abs(previous)) * 100
  if (Math.abs(pct) < 0.5) return { dir: 'flat', label: '0%' }
  // Past +1000% a multiplier reads better than a four-digit percentage
  if (pct >= 1000) return { dir: 'up', label: `${(current / previous).toFixed(0)}×` }
  return { dir: pct > 0 ? 'up' : 'down', label: `${Math.abs(pct) >= 100 ? pct.toFixed(0) : pct.toFixed(1)}%`.replace('-', '') }
}

/** Change of a 0..1 rate, in percentage points. */
export function pointDelta(current: number, previous: number, hasPrevious: boolean): Delta {
  if (!hasPrevious) return { dir: 'none', label: '—' }
  const pp = (current - previous) * 100
  if (Math.abs(pp) < 0.5) return { dir: 'flat', label: '0 pp' }
  return { dir: pp > 0 ? 'up' : 'down', label: `${Math.abs(pp).toFixed(1)} pp` }
}

export function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export function todayManila(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function shiftDate(dateStr: string, days: number): string {
  return new Date(new Date(`${dateStr}T00:00:00.000Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10)
}
