// ════════════════════════════════════════════════════════════════════════════
// EMPLOYEE SCHEDULE MODULE (v2.66.0) — shared types.
// Independent staff attendance scheduler. ADMIN + WAREHOUSE_ADMIN only.
// ════════════════════════════════════════════════════════════════════════════

export enum EmpDepartment {
  ADMINISTRATIVE = 'ADMINISTRATIVE',
  PICKER = 'PICKER',
  PACKER = 'PACKER',
  LOGISTIC = 'LOGISTIC',
}

export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  DAY_OFF = 'DAY_OFF',
  VACATION_LEAVE = 'VACATION_LEAVE',
  SICK_LEAVE = 'SICK_LEAVE',
  HALF_DAY = 'HALF_DAY',
  MATERNITY_LEAVE = 'MATERNITY_LEAVE',
  /** v2.93.0 — worked only some hours (e.g. 3 h); the hours live in `workedHours`. */
  PARTIAL_DAY = 'PARTIAL_DAY',
}

/** Display labels for departments (UI, English). */
export const EMP_DEPARTMENT_LABEL: Record<EmpDepartment, string> = {
  [EmpDepartment.ADMINISTRATIVE]: 'Administrative Staff',
  [EmpDepartment.PICKER]: 'Picker Staff',
  [EmpDepartment.PACKER]: 'Packer Staff',
  [EmpDepartment.LOGISTIC]: 'Logistic Staff',
}

/** Department display order (used everywhere employees are grouped). */
export const EMP_DEPARTMENT_ORDER: EmpDepartment[] = [
  EmpDepartment.ADMINISTRATIVE,
  EmpDepartment.PICKER,
  EmpDepartment.PACKER,
  EmpDepartment.LOGISTIC,
]

/** Display labels for attendance statuses. */
export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  [AttendanceStatus.PRESENT]: 'Present',
  [AttendanceStatus.ABSENT]: 'Absent',
  [AttendanceStatus.DAY_OFF]: 'Day Off',
  [AttendanceStatus.VACATION_LEAVE]: 'Vacation Leave',
  [AttendanceStatus.SICK_LEAVE]: 'Sick Leave',
  [AttendanceStatus.HALF_DAY]: 'Half Day',
  [AttendanceStatus.MATERNITY_LEAVE]: 'Maternity Leave',
  [AttendanceStatus.PARTIAL_DAY]: 'Partial Day',
}

/** Base worked hours per status (excludes OT). Present = 8, Half Day = 4, rest = 0.
 *  Partial Day has no fixed base — its hours are entered per day (`workedHours`). */
export const ATTENDANCE_BASE_HOURS: Record<AttendanceStatus, number> = {
  [AttendanceStatus.PRESENT]: 8,
  [AttendanceStatus.HALF_DAY]: 4,
  [AttendanceStatus.ABSENT]: 0,
  [AttendanceStatus.DAY_OFF]: 0,
  [AttendanceStatus.VACATION_LEAVE]: 0,
  [AttendanceStatus.SICK_LEAVE]: 0,
  [AttendanceStatus.MATERNITY_LEAVE]: 0,
  [AttendanceStatus.PARTIAL_DAY]: 0,
}

/** Max overtime hours selectable on a Present day. */
export const MAX_OT_HOURS = 5

/** Standard full shift in hours — Partial Day hours are measured against it. */
export const FULL_DAY_HOURS = 8

/** Allowed Partial Day hours (v2.93.0): 0.5–7.5 h in 0.5 h steps. */
export const PARTIAL_MIN_HOURS = 0.5
export const PARTIAL_MAX_HOURS = 7.5

/** Valid Partial Day hours: within range and a multiple of 0.5. */
export function isValidPartialHours(h: unknown): h is number {
  return typeof h === 'number' && Number.isFinite(h) && h >= PARTIAL_MIN_HOURS && h <= PARTIAL_MAX_HOURS && Math.round(h * 2) === h * 2
}

/**
 * Hours a schedule cell counts for (single source for grid, report, PDF/CSV).
 * Present = 8 + OT · Half Day = 4 · Partial Day = entered hours · everything else = 0.
 * Rows saved before v2.93.0 have no Partial Day, so their hours are unchanged.
 */
export function cellWorkedHours(status: AttendanceStatus, otHours: number, workedHours?: number | null): number {
  if (status === AttendanceStatus.PARTIAL_DAY) return workedHours ?? 0
  const base = ATTENDANCE_BASE_HOURS[status] ?? 0
  return base + (status === AttendanceStatus.PRESENT ? otHours : 0)
}

/** Fraction of a normal working day a cell counts as (Warehouse Report target factor). */
export function cellDayFactor(status: AttendanceStatus, workedHours?: number | null): number {
  if (status === AttendanceStatus.PRESENT) return 1
  if (status === AttendanceStatus.HALF_DAY) return 0.5
  if (status === AttendanceStatus.PARTIAL_DAY) return (workedHours ?? 0) / FULL_DAY_HOURS
  return 0
}

export interface EmpEmployeeDTO {
  id: string
  empNo: number
  department: EmpDepartment
  firstName: string
  lastName: string
  startDate: string // YYYY-MM-DD
  contactNumber: string | null
  email: string | null
  address: string | null
  birthday: string | null // YYYY-MM-DD
  emergencyContactName: string | null
  emergencyContactNumber: string | null
  isActive: boolean
  leaveDate: string | null // YYYY-MM-DD — set when isActive=false
  /** Linked system logins (v2.88.0: one employee can own several, e.g. picker + packer). */
  userIds: string[]
}

/** One schedule cell (a day's attendance for an employee). */
export interface EmpScheduleCell {
  date: string // YYYY-MM-DD
  status: AttendanceStatus
  otHours: number
  /** v2.93.0 — hours worked on a Partial Day; null for every other status. */
  workedHours: number | null
}

/** One employee row in the weekly grid: employee + the 7-day cell map + weekly total minutes. */
export interface EmpWeekRow {
  employee: EmpEmployeeDTO
  cells: Record<string, EmpScheduleCell> // keyed by YYYY-MM-DD
  weekHours: number // total worked hours across the week (incl. OT)
}

export interface EmpWeekResponse {
  weekStart: string // Sunday, YYYY-MM-DD
  days: string[] // 7 dates Sun→Sat
  rows: EmpWeekRow[]
}

/** Aggregated report row for one employee over a period. */
export interface EmpReportRow {
  employee: EmpEmployeeDTO
  present: number
  halfDay: number
  absent: number
  dayOff: number
  vacation: number
  sick: number
  maternity: number
  /** v2.93.0 — number of Partial Day entries and the hours on them. */
  partialDay: number
  partialHours: number
  otHours: number
  workedDays: number // present + 0.5 * halfDay + partialHours / 8
  totalHours: number // 8*present + 4*halfDay + partialHours + otHours
}

/** Attendance summary of one employee over a window (v2.93.0 — Employees tab / profile). */
export interface EmpAttendanceSummary {
  scheduledDays: number   // days with any entry
  workedDays: number      // present + 0.5 * half + partialHours / 8
  hours: number           // same rule as the report's Total Hours
  otHours: number
  present: number
  halfDay: number
  partialDay: number
  absent: number
  dayOff: number
  leave: number           // vacation + sick + maternity
  /** worked days ÷ days expected to work (present + half + partial + absent); null when none */
  attendanceRate: number | null
  lastEntry: string | null // YYYY-MM-DD
}

export interface EmpHistoryResponse {
  employee: EmpEmployeeDTO
  from: string
  to: string
  days: string[]            // every date in the window, oldest first
  cells: EmpScheduleCell[]  // entries in the window (missing date = no entry)
  summary: EmpAttendanceSummary
}

/** Report analytics (v2.93.0) — any range up to 186 days + the same-length previous range. */
export interface EmpAnalyticsTotals extends EmpAttendanceSummary {
  employees: number      // employees with at least one entry in the range
  /** Active employees' past days in the range (from their start date) with no entry. */
  missing: number
}

export interface EmpAnalyticsDay {
  date: string
  present: number
  halfDay: number
  partialDay: number
  absent: number
  dayOff: number
  leave: number
  hours: number
}

export interface EmpAnalyticsDept {
  department: EmpDepartment
  employees: number
  hours: number
  otHours: number
  workedDays: number
  absent: number
  attendanceRate: number | null
}

export interface EmpAnalyticsRow {
  employee: EmpEmployeeDTO
  summary: EmpAttendanceSummary
}

export interface EmpAnalyticsResponse {
  from: string
  to: string
  prevFrom: string
  prevTo: string
  days: string[]
  totals: EmpAnalyticsTotals
  previous: EmpAnalyticsTotals
  daily: EmpAnalyticsDay[]
  byDept: EmpAnalyticsDept[]
  rows: EmpAnalyticsRow[]
  /** employeeId → date → status, only for ranges ≤ 62 days (attendance map). */
  grid: Record<string, Record<string, AttendanceStatus>> | null
}

export interface EmpReportResponse {
  period: 'week' | 'month' | 'range' // 'range' = custom from/to (v2.93.0)
  from: string // YYYY-MM-DD
  to: string // YYYY-MM-DD
  label: string // e.g. "Week 21 May – 27 May 2026" / "June 2026"
  rows: EmpReportRow[]
  totals: {
    employees: number
    workedDays: number
    totalHours: number
    otHours: number
  }
}
