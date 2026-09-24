import { SALES_TARGET_INFO, type SalesTargetMetric, type TargetStatus } from '@dom/shared'
import { formatHours, formatInt, formatPHP, formatPHPCompact } from '../format'

// Monthly targets helpers (v2.94.0): status colours (reserved status palette, always shown
// with a text label), value formatting per unit, overall-achievement colour ramp.

export const STATUS_META: Record<TargetStatus, { label: string; color: string; bg: string }> = {
  MET: { label: 'Target met', color: '#16A34A', bg: '#dcfce7' },
  ON_TRACK: { label: 'On track', color: '#2563EB', bg: '#dbeafe' },
  BEHIND: { label: 'Behind pace', color: '#D97706', bg: '#fef3c7' },
  MISSED: { label: 'Missed', color: '#DC2626', bg: '#fee2e2' },
  UPCOMING: { label: 'Upcoming', color: '#64748B', bg: '#f1f5f9' },
}

export function fmtValue(metric: SalesTargetMetric, v: number, compact = false): string {
  const unit = SALES_TARGET_INFO[metric].unit
  if (unit === 'php') return compact ? formatPHPCompact(v) : formatPHP(v)
  if (unit === 'hours') return `${formatHours(Math.round(v * 10) / 10)}h`
  return formatInt(v)
}

export function pctText(p: number | null): string {
  return p == null ? '—' : `${Math.round(p * 100)}%`
}

/** Overall achievement → colour ramp (red → amber → blue → green). */
export function overallColor(o: number | null): string {
  if (o == null) return '#cbd5e1'
  if (o >= 1) return '#16A34A'
  if (o >= 0.75) return '#2563EB'
  if (o >= 0.5) return '#D97706'
  return '#DC2626'
}
