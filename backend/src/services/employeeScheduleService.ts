import {
  EmpDepartment,
  AttendanceStatus,
  ATTENDANCE_BASE_HOURS,
  EMP_DEPARTMENT_ORDER,
  type EmpEmployeeDTO,
  type EmpWeekResponse,
  type EmpWeekRow,
  type EmpScheduleCell,
  type EmpReportResponse,
  type EmpReportRow,
} from '@dom/shared'
import { prisma } from '../lib/prisma'

// ─── errors ─────────────────────────────────────────────────────────────────
export class EmployeeNotFoundError extends Error {}

// ─── date helpers (UTC-midnight, matches @db.Date storage) ──────────────────
/** A YYYY-MM-DD string → a UTC-midnight Date (the canonical @db.Date value). */
function dateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`)
}
/** A Date (from @db.Date) → YYYY-MM-DD string. */
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10)
}
/** Add n days to a YYYY-MM-DD string. */
function addDays(dateStr: string, n: number): string {
  const d = dateOnly(dateStr)
  d.setUTCDate(d.getUTCDate() + n)
  return fmt(d)
}
/** The Sunday (week start) of the week containing dateStr. */
function sundayOf(dateStr: string): string {
  const d = dateOnly(dateStr)
  return addDays(dateStr, -d.getUTCDay()) // getUTCDay: 0=Sun
}
/** Build an array of n consecutive YYYY-MM-DD strings starting at startStr. */
function dayRange(startStr: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(startStr, i))
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function shortDate(dateStr: string): string {
  const d = dateOnly(dateStr)
  return `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

// ─── serialization ──────────────────────────────────────────────────────────
function serEmployee(e: { id: string; empNo: number; department: string; firstName: string; lastName: string; startDate: Date }): EmpEmployeeDTO {
  return {
    id: e.id,
    empNo: e.empNo,
    department: e.department as EmpDepartment,
    firstName: e.firstName,
    lastName: e.lastName,
    startDate: fmt(e.startDate),
  }
}

/** Sort employees by department order, then empNo. */
function sortEmployees(list: EmpEmployeeDTO[]): EmpEmployeeDTO[] {
  const rank = (d: EmpDepartment) => EMP_DEPARTMENT_ORDER.indexOf(d)
  return [...list].sort((a, b) => rank(a.department) - rank(b.department) || a.empNo - b.empNo)
}

// ─── numbering ──────────────────────────────────────────────────────────────
async function nextEmpNo(tenantId: string): Promise<number> {
  const counter = await prisma.empCounter.upsert({
    where: { id: `${tenantId}:employee` },
    create: { id: `${tenantId}:employee`, value: 101 },
    update: { value: { increment: 1 } },
  })
  return counter.value
}

// ─── employees CRUD ─────────────────────────────────────────────────────────
export async function listEmployees(tenantId: string): Promise<EmpEmployeeDTO[]> {
  const rows = await prisma.empEmployee.findMany({ where: { tenantId } })
  return sortEmployees(rows.map(serEmployee))
}

export async function createEmployee(tenantId: string, input: {
  department: EmpDepartment; firstName: string; lastName: string; startDate: string
}): Promise<EmpEmployeeDTO> {
  const empNo = await nextEmpNo(tenantId)
  const created = await prisma.empEmployee.create({
    data: {
      tenantId,
      empNo,
      department: input.department,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      startDate: dateOnly(input.startDate),
    },
  })
  return serEmployee(created)
}

export async function updateEmployee(tenantId: string, id: string, input: {
  department: EmpDepartment; firstName: string; lastName: string; startDate: string
}): Promise<EmpEmployeeDTO> {
  const existing = await prisma.empEmployee.findFirst({ where: { id, tenantId } })
  if (!existing) throw new EmployeeNotFoundError()
  const updated = await prisma.empEmployee.update({
    where: { id },
    data: {
      department: input.department,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      startDate: dateOnly(input.startDate),
    },
  })
  return serEmployee(updated)
}

export async function deleteEmployee(tenantId: string, id: string): Promise<boolean> {
  const existing = await prisma.empEmployee.findFirst({ where: { id, tenantId } })
  if (!existing) return false
  // schedule rows cascade-delete via the FK relation
  await prisma.empEmployee.delete({ where: { id } })
  return true
}

// ─── schedule (weekly grid) ──────────────────────────────────────────────────
function cellHours(status: AttendanceStatus, otHours: number): number {
  const base = ATTENDANCE_BASE_HOURS[status] ?? 0
  const ot = status === AttendanceStatus.PRESENT ? otHours : 0
  return base + ot
}

export async function getWeek(tenantId: string, weekStartInput?: string): Promise<EmpWeekResponse> {
  const weekStart = sundayOf(weekStartInput && /^\d{4}-\d{2}-\d{2}$/.test(weekStartInput)
    ? weekStartInput
    : fmt(new Date()))
  const days = dayRange(weekStart, 7)

  const employees = sortEmployees((await prisma.empEmployee.findMany({ where: { tenantId } })).map(serEmployee))

  const entries = await prisma.empSchedule.findMany({
    where: { tenantId, date: { gte: dateOnly(days[0]), lte: dateOnly(days[6]) } },
  })

  // index entries by employeeId → date → cell
  const byEmp = new Map<string, Record<string, EmpScheduleCell>>()
  for (const e of entries) {
    const dateStr = fmt(e.date)
    const cell: EmpScheduleCell = { date: dateStr, status: e.status as AttendanceStatus, otHours: e.otHours }
    if (!byEmp.has(e.employeeId)) byEmp.set(e.employeeId, {})
    byEmp.get(e.employeeId)![dateStr] = cell
  }

  const rows: EmpWeekRow[] = employees.map((emp) => {
    const cells = byEmp.get(emp.id) ?? {}
    const weekHours = Object.values(cells).reduce((sum, c) => sum + cellHours(c.status, c.otHours), 0)
    return { employee: emp, cells, weekHours }
  })

  return { weekStart, days, rows }
}

/** Upsert one cell. status === null clears (deletes) the cell. */
export async function setCell(tenantId: string, input: {
  employeeId: string; date: string; status: AttendanceStatus | null; otHours: number
}): Promise<EmpScheduleCell | null> {
  const employee = await prisma.empEmployee.findFirst({ where: { id: input.employeeId, tenantId } })
  if (!employee) throw new EmployeeNotFoundError()

  const date = dateOnly(input.date)

  // clear → delete the row if present
  if (input.status === null) {
    await prisma.empSchedule.deleteMany({ where: { tenantId, employeeId: input.employeeId, date } })
    return null
  }

  const otHours = input.status === AttendanceStatus.PRESENT ? Math.max(0, Math.min(5, input.otHours || 0)) : 0

  const saved = await prisma.empSchedule.upsert({
    where: { tenantId_employeeId_date: { tenantId, employeeId: input.employeeId, date } },
    create: { tenantId, employeeId: input.employeeId, date, status: input.status, otHours },
    update: { status: input.status, otHours },
  })
  return { date: fmt(saved.date), status: saved.status as AttendanceStatus, otHours: saved.otHours }
}

// ─── report (weekly / monthly aggregation) ───────────────────────────────────
function emptyAgg(employee: EmpEmployeeDTO): EmpReportRow {
  return {
    employee,
    present: 0, halfDay: 0, absent: 0, vacation: 0, sick: 0, maternity: 0,
    otHours: 0, workedDays: 0, totalHours: 0,
  }
}

export async function getReport(tenantId: string, period: 'week' | 'month', dateInput?: string): Promise<EmpReportResponse> {
  const anchor = dateInput && /^\d{4}-\d{2}-\d{2}$/.test(dateInput) ? dateInput : fmt(new Date())

  let from: string
  let to: string
  let label: string
  if (period === 'month') {
    const d = dateOnly(anchor)
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth()
    from = fmt(new Date(Date.UTC(y, m, 1)))
    to = fmt(new Date(Date.UTC(y, m + 1, 0)))
    label = `${MONTHS[m]} ${y}`
  } else {
    from = sundayOf(anchor)
    to = addDays(from, 6)
    label = `${shortDate(from)} – ${shortDate(to)}`
  }

  const employees = sortEmployees((await prisma.empEmployee.findMany({ where: { tenantId } })).map(serEmployee))
  const entries = await prisma.empSchedule.findMany({
    where: { tenantId, date: { gte: dateOnly(from), lte: dateOnly(to) } },
  })

  const aggByEmp = new Map<string, EmpReportRow>()
  for (const emp of employees) aggByEmp.set(emp.id, emptyAgg(emp))

  for (const e of entries) {
    const agg = aggByEmp.get(e.employeeId)
    if (!agg) continue
    const status = e.status as AttendanceStatus
    switch (status) {
      case AttendanceStatus.PRESENT: agg.present++; break
      case AttendanceStatus.HALF_DAY: agg.halfDay++; break
      case AttendanceStatus.ABSENT: agg.absent++; break
      case AttendanceStatus.VACATION_LEAVE: agg.vacation++; break
      case AttendanceStatus.SICK_LEAVE: agg.sick++; break
      case AttendanceStatus.MATERNITY_LEAVE: agg.maternity++; break
    }
    if (status === AttendanceStatus.PRESENT) agg.otHours += e.otHours
  }

  const rows = employees.map((emp) => {
    const agg = aggByEmp.get(emp.id)!
    agg.workedDays = agg.present + 0.5 * agg.halfDay
    agg.totalHours = 8 * agg.present + 4 * agg.halfDay + agg.otHours
    return agg
  })

  const totals = rows.reduce(
    (acc, r) => {
      acc.workedDays += r.workedDays
      acc.totalHours += r.totalHours
      acc.otHours += r.otHours
      return acc
    },
    { employees: rows.length, workedDays: 0, totalHours: 0, otHours: 0 },
  )

  return { period, from, to, label, rows, totals }
}
