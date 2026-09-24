import { AttendanceStatus, ATTENDANCE_LABEL, cellWorkedHours, type EmpScheduleCell } from '@dom/shared'

// Schedule grid helpers (v2.93.0): picker order, keyboard shortcuts, compact labels.

export const STATUS_ORDER: AttendanceStatus[] = [
  AttendanceStatus.PRESENT,
  AttendanceStatus.HALF_DAY,
  AttendanceStatus.PARTIAL_DAY,
  AttendanceStatus.ABSENT,
  AttendanceStatus.DAY_OFF,
  AttendanceStatus.VACATION_LEAVE,
  AttendanceStatus.SICK_LEAVE,
  AttendanceStatus.MATERNITY_LEAVE,
]

/** One-key shortcuts in the grid and the picker. R = paRtial (P is Present). */
export const STATUS_KEY: Record<AttendanceStatus, string> = {
  [AttendanceStatus.PRESENT]: 'P',
  [AttendanceStatus.HALF_DAY]: 'H',
  [AttendanceStatus.PARTIAL_DAY]: 'R',
  [AttendanceStatus.ABSENT]: 'A',
  [AttendanceStatus.DAY_OFF]: 'O',
  [AttendanceStatus.VACATION_LEAVE]: 'V',
  [AttendanceStatus.SICK_LEAVE]: 'S',
  [AttendanceStatus.MATERNITY_LEAVE]: 'M',
}

export const KEY_STATUS: Record<string, AttendanceStatus> = Object.fromEntries(
  Object.entries(STATUS_KEY).map(([s, k]) => [k, s as AttendanceStatus]),
) as Record<string, AttendanceStatus>

/** Short label for the cell chip. */
export const STATUS_SHORT: Record<AttendanceStatus, string> = {
  [AttendanceStatus.PRESENT]: 'Present',
  [AttendanceStatus.HALF_DAY]: 'Half day',
  [AttendanceStatus.PARTIAL_DAY]: 'Partial',
  [AttendanceStatus.ABSENT]: 'Absent',
  [AttendanceStatus.DAY_OFF]: 'Day off',
  [AttendanceStatus.VACATION_LEAVE]: 'Vacation',
  [AttendanceStatus.SICK_LEAVE]: 'Sick',
  [AttendanceStatus.MATERNITY_LEAVE]: 'Maternity',
}

export const WORKING = new Set<AttendanceStatus>([AttendanceStatus.PRESENT, AttendanceStatus.HALF_DAY, AttendanceStatus.PARTIAL_DAY])
export const LEAVE = new Set<AttendanceStatus>([AttendanceStatus.VACATION_LEAVE, AttendanceStatus.SICK_LEAVE, AttendanceStatus.MATERNITY_LEAVE])

export function fmtHours(h: number): string {
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1).replace(/\.0$/, '')}h`
}

/** "8h", "8h +1.5 OT", "3h" — empty string when the status carries no hours. */
export function cellHoursText(c: EmpScheduleCell): string {
  const h = cellWorkedHours(c.status, 0, c.workedHours)
  if (h === 0) return ''
  if (c.status === AttendanceStatus.PRESENT && c.otHours > 0) return `${fmtHours(h)} +${fmtHours(c.otHours).replace('h', '')} OT`
  return fmtHours(h)
}

export function statusLabel(s: AttendanceStatus): string {
  return ATTENDANCE_LABEL[s]
}

/** "1 yr 3 mo" between a start date and an end date (default today). */
export function tenure(start: string, end?: string | null): string {
  const a = new Date(`${start}T00:00:00Z`)
  const b = end ? new Date(`${end}T00:00:00Z`) : new Date()
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
  if (b.getUTCDate() < a.getUTCDate()) months--
  if (months < 1) return 'less than a month'
  const y = Math.floor(months / 12)
  const m = months % 12
  return [y ? `${y} yr${y > 1 ? 's' : ''}` : '', m ? `${m} mo` : ''].filter(Boolean).join(' ')
}
