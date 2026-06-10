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
  EmployeeNotFoundError,
} from '../services/employeeScheduleService'
import { generateScheduleReportPdf } from '../services/employeeSchedulePdfService'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Employee Schedule module — Admin + Warehouse Admin only.
const guard = () => requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN)

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
}).refine((d) => d.isActive || (!!d.leaveDate && DATE_RE.test(d.leaveDate)), {
  message: 'A leave date is required when the employee is inactive',
  path: ['leaveDate'],
})

const CellBody = z.object({
  employeeId: z.string().uuid(),
  date: z.string().regex(DATE_RE),
  status: z.nativeEnum(AttendanceStatus).nullable(),
  otHours: z.coerce.number().int().min(0).max(5).default(0),
})

const ReportQuery = z.object({
  period: z.enum(['week', 'month']).default('week'),
  date: z.string().regex(DATE_RE).optional(),
})

function csvField(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default async function employeeScheduleRoutes(fastify: FastifyInstance) {
  const preHandler = [fastify.authenticate, guard()]

  // ── Employees ──
  fastify.get('/employees', { preHandler }, async (request, reply) => {
    const { tenantId } = request.user as JWTPayload
    return reply.send(await listEmployees(tenantId))
  })

  fastify.post('/employees', { preHandler }, async (request, reply) => {
    const parsed = EmployeeBody.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
    const { tenantId } = request.user as JWTPayload
    return reply.code(201).send(await createEmployee(tenantId, parsed.data))
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
      throw err
    }
  })

  fastify.delete('/employees/:id', { preHandler }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user as JWTPayload
    const ok = await deleteEmployee(tenantId, id)
    if (!ok) return reply.code(404).send({ error: 'Employee not found' })
    return reply.send({ success: true })
  })

  // ── Schedule (weekly grid) ──
  fastify.get('/schedule', { preHandler }, async (request, reply) => {
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
      throw err
    }
  })

  // ── Report ──
  fastify.get('/report', { preHandler }, async (request, reply) => {
    const parsed = ReportQuery.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid query', details: parsed.error.flatten() })
    const { tenantId } = request.user as JWTPayload
    return reply.send(await getReport(tenantId, parsed.data.period, parsed.data.date))
  })

  // ── Report exports ──
  fastify.get('/report/export.csv', { preHandler }, async (request, reply) => {
    const parsed = ReportQuery.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid query', details: parsed.error.flatten() })
    const { tenantId } = request.user as JWTPayload
    const report = await getReport(tenantId, parsed.data.period, parsed.data.date)

    const header = ['Employee ID', 'Name', 'Department', 'Present', 'Half Day', 'Absent',
      'Vacation', 'Sick', 'Maternity', 'OT Hours', 'Worked Days', 'Total Hours']
    const lines = [header.map(csvField).join(',')]
    const rowVals = (r: EmpReportRow) => [
      `#${r.employee.empNo}`,
      `${r.employee.firstName} ${r.employee.lastName}`,
      EMP_DEPARTMENT_LABEL[r.employee.department],
      r.present, r.halfDay, r.absent, r.vacation, r.sick, r.maternity,
      r.otHours, r.workedDays, r.totalHours,
    ]
    for (const r of report.rows) lines.push(rowVals(r).map(csvField).join(','))
    lines.push('')
    lines.push(['', 'GRAND TOTAL', '', '', '', '', '', '', '', report.totals.otHours, report.totals.workedDays, report.totals.totalHours].map(csvField).join(','))

    const filename = `employee-schedule-${report.period}-${report.from}.csv`
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(lines.join('\n'))
  })

  fastify.get('/report/export.pdf', { preHandler }, async (request, reply) => {
    const parsed = ReportQuery.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid query', details: parsed.error.flatten() })
    const { tenantId } = request.user as JWTPayload
    const report = await getReport(tenantId, parsed.data.period, parsed.data.date)
    const pdf = await generateScheduleReportPdf(report)
    const filename = `employee-schedule-${report.period}-${report.from}.pdf`
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(pdf)
  })
}
