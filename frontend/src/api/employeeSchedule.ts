import { api } from './client'
import type {
  EmpDepartment,
  AttendanceStatus,
  EmpEmployeeDTO,
  EmpWeekResponse,
  EmpScheduleCell,
  EmpReportResponse,
  EmpAttendanceSummary,
  EmpHistoryResponse,
  EmpAnalyticsResponse,
} from '@dom/shared'

// ─── Employees ───────────────────────────────────────────────────────────────

export interface EmployeeInput {
  department: EmpDepartment
  firstName: string
  lastName: string
  startDate: string // YYYY-MM-DD
  contactNumber?: string | null
  email?: string | null
  address?: string | null
  birthday?: string | null // YYYY-MM-DD
  emergencyContactName?: string | null
  emergencyContactNumber?: string | null
  isActive?: boolean
  leaveDate?: string | null // YYYY-MM-DD — required when isActive=false
  userIds?: string[] // linked system logins — one employee can own several (v2.88.0)
}

export interface LinkableUser {
  id: string
  username: string
  role: string
  linkedEmployeeId: string | null
}

/** Active picker/packer logins that can be linked to an employee (v2.84.0). */
export async function listLinkableUsers(): Promise<LinkableUser[]> {
  const res = await api.get<LinkableUser[]>('/employee-schedule/linkable-users')
  return res.data
}

export async function listEmployees(): Promise<EmpEmployeeDTO[]> {
  const res = await api.get<EmpEmployeeDTO[]>('/employee-schedule/employees')
  return res.data
}

export async function createEmployee(input: EmployeeInput): Promise<EmpEmployeeDTO> {
  const res = await api.post<EmpEmployeeDTO>('/employee-schedule/employees', input)
  return res.data
}

export async function updateEmployee(id: string, input: EmployeeInput): Promise<EmpEmployeeDTO> {
  const res = await api.put<EmpEmployeeDTO>(`/employee-schedule/employees/${id}`, input)
  return res.data
}

export async function deleteEmployee(id: string): Promise<void> {
  await api.delete(`/employee-schedule/employees/${id}`)
}

// ─── Attendance summaries + profile history (v2.93.0, read-only) ─────────────

export type HistoryDays = 30 | 90 | 180

export async function getAttendanceSummaries(days: HistoryDays): Promise<{ from: string; to: string; byEmployee: Record<string, EmpAttendanceSummary> }> {
  const res = await api.get('/employee-schedule/employees/attendance-summary', { params: { days } })
  return res.data
}

export async function getEmployeeHistory(id: string, days: HistoryDays): Promise<EmpHistoryResponse> {
  const res = await api.get<EmpHistoryResponse>(`/employee-schedule/employees/${id}/history`, { params: { days } })
  return res.data
}

// ─── Schedule (weekly grid) ──────────────────────────────────────────────────

export async function getWeek(weekStart?: string): Promise<EmpWeekResponse> {
  const res = await api.get<EmpWeekResponse>('/employee-schedule/schedule', {
    params: weekStart ? { weekStart } : {},
  })
  return res.data
}

export interface SetCellInput {
  employeeId: string
  date: string
  status: AttendanceStatus | null // null clears the cell
  otHours: number
  workedHours?: number | null // v2.93.0 — required for Partial Day (0.5–7.5)
}

export async function setCell(input: SetCellInput): Promise<{ cell: EmpScheduleCell | null }> {
  const res = await api.put<{ cell: EmpScheduleCell | null }>('/employee-schedule/schedule', input)
  return res.data
}

// ─── Bulk fill (v2.93.0) — the server only ever fills EMPTY cells ─────────────

export interface BulkCell {
  employeeId: string
  date: string
  status: AttendanceStatus
  otHours?: number
  workedHours?: number | null
}

export interface BulkFillResult {
  created: (EmpScheduleCell & { employeeId: string })[]
  skipped: number
}

export async function fillEmptyCells(cells: BulkCell[]): Promise<BulkFillResult> {
  const res = await api.post<BulkFillResult>('/employee-schedule/schedule/fill', { cells })
  return res.data
}

export async function copyPreviousWeek(weekStart: string): Promise<BulkFillResult> {
  const res = await api.post<BulkFillResult>('/employee-schedule/schedule/copy-previous-week', { weekStart })
  return res.data
}

/** Undo a bulk fill: removes exactly those cells, only if they still hold the same status. */
export async function undoFill(cells: { employeeId: string; date: string; status: AttendanceStatus }[]): Promise<{ removed: number }> {
  const res = await api.post<{ removed: number }>('/employee-schedule/schedule/undo-fill', { cells })
  return res.data
}

export function apiErrorMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback
}

// ─── Report ──────────────────────────────────────────────────────────────────

export async function getReport(period: 'week' | 'month', date?: string): Promise<EmpReportResponse> {
  const res = await api.get<EmpReportResponse>('/employee-schedule/report', {
    params: { period, ...(date ? { date } : {}) },
  })
  return res.data
}

/** Build an export URL (CSV/PDF). The browser-blob download is done by the caller. */
export function reportExportUrl(kind: 'csv' | 'pdf', period: 'week' | 'month', date?: string): string {
  const qs = new URLSearchParams({ period, ...(date ? { date } : {}) }).toString()
  return `/employee-schedule/report/export.${kind}?${qs}`
}

/** Download an export through the cookie-auth axios client (blob), mirroring downloadInvoicePdf. */
export async function downloadReportExport(kind: 'csv' | 'pdf', period: 'week' | 'month', date?: string): Promise<void> {
  const res = await api.get(reportExportUrl(kind, period, date), { responseType: 'blob' })
  const url = window.URL.createObjectURL(res.data as Blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `employee-schedule-${period}.${kind}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

// ─── Report analytics + range exports (v2.93.0) ─────────────────────────────

export async function getReportAnalytics(from: string, to: string, department?: EmpDepartment): Promise<EmpAnalyticsResponse> {
  const res = await api.get<EmpAnalyticsResponse>('/employee-schedule/report/analytics', {
    params: { from, to, ...(department ? { department } : {}) },
  })
  return res.data
}

/** CSV / PDF for any from–to range (same columns and formulas as the week / month export). */
export async function downloadRangeExport(kind: 'csv' | 'pdf', from: string, to: string): Promise<void> {
  const qs = new URLSearchParams({ from, to }).toString()
  const res = await api.get(`/employee-schedule/report/export.${kind}?${qs}`, { responseType: 'blob' })
  const url = window.URL.createObjectURL(res.data as Blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `employee-schedule-${from}_${to}.${kind}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}
