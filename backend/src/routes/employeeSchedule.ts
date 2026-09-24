import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  UserRole,
  JWTPayload,
  EmpDepartment,
  AttendanceStatus,
  EMP_DEPARTMENT_LABEL,
  type EmpReportRow,
} from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import {
  listEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getWeek,
  setCell,
  getReport,
  listLinkableUsers,
  EmployeeNotFoundError,
  ScheduleCellError,
  RangeError400,
  getReportAnalytics,
  getReportForRange,
  getAttendanceSummaries,
  getEmployeeHistory,
  copyPreviousWeek,
  fillEmptyCells,
  undoBulkFill,
  EmployeeLinkError,
} from '../services/employeeScheduleService'
import { generateScheduleReportPdf } from '../services/employeeSchedulePdfService'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Employee Schedule module. Edit = Admin + Warehouse Admin.
// INCIDENT_REPORTER has READ-ONLY access (GET routes only; never mutations).
const writeGuard = () => requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN)
const readGuard = () => requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN, UserRole.INCIDENT_REPORTER)

const optStr = (max: number) => z.string().trim().max(max).optional().nullable()
const optDate = z.union([z.string().regex(DATE_RE), z.literal(''), z.null()]).optional()

const EmployeeBody = z.object({
  department: z.nativeEnum(EmpDepartment),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  startDate: z.string().regex(DATE_RE),
  contactNumber: optStr(40),
  email: z.union([z.string().trim().email().max(120), z.literal(''), z.null()]).optional(),
  address: optStr(300),
  birthday: optDate,
  emergencyContactName: optStr(120),
  emergencyContactNumber: optStr(40),
  isActive: z.boolean().default(true),
  leaveDate: optDate,
  // v2.88.0 linked system logins (several allowed) — tenant + conflicts verified in the service
  userIds: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
}).refine((d) => d.isActive || (!!d.leaveDate && DATE_RE.test(d.leaveDate)), {
  message: 'A leave date is required when the employee is inactive',
  path: ['leaveDate'],
})

const CellBody = z.object({
  employeeId: z.string().uuid(),
  date: z.string().regex(DATE_RE),
  status: z.nativeEnum(AttendanceStatus).nullable(),
  otHours: z.coerce.number().min(0).max(5).default(0), // decimals allowed (e.g. 1.5)
  workedHours: z.coerce.number().nullable().optional(), // v2.93.0 — Partial Day hours (validated in the service)
})

const ReportQuery = z.object({
  period: z.enum(['week', 'month']).default('week'),
  date: z.string().regex(DATE_RE).optional(),
  // v2.93.0: a custom range (both required) overrides period/date — used by the exports
  from: z.string().regex(DATE_RE).optional(),
  to: z.string().regex(DATE_RE).optional(),
})
const RangeQuery = z.object({ from: z.string().regex(DATE_RE), to: z.string().regex(DATE_RE), department: z.nativeEnum(EmpDepartment).optional() })

function csvField(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Custom range (from + to, at most 186 days) or the classic week / month report. */
async function reportFor(tenantId: string, q: { period: 'week' | 'month'; date?: string; from?: string; to?: string }) {
  if (q.from && q.to && q.from <= q.to && (dateOnlyMs(q.to) - dateOnlyMs(q.from)) / 86_400_000 < 186) return getReportForRange(tenantId, q.from, q.to)
  return getReport(tenantId, q.period, q.date)
}
const dateOnlyMs = (d: string) => new Date(`${d}T00:00:00.000Z`).getTime()

export default async function employeeScheduleRoutes(fastify: FastifyInstance) {
  const readPre = [fastify.authenticate, readGuard()]   // GET — incl. read-only INCIDENT_REPORTER
  const preHandler = [fastify.authenticate, writeGuard()] // mutations — Admin + Warehouse Admin

  // ── Employees ──
  fastify.get('/employees', { preHandler: readPre }, async (request, reply) => {
    const { tenantId } = request.user as JWTPayload
    return reply.send(await listEmployees(tenantId))
  })

  // v2.93.0 — read-only attendance summaries (list) + one employee's history (profile)
  const DaysQuery = z.object({ days: z.coerce.number().int().refine((d) => [30, 90, 180].includes(d), 'days must be 30, 90 or 180').default(30) })

  fastify.get('/employees/attendance-summary', { preHandler: readPre }, async (request, reply) => {
    const q = DaysQuery.safeParse(request.query)
    if (!q.success) return reply.code(400).send({ error: 'Invalid query', details: q.error.flatten() })
    const { tenantId } = request.user as JWTPayload
    return reply.send(await getAttendanceSummaries(tenantId, q.data.days))
  })

  fastify.get('/employees/:id/history', { preHandler: readPre }, async (request, reply) => {
    const q = DaysQuery.safeParse(request.query)
    if (!q.success) return reply.code(400).send({ error: 'Invalid query', details: q.error.flatten() })
    const { id } = request.params as { id: string }
    const { tenantId } = request.user as JWTPayload
    try {
      return reply.send(await getEmployeeHistory(tenantId, id, q.data.days))
    } catch (err) {
      if (err instanceof EmployeeNotFoundError) return reply.code(404).send({ error: 'Employee not found' })
      throw err
    }
  })

  fastify.post('/employees', { preHandler }, async (request, reply) => {
    const parsed = EmployeeBody.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
    const { tenantId } = request.user as JWTPayload
    try {
      return reply.code(201).send(await createEmployee(tenantId, parsed.data))
    } catch (err) {
      if (err instanceof EmployeeLinkError) return reply.code(err.statusCode).send({ error: err.message })
      throw err
    }
  })

  fastify.put('/employees/:id', { preHandler }, async (request, reply) => {
    const parsed = EmployeeBody.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
    const { id } = request.params as { id: string }
    const { tenantId } = request.user as JWTPayload
    try {
      return reply.send(await updateEmployee(tenantId, id, parsed.data))
    } catch (err) {
      if (err instanceof EmployeeNotFoundError) return reply.code(404).send({ error: 'Employee not found' })
      if (err instanceof EmployeeLinkError) return reply.code(err.statusCode).send({ error: err.message })
      throw err
    }
  })

  // Active picker/packer logins that can be linked to an employee (v2.84.0)
  fastify.get('/linkable-users', { preHandler: readPre }, async (request, reply) => {
    const { tenantId } = request.user as JWTPayload
    return reply.send(await listLinkableUsers(tenantId))
  })

  fastify.delete('/employees/:id', { preHandler }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user as JWTPayload
    const ok = await deleteEmployee(tenantId, id)
    if (!ok) return reply.code(404).send({ error: 'Employee not found' })
    return reply.send({ success: true })
  })

  // ── Schedule (weekly grid) ──
  fastify.get('/schedule', { preHandler: readPre }, async (request, reply) => {
    const { weekStart } = request.query as { weekStart?: string }
    const { tenantId } = request.user as JWTPayload
    return reply.send(await getWeek(tenantId, weekStart))
  })

  fastify.put('/schedule', { preHandler }, async (request, reply) => {
    const parsed = CellBody.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
    const { tenantId } = request.user as JWTPayload
    try {
      const cell = await setCell(tenantId, parsed.data)
      return reply.send({ cell })
    } catch (err) {
      if (err instanceof EmployeeNotFoundError) return reply.code(404).send({ error: 'Employee not found' })
      if (err instanceof ScheduleCellError) return reply.code(400).send({ error: err.message })
      throw err
    }
  })

  // ── Bulk fill (v2.93.0) — empty cells only; never overwrites an existing entry ──
  const BulkCell = z.object({
    employeeId: z.string().uuid(),
    date: z.string().regex(DATE_RE),
    status: z.nativeEnum(AttendanceStatus),
    otHours: z.coerce.number().min(0).max(5).optional(),
    workedHours: z.coerce.number().nullable().optional(),
  })
  const BulkBody = z.object({ cells: z.array(BulkCell).min(1).max(1000) })
  const UndoBody = z.object({ cells: z.array(BulkCell.pick({ employeeId: true, date: true, status: true })).min(1).max(1000) })

  fastify.post('/schedule/fill', { preHandler }, async (request, reply) => {
    const parsed = BulkBody.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
    const { tenantId } = request.user as JWTPayload
    try {
      return reply.send(await fillEmptyCells(tenantId, parsed.data.cells))
    } catch (err) {
      if (err instanceof ScheduleCellError) return reply.code(400).send({ error: err.message })
      throw err
    }
  })

  fastify.post('/schedule/copy-previous-week', { preHandler }, async (request, reply) => {
    const parsed = z.object({ weekStart: z.string().regex(DATE_RE) }).safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
    const { tenantId } = request.user as JWTPayload
    return reply.send(await copyPreviousWeek(tenantId, parsed.data.weekStart))
  })

  fastify.post('/schedule/undo-fill', { preHandler }, async (request, reply) => {
    const parsed = UndoBody.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
    const { tenantId } = request.user as JWTPayload
    return reply.send({ removed: await undoBulkFill(tenantId, parsed.data.cells) })
  })

  // ── Report analytics (v2.93.0, read-only) ──
  fastify.get('/report/analytics', { preHandler: readPre }, async (request, reply) => {
    const parsed = RangeQuery.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid query', details: parsed.error.flatten() })
    const { tenantId } = request.user as JWTPayload
    try {
      return reply.send(await getReportAnalytics(tenantId, parsed.data.from, parsed.data.to, parsed.data.department))
    } catch (err) {
      if (err instanceof RangeError400) return reply.code(400).send({ error: err.message })
      throw err
    }
  })

  // ── Report ──
  fastify.get('/report', { preHandler: readPre }, async (request, reply) => {
    const parsed = ReportQuery.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid query', details: parsed.error.flatten() })
    const { tenantId } = request.user as JWTPayload
    return reply.send(await reportFor(tenantId, parsed.data))
  })

  // ── Report exports ──
  fastify.get('/report/export.csv', { preHandler: readPre }, async (request, reply) => {
    const parsed = ReportQuery.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid query', details: parsed.error.flatten() })
    const { tenantId } = request.user as JWTPayload
    const report = await reportFor(tenantId, parsed.data)

    // v2.93.0: Partial Day columns appended after the original leave columns (existing order kept)
    const header = ['Employee ID', 'Name', 'Department', 'Present', 'Half Day', 'Absent', 'Day Off',
      'Vacation', 'Sick', 'Maternity', 'Partial Days', 'Partial Hours', 'OT Hours', 'Worked Days', 'Total Hours']
    const lines = [header.map(csvField).join(',')]
    const rowVals = (r: EmpReportRow) => [
      String(r.employee.empNo),
      `${r.employee.firstName} ${r.employee.lastName}`,
      EMP_DEPARTMENT_LABEL[r.employee.department],
      r.present, r.halfDay, r.absent, r.dayOff, r.vacation, r.sick, r.maternity,
      r.partialDay, r.partialHours,
      r.otHours, r.workedDays, r.totalHours,
    ]
    for (const r of report.rows) lines.push(rowVals(r).map(csvField).join(','))
    lines.push('')
    const partialHoursTotal = report.rows.reduce((s, r) => s + r.partialHours, 0)
    lines.push(['', 'GRAND TOTAL', '', '', '', '', '', '', '', '', '', partialHoursTotal, report.totals.otHours, report.totals.workedDays, report.totals.totalHours].map(csvField).join(','))

    const filename = `employee-schedule-${report.period}-${report.from}.csv`
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(lines.join('\n'))
  })

  fastify.get('/report/export.pdf', { preHandler: readPre }, async (request, reply) => {
    const parsed = ReportQuery.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid query', details: parsed.error.flatten() })
    const { tenantId } = request.user as JWTPayload
    const report = await reportFor(tenantId, parsed.data)
    const pdf = await generateScheduleReportPdf(report)
    const filename = `employee-schedule-${report.period}-${report.from}.pdf`
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(pdf)
  })
}
