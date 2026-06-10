import { AttendanceStatus, EmpDepartment } from '@dom/shared'

// ─── Attendance status colours (cell + legend) ───────────────────────────────
export interface StatusStyle { bg: string; text: string; border: string; dot: string }

export const STATUS_STYLE: Record<AttendanceStatus, StatusStyle> = {
  [AttendanceStatus.PRESENT]:         { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0', dot: '#10b981' },
  [AttendanceStatus.HALF_DAY]:        { bg: '#f0fdfa', text: '#0f766e', border: '#99f6e4', dot: '#14b8a6' },
  [AttendanceStatus.ABSENT]:          { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca', dot: '#ef4444' },
  [AttendanceStatus.DAY_OFF]:         { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1', dot: '#64748b' },
  [AttendanceStatus.VACATION_LEAVE]:  { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe', dot: '#3b82f6' },
  [AttendanceStatus.SICK_LEAVE]:      { bg: '#fffbeb', text: '#b45309', border: '#fde68a', dot: '#f59e0b' },
  [AttendanceStatus.MATERNITY_LEAVE]: { bg: '#fdf4ff', text: '#a21caf', border: '#f5d0fe', dot: '#d946ef' },
}

/** The blank "—" (unscheduled) cell style. */
export const EMPTY_CELL_STYLE: StatusStyle = { bg: '#ffffff', text: '#94a3b8', border: '#e2e8f0', dot: '#cbd5e1' }

// ─── Department accent colours (section bands + chips) ────────────────────────
export interface DeptStyle { band: string; bandText: string; accent: string; soft: string }

export const DEPT_STYLE: Record<EmpDepartment, DeptStyle> = {
  [EmpDepartment.ADMINISTRATIVE]: { band: '#eef2ff', bandText: '#3730a3', accent: '#6366f1', soft: '#e0e7ff' },
  [EmpDepartment.PICKER]:         { band: '#eff6ff', bandText: '#1e40af', accent: '#3b82f6', soft: '#dbeafe' },
  [EmpDepartment.PACKER]:         { band: '#fffbeb', bandText: '#92400e', accent: '#f59e0b', soft: '#fef3c7' },
  [EmpDepartment.LOGISTIC]:       { band: '#ecfdf5', bandText: '#065f46', accent: '#10b981', soft: '#d1fae5' },
}

/** Two-letter initials from first/last name for the avatar chip. */
export function initials(first: string, last: string): string {
  return `${(first[0] ?? '').toUpperCase()}${(last[0] ?? '').toUpperCase()}` || '?'
}

/** Format hours as H:MM (e.g. 45 → "45:00", 4.5 → "4:30"). */
export function hoursToClock(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function dayName(dateStr: string): string {
  return DAY_NAMES[new Date(`${dateStr}T00:00:00.000Z`).getUTCDay()]
}
export function shortDayName(dateStr: string): string {
  return dayName(dateStr).slice(0, 3)
}
export function shortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  return `${String(d.getUTCDate()).padStart(2, '0')} ${SHORT_MONTHS[d.getUTCMonth()]}`
}
export function fullDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  return `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** ISO week number (1–53) for a Sunday-start week — used as the "Week #" label. */
export function weekNumber(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  // shift to Thursday of the same week for ISO numbering
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() - day + 4)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

/** Add n days to YYYY-MM-DD. */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Today as YYYY-MM-DD (local). */
export function todayStr(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
