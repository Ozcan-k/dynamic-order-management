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
  VACATION_LEAVE = 'VACATION_LEAVE',
  SICK_LEAVE = 'SICK_LEAVE',
  HALF_DAY = 'HALF_DAY',
  MATERNITY_LEAVE = 'MATERNITY_LEAVE',
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
  [AttendanceStatus.VACATION_LEAVE]: 'Vacation Leave',
  [AttendanceStatus.SICK_LEAVE]: 'Sick Leave',
  [AttendanceStatus.HALF_DAY]: 'Half Day',
  [AttendanceStatus.MATERNITY_LEAVE]: 'Maternity Leave',
}

/** Base worked hours per status (excludes OT). Present = 8, Half Day = 4, rest = 0. */
export const ATTENDANCE_BASE_HOURS: Record<AttendanceStatus, number> = {
  [AttendanceStatus.PRESENT]: 8,
  [AttendanceStatus.HALF_DAY]: 4,
  [AttendanceStatus.ABSENT]: 0,
  [AttendanceStatus.VACATION_LEAVE]: 0,
  [AttendanceStatus.SICK_LEAVE]: 0,
  [AttendanceStatus.MATERNITY_LEAVE]: 0,
}

/** Max overtime hours selectable on a Present day. */
export const MAX_OT_HOURS = 5

export interface EmpEmployeeDTO {
  id: string
  empNo: number
  department: EmpDepartment
  firstName: string
  lastName: string
  startDate: string // YYYY-MM-DD
}

/** One schedule cell (a day's attendance for an employee). */
export interface EmpScheduleCell {
  date: string // YYYY-MM-DD
  status: AttendanceStatus
  otHours: number
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
  vacation: number
  sick: number
  maternity: number
  otHours: number
  workedDays: number // present + 0.5 * halfDay
  totalHours: number // 8*present + 4*halfDay + otHours
}

export interface EmpReportResponse {
  period: 'week' | 'month'
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
