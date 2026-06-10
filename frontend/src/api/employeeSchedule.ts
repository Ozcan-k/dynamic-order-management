import { api } from './client'
import type {
  EmpDepartment,
  AttendanceStatus,
  EmpEmployeeDTO,
  EmpWeekResponse,
  EmpScheduleCell,
  EmpReportResponse,
} from '@dom/shared'

// ─── Employees ───────────────────────────────────────────────────────────────

export interface EmployeeInput {
  department: EmpDepartment
  firstName: string
  lastName: string
  startDate: string // YYYY-MM-DD
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
}

export async function setCell(input: SetCellInput): Promise<{ cell: EmpScheduleCell | null }> {
  const res = await api.put<{ cell: EmpScheduleCell | null }>('/employee-schedule/schedule', input)
  return res.data
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
