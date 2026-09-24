import {
  UserRole,
  EmpDepartment,
  AttendanceStatus,
  EMP_DEPARTMENT_ORDER,
  FULL_DAY_HOURS,
  MAX_OT_HOURS,
  cellWorkedHours,
  isValidPartialHours,
  type EmpEmployeeDTO,
  type EmpWeekResponse,
  type EmpWeekRow,
  type EmpScheduleCell,
  type EmpReportResponse,
  type EmpReportRow,
  type EmpAttendanceSummary,
  type EmpHistoryResponse,
  type EmpAnalyticsResponse,
  type EmpAnalyticsTotals,
  type EmpAnalyticsDay,
  type EmpAnalyticsDept,
} from '@dom/shared'
import { prisma } from '../lib/prisma'

// ─── errors ─────────────────────────────────────────────────────────────────
export class EmployeeNotFoundError extends Error {}
/** Invalid schedule cell (e.g. Partial Day without valid hours) — v2.93.0. */
export class ScheduleCellError extends Error {}
/** Invalid or conflicting system-user link (v2.84.0). */
export class EmployeeLinkError extends Error {
  constructor(message: string, public readonly statusCode: 400 | 409) { super(message) }
}

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
interface EmpRow {
  id: string; empNo: number; department: string; firstName: string; lastName: string; startDate: Date
  contactNumber: string | null; email: string | null; address: string | null; birthday: Date | null
  emergencyContactName: string | null; emergencyContactNumber: string | null
  isActive: boolean; leaveDate: Date | null
  users?: { id: string }[]
}
/** Pulls the linked logins along with an employee row (serEmployee → userIds). */
const WITH_USERS = { users: { select: { id: true } } } as const
function serEmployee(e: EmpRow): EmpEmployeeDTO {
  return {
    id: e.id,
    empNo: e.empNo,
    department: e.department as EmpDepartment,
    firstName: e.firstName,
    lastName: e.lastName,
    startDate: fmt(e.startDate),
    contactNumber: e.contactNumber,
    email: e.email,
    address: e.address,
    birthday: e.birthday ? fmt(e.birthday) : null,
    emergencyContactName: e.emergencyContactName,
    emergencyContactNumber: e.emergencyContactNumber,
    isActive: e.isActive,
    leaveDate: e.leaveDate ? fmt(e.leaveDate) : null,
    userIds: (e.users ?? []).map((u) => u.id),
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
    create: { id: `${tenantId}:employee`, value: 1001 },
    update: { value: { increment: 1 } },
  })
  return counter.value
}

/**
 * v2.86.0 — employee IDs are 4 digits: the old 3-digit numbers shift by 900
 * (101 → 1001, 104 → 1004) and the counter follows. Idempotent (only rows below
 * 1000 move), so it is safe to run on every startup.
 */
export async function migrateEmpNosToFourDigit(): Promise<number> {
  const [shifted] = await prisma.$transaction([
    prisma.$executeRaw`UPDATE emp_employees SET emp_no = emp_no + 900 WHERE emp_no < 1000`,
    prisma.$executeRaw`UPDATE emp_counters SET value = value + 900 WHERE value < 1000`,
  ])
  return shifted
}

/**
 * v2.88.0 — the login link moved from EmpEmployee.userId (one login) to User.employeeId
 * (one employee → many logins). Copies any old link across and clears the old column.
 * Idempotent, safe on every startup.
 */
export async function migrateEmployeeLinksToUsers(): Promise<number> {
  const [moved] = await prisma.$transaction([
    prisma.$executeRaw`UPDATE users u SET employee_id = e.id FROM emp_employees e WHERE e.user_id = u.id AND u.employee_id IS NULL`,
    prisma.$executeRaw`UPDATE emp_employees SET user_id = NULL WHERE user_id IS NOT NULL`,
  ])
  return moved
}

// ─── employees CRUD ─────────────────────────────────────────────────────────
export async function listEmployees(tenantId: string): Promise<EmpEmployeeDTO[]> {
  const rows = await prisma.empEmployee.findMany({ where: { tenantId }, include: WITH_USERS })
  return sortEmployees(rows.map(serEmployee))
}

export interface EmployeeInput {
  department: EmpDepartment
  firstName: string
  lastName: string
  startDate: string
  contactNumber?: string | null
  email?: string | null
  address?: string | null
  birthday?: string | null
  emergencyContactName?: string | null
  emergencyContactNumber?: string | null
  isActive?: boolean
  leaveDate?: string | null
  /** Linked logins (v2.88.0). undefined = leave unchanged, [] = unlink all. */
  userIds?: string[]
}

const trimOrNull = (v?: string | null) => {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

function buildData(input: EmployeeInput) {
  const isActive = input.isActive ?? true
  return {
    department: input.department,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    startDate: dateOnly(input.startDate),
    contactNumber: trimOrNull(input.contactNumber),
    email: trimOrNull(input.email),
    address: trimOrNull(input.address),
    birthday: input.birthday ? dateOnly(input.birthday) : null,
    emergencyContactName: trimOrNull(input.emergencyContactName),
    emergencyContactNumber: trimOrNull(input.emergencyContactNumber),
    isActive,
    // a leave date only makes sense for an inactive employee
    leaveDate: !isActive && input.leaveDate ? dateOnly(input.leaveDate) : null,
  }
}

/**
 * Links must point at users of this tenant (any role) that are not already linked
 * to a different employee. An employee may own several logins (v2.88.0).
 */
async function assertLinkable(tenantId: string, userIds: string[] | undefined, employeeId: string | null) {
  if (!userIds?.length) return
  const ids = [...new Set(userIds)]
  const users = await prisma.user.findMany({
    where: { id: { in: ids }, tenantId },
    select: { username: true, employee: { select: { id: true, empNo: true } } },
  })
  if (users.length !== ids.length) throw new EmployeeLinkError('Linked user not found', 400)
  const taken = users.find((u) => u.employee && u.employee.id !== employeeId)
  if (taken) {
    throw new EmployeeLinkError(`${taken.username} is already linked to employee ${taken.employee!.empNo}`, 409)
  }
}

/** The relation write for a userIds list — undefined leaves the links untouched. */
function usersWrite(userIds: string[] | undefined, mode: 'connect' | 'set') {
  if (userIds === undefined) return {}
  return { users: { [mode]: [...new Set(userIds)].map((id) => ({ id })) } }
}

/** Active accounts (any role) that can be linked, with the employee they are linked to (if any). */
export async function listLinkableUsers(tenantId: string): Promise<{ id: string; username: string; role: UserRole; linkedEmployeeId: string | null }[]> {
  const users = await prisma.user.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, username: true, role: true, employeeId: true },
    orderBy: [{ role: 'asc' }, { username: 'asc' }],
  })
  return users.map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role as UserRole,
    linkedEmployeeId: u.employeeId,
  }))
}

export async function createEmployee(tenantId: string, input: EmployeeInput): Promise<EmpEmployeeDTO> {
  await assertLinkable(tenantId, input.userIds, null)
  const empNo = await nextEmpNo(tenantId)
  const created = await prisma.empEmployee.create({
    data: { tenantId, empNo, ...buildData(input), ...usersWrite(input.userIds, 'connect') },
    include: WITH_USERS,
  })
  return serEmployee(created)
}

export async function updateEmployee(tenantId: string, id: string, input: EmployeeInput): Promise<EmpEmployeeDTO> {
  const existing = await prisma.empEmployee.findFirst({ where: { id, tenantId } })
  if (!existing) throw new EmployeeNotFoundError()
  await assertLinkable(tenantId, input.userIds, id)
  const updated = await prisma.empEmployee.update({
    where: { id },
    data: { ...buildData(input), ...usersWrite(input.userIds, 'set') },
    include: WITH_USERS,
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
function cellHours(status: AttendanceStatus, otHours: number, workedHours: number | null): number {
  return cellWorkedHours(status, otHours, workedHours)
}

export async function getWeek(tenantId: string, weekStartInput?: string): Promise<EmpWeekResponse> {
  const weekStart = sundayOf(weekStartInput && /^\d{4}-\d{2}-\d{2}$/.test(weekStartInput)
    ? weekStartInput
    : fmt(new Date()))
  const days = dayRange(weekStart, 7)

  // only active employees are schedulable
  const employees = sortEmployees((await prisma.empEmployee.findMany({ where: { tenantId, isActive: true } })).map(serEmployee))

  const entries = await prisma.empSchedule.findMany({
    where: { tenantId, date: { gte: dateOnly(days[0]), lte: dateOnly(days[6]) } },
  })

  // index entries by employeeId → date → cell
  const byEmp = new Map<string, Record<string, EmpScheduleCell>>()
  for (const e of entries) {
    const dateStr = fmt(e.date)
    const cell: EmpScheduleCell = { date: dateStr, status: e.status as AttendanceStatus, otHours: e.otHours, workedHours: e.workedHours }
    if (!byEmp.has(e.employeeId)) byEmp.set(e.employeeId, {})
    byEmp.get(e.employeeId)![dateStr] = cell
  }

  const rows: EmpWeekRow[] = employees.map((emp) => {
    const cells = byEmp.get(emp.id) ?? {}
    const weekHours = Object.values(cells).reduce((sum, c) => sum + cellHours(c.status, c.otHours, c.workedHours), 0)
    return { employee: emp, cells, weekHours }
  })

  return { weekStart, days, rows }
}

/** Upsert one cell. status === null clears (deletes) the cell. */
export async function setCell(tenantId: string, input: {
  employeeId: string; date: string; status: AttendanceStatus | null; otHours: number; workedHours?: number | null
}): Promise<EmpScheduleCell | null> {
  const employee = await prisma.empEmployee.findFirst({ where: { id: input.employeeId, tenantId } })
  if (!employee) throw new EmployeeNotFoundError()

  const date = dateOnly(input.date)

  // clear → delete the row if present
  if (input.status === null) {
    await prisma.empSchedule.deleteMany({ where: { tenantId, employeeId: input.employeeId, date } })
    return null
  }

  const otHours = input.status === AttendanceStatus.PRESENT ? Math.max(0, Math.min(MAX_OT_HOURS, input.otHours || 0)) : 0
  // Partial Day must carry its hours; every other status stores NULL (hours come from the status)
  let workedHours: number | null = null
  if (input.status === AttendanceStatus.PARTIAL_DAY) {
    if (!isValidPartialHours(input.workedHours)) {
      throw new ScheduleCellError('Partial Day needs the hours worked: 0.5 to 7.5, in half-hour steps')
    }
    workedHours = input.workedHours
  }

  const saved = await prisma.empSchedule.upsert({
    where: { tenantId_employeeId_date: { tenantId, employeeId: input.employeeId, date } },
    create: { tenantId, employeeId: input.employeeId, date, status: input.status, otHours, workedHours },
    update: { status: input.status, otHours, workedHours },
  })
  return { date: fmt(saved.date), status: saved.status as AttendanceStatus, otHours: saved.otHours, workedHours: saved.workedHours }
}

// ─── bulk fill (v2.93.0) — only ever fills EMPTY cells ───────────────────────
export interface BulkCellInput {
  employeeId: string
  date: string
  status: AttendanceStatus
  otHours?: number
  workedHours?: number | null
}

export interface BulkFillResult {
  /** Cells actually written (were empty). Returned so the UI can offer an exact Undo. */
  created: EmpScheduleCellWithEmployee[]
  /** Cells left alone because they already had an entry (or the employee is inactive). */
  skipped: number
}

export interface EmpScheduleCellWithEmployee extends EmpScheduleCell {
  employeeId: string
}

/**
 * Writes the given cells **only where no entry exists yet**. Existing entries are never
 * touched: rows are inserted with `skipDuplicates` on the (tenant, employee, date) unique
 * key, so even a concurrent edit cannot be overwritten. Inactive / foreign employees are
 * skipped. Partial Day cells must carry valid hours.
 */
export async function fillEmptyCells(tenantId: string, cells: BulkCellInput[]): Promise<BulkFillResult> {
  if (cells.length === 0) return { created: [], skipped: 0 }
  const employeeIds = [...new Set(cells.map((c) => c.employeeId))]
  const active = new Set((await prisma.empEmployee.findMany({
    where: { tenantId, id: { in: employeeIds }, isActive: true },
    select: { id: true },
  })).map((e) => e.id))

  const rows = []
  for (const c of cells) {
    if (!active.has(c.employeeId)) continue
    let workedHours: number | null = null
    if (c.status === AttendanceStatus.PARTIAL_DAY) {
      if (!isValidPartialHours(c.workedHours)) throw new ScheduleCellError('Partial Day needs the hours worked: 0.5 to 7.5, in half-hour steps')
      workedHours = c.workedHours
    }
    const otHours = c.status === AttendanceStatus.PRESENT ? Math.max(0, Math.min(MAX_OT_HOURS, c.otHours || 0)) : 0
    rows.push({ tenantId, employeeId: c.employeeId, date: dateOnly(c.date), status: c.status, otHours, workedHours })
  }

  // which of them are empty right now (for the exact created list)
  const existing = await prisma.empSchedule.findMany({
    where: { tenantId, OR: rows.map((r) => ({ employeeId: r.employeeId, date: r.date })) },
    select: { employeeId: true, date: true },
  })
  const taken = new Set(existing.map((e) => `${e.employeeId}|${fmt(e.date)}`))
  const toCreate = rows.filter((r) => !taken.has(`${r.employeeId}|${fmt(r.date)}`))
  if (toCreate.length > 0) {
    await prisma.empSchedule.createMany({ data: toCreate, skipDuplicates: true })
  }
  return {
    created: toCreate.map((r) => ({ employeeId: r.employeeId, date: fmt(r.date), status: r.status, otHours: r.otHours, workedHours: r.workedHours })),
    skipped: cells.length - toCreate.length,
  }
}

/** Copy the previous week's entries into this week's EMPTY cells (active employees only). */
export async function copyPreviousWeek(tenantId: string, weekStartInput: string): Promise<BulkFillResult> {
  const weekStart = sundayOf(weekStartInput)
  const prevStart = addDays(weekStart, -7)
  const prev = await prisma.empSchedule.findMany({
    where: {
      tenantId,
      date: { gte: dateOnly(prevStart), lte: dateOnly(addDays(prevStart, 6)) },
      employee: { isActive: true },
    },
  })
  return fillEmptyCells(tenantId, prev.map((e) => ({
    employeeId: e.employeeId,
    date: addDays(fmt(e.date), 7),
    status: e.status as AttendanceStatus,
    otHours: e.otHours,
    workedHours: e.workedHours,
  })))
}

/**
 * Undo of a bulk fill: deletes exactly the listed cells, and only while each one still
 * holds the status it was created with (a cell edited since then is kept).
 */
export async function undoBulkFill(tenantId: string, cells: { employeeId: string; date: string; status: AttendanceStatus }[]): Promise<number> {
  if (cells.length === 0) return 0
  const res = await prisma.empSchedule.deleteMany({
    where: { tenantId, OR: cells.map((c) => ({ employeeId: c.employeeId, date: dateOnly(c.date), status: c.status })) },
  })
  return res.count
}

// ─── attendance summaries (v2.93.0 — Employees tab + profile; read-only) ─────
type SummaryEntry = { date: Date; status: string; otHours: number; workedHours: number | null }

function summarize(entries: SummaryEntry[]): EmpAttendanceSummary {
  const s: EmpAttendanceSummary = {
    scheduledDays: entries.length, workedDays: 0, hours: 0, otHours: 0,
    present: 0, halfDay: 0, partialDay: 0, absent: 0, dayOff: 0, leave: 0,
    attendanceRate: null, lastEntry: null,
  }
  let partialHours = 0
  for (const e of entries) {
    const st = e.status as AttendanceStatus
    if (st === AttendanceStatus.PRESENT) { s.present++; s.otHours += e.otHours }
    else if (st === AttendanceStatus.HALF_DAY) s.halfDay++
    else if (st === AttendanceStatus.PARTIAL_DAY) { s.partialDay++; partialHours += e.workedHours ?? 0 }
    else if (st === AttendanceStatus.ABSENT) s.absent++
    else if (st === AttendanceStatus.DAY_OFF) s.dayOff++
    else s.leave++
    s.hours += cellWorkedHours(st, e.otHours, e.workedHours)
    const d = fmt(e.date)
    if (!s.lastEntry || d > s.lastEntry) s.lastEntry = d
  }
  // same formulas as the report (Worked Days / Total Hours)
  s.workedDays = s.present + 0.5 * s.halfDay + partialHours / FULL_DAY_HOURS
  const expected = s.present + s.halfDay + s.partialDay + s.absent
  s.attendanceRate = expected > 0 ? (s.present + s.halfDay + s.partialDay) / expected : null
  return s
}

/** The last `days` Manila days ending today (inclusive). */
function windowOf(days: number): { from: string; to: string } {
  const to = fmt(new Date(Date.now() + 8 * 3600_000))
  return { from: addDays(to, -(days - 1)), to }
}

/** Per-employee attendance summary for the last `days` days (Employees list). */
export async function getAttendanceSummaries(tenantId: string, days: number): Promise<{ from: string; to: string; byEmployee: Record<string, EmpAttendanceSummary> }> {
  const { from, to } = windowOf(days)
  const entries = await prisma.empSchedule.findMany({
    where: { tenantId, date: { gte: dateOnly(from), lte: dateOnly(to) } },
    select: { employeeId: true, date: true, status: true, otHours: true, workedHours: true },
  })
  const grouped = new Map<string, SummaryEntry[]>()
  for (const e of entries) {
    if (!grouped.has(e.employeeId)) grouped.set(e.employeeId, [])
    grouped.get(e.employeeId)!.push(e)
  }
  const byEmployee: Record<string, EmpAttendanceSummary> = {}
  for (const [id, list] of grouped) byEmployee[id] = summarize(list)
  return { from, to, byEmployee }
}

/** One employee's cells + summary for the last `days` days (profile panel). */
export async function getEmployeeHistory(tenantId: string, employeeId: string, days: number): Promise<EmpHistoryResponse> {
  const row = await prisma.empEmployee.findFirst({ where: { id: employeeId, tenantId }, include: WITH_USERS })
  if (!row) throw new EmployeeNotFoundError()
  const { from, to } = windowOf(days)
  const entries = await prisma.empSchedule.findMany({
    where: { tenantId, employeeId, date: { gte: dateOnly(from), lte: dateOnly(to) } },
    orderBy: { date: 'asc' },
    select: { date: true, status: true, otHours: true, workedHours: true },
  })
  return {
    employee: serEmployee(row),
    from,
    to,
    days: dayRange(from, days),
    cells: entries.map((e) => ({ date: fmt(e.date), status: e.status as AttendanceStatus, otHours: e.otHours, workedHours: e.workedHours })),
    summary: summarize(entries),
  }
}

// ─── report analytics (v2.93.0, read-only) ───────────────────────────────────
export class RangeError400 extends Error {}
export const MAX_ANALYTICS_DAYS = 186

function daysBetween(from: string, to: string): number {
  return Math.round((dateOnly(to).getTime() - dateOnly(from).getTime()) / 86_400_000) + 1
}

export async function getReportAnalytics(tenantId: string, from: string, to: string, department?: EmpDepartment): Promise<EmpAnalyticsResponse> {
  if (from > to) throw new RangeError400('"from" must be on or before "to"')
  const n = daysBetween(from, to)
  if (n > MAX_ANALYTICS_DAYS) throw new RangeError400(`Pick at most ${MAX_ANALYTICS_DAYS} days`)
  const prevTo = addDays(from, -1)
  const prevFrom = addDays(prevTo, -(n - 1))
  const days = dayRange(from, n)
  const today = fmt(new Date(Date.now() + 8 * 3600_000))

  const [empRows, entries] = await Promise.all([
    prisma.empEmployee.findMany({ where: { tenantId, ...(department ? { department } : {}) }, include: WITH_USERS }),
    prisma.empSchedule.findMany({
      where: { tenantId, date: { gte: dateOnly(prevFrom), lte: dateOnly(to) }, ...(department ? { employee: { department } } : {}) },
      select: { employeeId: true, date: true, status: true, otHours: true, workedHours: true },
    }),
  ])
  const employees = sortEmployees(empRows.map(serEmployee))
  const cur = entries.filter((e) => fmt(e.date) >= from)
  const prev = entries.filter((e) => fmt(e.date) < from)

  const byEmp = new Map<string, typeof cur>()
  for (const e of cur) {
    if (!byEmp.has(e.employeeId)) byEmp.set(e.employeeId, [])
    byEmp.get(e.employeeId)!.push(e)
  }
  const rows = employees
    .filter((emp) => emp.isActive || byEmp.has(emp.id))
    .map((emp) => ({ employee: emp, summary: summarize(byEmp.get(emp.id) ?? []) }))

  // missing = active employees' past days (from their start date) with no entry
  let missing = 0
  for (const emp of employees) {
    if (!emp.isActive) continue
    const have = new Set((byEmp.get(emp.id) ?? []).map((e) => fmt(e.date)))
    for (const d of days) if (d <= today && d >= emp.startDate && !have.has(d)) missing++
  }
  const totalsOf = (list: typeof cur, extraMissing: number): EmpAnalyticsTotals => ({
    ...summarize(list),
    employees: new Set(list.map((e) => e.employeeId)).size,
    missing: extraMissing,
  })

  const dayIdx = new Map(days.map((d, i) => [d, i]))
  const daily: EmpAnalyticsDay[] = days.map((d) => ({ date: d, present: 0, halfDay: 0, partialDay: 0, absent: 0, dayOff: 0, leave: 0, hours: 0 }))
  for (const e of cur) {
    const day = daily[dayIdx.get(fmt(e.date))!]
    const st = e.status as AttendanceStatus
    if (st === AttendanceStatus.PRESENT) day.present++
    else if (st === AttendanceStatus.HALF_DAY) day.halfDay++
    else if (st === AttendanceStatus.PARTIAL_DAY) day.partialDay++
    else if (st === AttendanceStatus.ABSENT) day.absent++
    else if (st === AttendanceStatus.DAY_OFF) day.dayOff++
    else day.leave++
    day.hours += cellWorkedHours(st, e.otHours, e.workedHours)
  }

  const deptOf = new Map(employees.map((e) => [e.id, e.department]))
  const byDept: EmpAnalyticsDept[] = EMP_DEPARTMENT_ORDER.map((dept) => {
    const list = cur.filter((e) => deptOf.get(e.employeeId) === dept)
    const s = summarize(list)
    return {
      department: dept,
      employees: new Set(list.map((e) => e.employeeId)).size,
      hours: s.hours, otHours: s.otHours, workedDays: s.workedDays, absent: s.absent, attendanceRate: s.attendanceRate,
    }
  }).filter((d) => d.employees > 0)

  let grid: EmpAnalyticsResponse['grid'] = null
  if (n <= 62) {
    grid = {}
    for (const e of cur) (grid[e.employeeId] ??= {})[fmt(e.date)] = e.status as AttendanceStatus
  }

  return {
    from, to, prevFrom, prevTo, days,
    totals: totalsOf(cur, missing),
    previous: totalsOf(prev, 0),
    daily, byDept, rows, grid,
  }
}

// ─── report (weekly / monthly aggregation) ───────────────────────────────────
function emptyAgg(employee: EmpEmployeeDTO): EmpReportRow {
  return {
    employee,
    present: 0, halfDay: 0, absent: 0, dayOff: 0, vacation: 0, sick: 0, maternity: 0,
    partialDay: 0, partialHours: 0,
    otHours: 0, workedDays: 0, totalHours: 0,
  }
}

/** Report for a custom from/to range (v2.93.0) — same aggregation as the week / month report. */
export async function getReportForRange(tenantId: string, from: string, to: string): Promise<EmpReportResponse> {
  return buildReport(tenantId, 'range', from, to, `${shortDate(from)} – ${shortDate(to)}`)
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
  return buildReport(tenantId, period, from, to, label)
}

async function buildReport(tenantId: string, period: EmpReportResponse['period'], from: string, to: string, label: string): Promise<EmpReportResponse> {
  const employees = sortEmployees((await prisma.empEmployee.findMany({ where: { tenantId } })).map(serEmployee))
  const entries = await prisma.empSchedule.findMany({
    where: { tenantId, date: { gte: dateOnly(from), lte: dateOnly(to) } },
  })

  // employees that have at least one entry in the period (so inactive staff still
  // appear in the historical periods they actually worked)
  const withEntries = new Set(entries.map((e) => e.employeeId))

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
      case AttendanceStatus.DAY_OFF: agg.dayOff++; break
      case AttendanceStatus.VACATION_LEAVE: agg.vacation++; break
      case AttendanceStatus.SICK_LEAVE: agg.sick++; break
      case AttendanceStatus.MATERNITY_LEAVE: agg.maternity++; break
      case AttendanceStatus.PARTIAL_DAY: agg.partialDay++; agg.partialHours += e.workedHours ?? 0; break
    }
    if (status === AttendanceStatus.PRESENT) agg.otHours += e.otHours
  }

  const rows = employees
    .filter((emp) => emp.isActive || withEntries.has(emp.id))
    .map((emp) => {
      const agg = aggByEmp.get(emp.id)!
      // Partial Day adds its own hours (and hours / 8 of a day); rows without Partial Day
      // compute exactly as before v2.93.0.
      agg.workedDays = agg.present + 0.5 * agg.halfDay + agg.partialHours / FULL_DAY_HOURS
      agg.totalHours = 8 * agg.present + 4 * agg.halfDay + agg.partialHours + agg.otHours
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
