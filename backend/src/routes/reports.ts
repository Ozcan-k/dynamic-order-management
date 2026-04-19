import { FastifyInstance } from 'fastify'
import { UserRole, JWTPayload, OrderStatus } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import { prisma } from '../lib/prisma'
import { getManilaStartOfToday, getManilaDateString, getManilaStartOf } from '../lib/manila'
import { runNightlyReport } from '../jobs/nightlyReport'
import PDFDocument from 'pdfkit'

// ─── PDF Helper ───────────────────────────────────────────────────────────────

function buildPdfBuffer(
  draw: (doc: InstanceType<typeof PDFDocument>) => void,
  options?: ConstructorParameters<typeof PDFDocument>[0],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, ...options })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    draw(doc)
    doc.end()
  })
}

export default async function reportsRoutes(fastify: FastifyInstance) {
  // GET /reports/dashboard — ADMIN, INBOUND_ADMIN
  fastify.get(
    '/dashboard',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.INBOUND_ADMIN)] },
    async (request, reply) => {
      const { tenantId } = request.user as JWTPayload

      const today = getManilaStartOfToday()

      const [
        inboundTotal,
        outboundTotal,
        inboundQueue,
        pickerAssigned,
        picking,
        pickerComplete,
        packerAssigned,
        packing,
        packerComplete,
        carryoverCount,
        d0, d1, d2, d3, d4,
        escalatedToday,
      ] = await Promise.all([
        prisma.order.count({ where: { tenantId, archivedAt: null } }),
        prisma.order.count({ where: { tenantId, status: OrderStatus.OUTBOUND, archivedAt: null } }),
        prisma.order.count({ where: { tenantId, status: OrderStatus.INBOUND, archivedAt: null } }),
        prisma.order.count({ where: { tenantId, status: OrderStatus.PICKER_ASSIGNED, archivedAt: null } }),
        prisma.order.count({ where: { tenantId, status: OrderStatus.PICKING, archivedAt: null } }),
        prisma.order.count({ where: { tenantId, status: OrderStatus.PICKER_COMPLETE, archivedAt: null } }),
        prisma.order.count({ where: { tenantId, status: OrderStatus.PACKER_ASSIGNED, archivedAt: null } }),
        prisma.order.count({ where: { tenantId, status: OrderStatus.PACKING, archivedAt: null } }),
        prisma.order.count({ where: { tenantId, status: OrderStatus.PACKER_COMPLETE, archivedAt: null } }),
        // Orders from a previous day that are still active (not OUTBOUND, not archived)
        prisma.order.count({
          where: {
            tenantId,
            archivedAt: null,
            status: { not: OrderStatus.OUTBOUND },
            workDate: { lt: today },
          },
        }),
        prisma.order.count({ where: { tenantId, archivedAt: null, delayLevel: 0, slaCompletedAt: null } }),
        prisma.order.count({ where: { tenantId, archivedAt: null, delayLevel: 1, slaCompletedAt: null } }),
        prisma.order.count({ where: { tenantId, archivedAt: null, delayLevel: 2, slaCompletedAt: null } }),
        prisma.order.count({ where: { tenantId, archivedAt: null, delayLevel: 3, slaCompletedAt: null } }),
        prisma.order.count({ where: { tenantId, archivedAt: null, delayLevel: 4, slaCompletedAt: null } }),
        prisma.slaEscalation.count({ where: { tenantId, triggeredAt: { gte: today } } }),
      ])

      return reply.send({
        inboundTotal,
        outboundTotal,
        remainingCount: inboundTotal - outboundTotal,
        carryoverCount,
        pickerSummary: {
          inbound: inboundQueue,
          assigned: pickerAssigned,
          inProgress: picking,
          complete: pickerComplete,
        },
        packerSummary: {
          unassigned: pickerComplete,
          assigned: packerAssigned,
          inProgress: packing,
          complete: packerComplete,
        },
        slaSummary: { d0, d1, d2, d3, d4, escalatedToday },
      })
    },
  )

  // GET /reports/range-totals?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD — ADMIN, INBOUND_ADMIN
  fastify.get(
    '/range-totals',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.INBOUND_ADMIN)] },
    async (request, reply) => {
      const { tenantId } = request.user as JWTPayload
      const { startDate, endDate } = request.query as { startDate?: string; endDate?: string }

      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!startDate || !endDate || !dateRegex.test(startDate) || !dateRegex.test(endDate)) {
        return reply.code(400).send({ error: 'startDate and endDate required (YYYY-MM-DD)' })
      }
      if (startDate > endDate) {
        return reply.code(400).send({ error: 'startDate must be <= endDate' })
      }

      const from = getManilaStartOf(startDate)
      const toExclusive = new Date(getManilaStartOf(endDate).getTime() + 24 * 60 * 60 * 1000)

      const [inboundTotal, outboundTotal] = await Promise.all([
        prisma.order.count({
          where: { tenantId, workDate: { gte: from, lt: toExclusive } },
        }),
        prisma.order.count({
          where: {
            tenantId,
            status: OrderStatus.OUTBOUND,
            slaCompletedAt: { gte: from, lt: toExclusive },
          },
        }),
      ])

      return reply.send({ startDate, endDate, inboundTotal, outboundTotal })
    },
  )

  // GET /reports/performance?days=30 — ADMIN, INBOUND_ADMIN, PICKER_ADMIN, PACKER_ADMIN
  fastify.get(
    '/performance',
    {
      preHandler: [
        fastify.authenticate,
        requireRole(UserRole.ADMIN, UserRole.INBOUND_ADMIN, UserRole.PICKER_ADMIN, UserRole.PACKER_ADMIN),
      ],
    },
    async (request, reply) => {
      const { tenantId } = request.user as JWTPayload
      const days = Math.min(Number((request.query as { days?: string }).days) || 30, 90)

      const from = new Date(getManilaStartOfToday())
      from.setDate(from.getDate() - (days - 1))

      // Helper: group completedAt timestamps into YYYY-MM-DD (Manila) → count map
      function groupByDate(timestamps: (Date | null)[]): Record<string, number> {
        const map: Record<string, number> = {}
        for (const ts of timestamps) {
          if (!ts) continue
          const dateStr = ts.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) // YYYY-MM-DD
          map[dateStr] = (map[dateStr] ?? 0) + 1
        }
        return map
      }

      // Build date list for the range
      const dateList: string[] = []
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(getManilaStartOfToday())
        d.setDate(d.getDate() - i)
        dateList.push(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }))
      }

      // Fetch all pickers and packers
      const [pickerUsers, packerUsers] = await Promise.all([
        prisma.user.findMany({
          where: { tenantId, role: UserRole.PICKER, isActive: true },
          select: { id: true, username: true },
          orderBy: { username: 'asc' },
        }),
        prisma.user.findMany({
          where: { tenantId, role: UserRole.PACKER, isActive: true },
          select: { id: true, username: true },
          orderBy: { username: 'asc' },
        }),
      ])

      // Fetch all picker assignments in range
      const pickerAssignments = await prisma.pickerAssignment.findMany({
        where: {
          order: { tenantId },
          completedAt: { gte: from, not: null },
        },
        select: { pickerId: true, completedAt: true },
      })

      // Fetch all packer assignments in range
      const packerAssignments = await prisma.packerAssignment.findMany({
        where: {
          order: { tenantId },
          completedAt: { gte: from, not: null },
        },
        select: { packerId: true, completedAt: true },
      })

      // Group picker assignments by picker
      const pickerMap: Record<string, (Date | null)[]> = {}
      for (const a of pickerAssignments) {
        if (!pickerMap[a.pickerId]) pickerMap[a.pickerId] = []
        pickerMap[a.pickerId].push(a.completedAt)
      }

      // Group packer assignments by packer
      const packerMap: Record<string, (Date | null)[]> = {}
      for (const a of packerAssignments) {
        if (!packerMap[a.packerId]) packerMap[a.packerId] = []
        packerMap[a.packerId].push(a.completedAt)
      }

      const pickers = pickerUsers.map((u) => {
        const byDate = groupByDate(pickerMap[u.id] ?? [])
        const daily = dateList.map((date) => ({ date, completed: byDate[date] ?? 0 }))
        const total = daily.reduce((s, d) => s + d.completed, 0)
        return { id: u.id, username: u.username, daily, total }
      })

      const packers = packerUsers.map((u) => {
        const byDate = groupByDate(packerMap[u.id] ?? [])
        const daily = dateList.map((date) => ({ date, completed: byDate[date] ?? 0 }))
        const total = daily.reduce((s, d) => s + d.completed, 0)
        return { id: u.id, username: u.username, daily, total }
      })

      return reply.send({
        pickers,
        packers,
        dateRange: {
          from: dateList[0],
          to: dateList[dateList.length - 1],
        },
        days,
      })
    },
  )

  // GET /reports/performance/export — ADMIN, INBOUND_ADMIN, PICKER_ADMIN, PACKER_ADMIN — CSV download
  fastify.get(
    '/performance/export',
    {
      preHandler: [
        fastify.authenticate,
        requireRole(UserRole.ADMIN, UserRole.INBOUND_ADMIN, UserRole.PICKER_ADMIN, UserRole.PACKER_ADMIN),
      ],
    },
    async (request, reply) => {
      const { tenantId } = request.user as JWTPayload
      const query = request.query as { days?: string; type?: string }
      const days = Math.min(Math.max(Number(query.days) || 30, 1), 90)
      const type = query.type === 'packer' ? 'packer' : 'picker'

      const from = new Date(getManilaStartOfToday())
      from.setDate(from.getDate() - (days - 1))

      function groupByDate(timestamps: (Date | null)[]): Record<string, number> {
        const map: Record<string, number> = {}
        for (const ts of timestamps) {
          if (!ts) continue
          const dateStr = ts.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
          map[dateStr] = (map[dateStr] ?? 0) + 1
        }
        return map
      }

      const dateList: string[] = []
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(getManilaStartOfToday())
        d.setDate(d.getDate() - i)
        dateList.push(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }))
      }

      let rows: { id: string; username: string; daily: { date: string; completed: number }[]; total: number }[]

      if (type === 'picker') {
        const users = await prisma.user.findMany({
          where: { tenantId, role: UserRole.PICKER, isActive: true },
          select: { id: true, username: true },
          orderBy: { username: 'asc' },
        })
        const assignments = await prisma.pickerAssignment.findMany({
          where: { order: { tenantId }, completedAt: { gte: from, not: null } },
          select: { pickerId: true, completedAt: true },
        })
        const byUser: Record<string, (Date | null)[]> = {}
        for (const a of assignments) {
          if (!byUser[a.pickerId]) byUser[a.pickerId] = []
          byUser[a.pickerId].push(a.completedAt)
        }
        rows = users.map((u) => {
          const byDate = groupByDate(byUser[u.id] ?? [])
          const daily = dateList.map((date) => ({ date, completed: byDate[date] ?? 0 }))
          return { id: u.id, username: u.username, daily, total: daily.reduce((s, d) => s + d.completed, 0) }
        })
      } else {
        const users = await prisma.user.findMany({
          where: { tenantId, role: UserRole.PACKER, isActive: true },
          select: { id: true, username: true },
          orderBy: { username: 'asc' },
        })
        const assignments = await prisma.packerAssignment.findMany({
          where: { order: { tenantId }, completedAt: { gte: from, not: null } },
          select: { packerId: true, completedAt: true },
        })
        const byUser: Record<string, (Date | null)[]> = {}
        for (const a of assignments) {
          if (!byUser[a.packerId]) byUser[a.packerId] = []
          byUser[a.packerId].push(a.completedAt)
        }
        rows = users.map((u) => {
          const byDate = groupByDate(byUser[u.id] ?? [])
          const daily = dateList.map((date) => ({ date, completed: byDate[date] ?? 0 }))
          return { id: u.id, username: u.username, daily, total: daily.reduce((s, d) => s + d.completed, 0) }
        })
      }

      // Build CSV
      const header = ['Name', ...dateList, 'Total'].join(',')
      const dataRows = rows.map((r) => {
        const cols = [
          `"${r.username.replace(/"/g, '""')}"`,
          ...r.daily.map((d) => String(d.completed)),
          String(r.total),
        ]
        return cols.join(',')
      })
      const csv = [header, ...dataRows].join('\r\n')

      const todayStr = getManilaDateString(new Date())
      const filename = `dom-${type}-report-${days}d-${todayStr}.csv`

      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(csv)
    },
  )

  // GET /reports/sla?days=7|14|30 — ADMIN, INBOUND_ADMIN, PICKER_ADMIN, PACKER_ADMIN
  fastify.get(
    '/sla',
    {
      preHandler: [
        fastify.authenticate,
        requireRole(UserRole.ADMIN, UserRole.INBOUND_ADMIN, UserRole.PICKER_ADMIN, UserRole.PACKER_ADMIN),
      ],
    },
    async (request, reply) => {
      const { tenantId } = request.user as JWTPayload
      const days = Math.min(Number((request.query as { days?: string }).days) || 30, 30)

      const from = new Date(getManilaStartOfToday())
      from.setDate(from.getDate() - (days - 1))

      const today = getManilaStartOfToday()
      const dateList: string[] = []
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(getManilaStartOfToday())
        d.setDate(d.getDate() - i)
        dateList.push(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }))
      }

      const [distributionRaw, completedOrders, d4Unresolved] = await Promise.all([
        prisma.order.groupBy({
          by: ['delayLevel'],
          where: { tenantId, slaStartedAt: { gte: from } },
          _count: { _all: true },
        }),
        prisma.order.findMany({
          where: { tenantId, slaStartedAt: { gte: from }, slaCompletedAt: { not: null } },
          select: { slaStartedAt: true, slaCompletedAt: true },
        }),
        prisma.order.findMany({
          where: { tenantId, delayLevel: 4, slaCompletedAt: null, archivedAt: null },
          select: {
            id: true,
            trackingNumber: true,
            platform: true,
            shopName: true,
            carrierName: true,
            slaStartedAt: true,
            status: true,
          },
          orderBy: { slaStartedAt: 'asc' },
          take: 50,
        }),
      ])

      // Build distribution map
      const distribution = { d0: 0, d1: 0, d2: 0, d3: 0, d4: 0 }
      const levelKeys = ['d0', 'd1', 'd2', 'd3', 'd4'] as const
      for (const row of distributionRaw) {
        const key = levelKeys[row.delayLevel]
        if (key) distribution[key] = row._count._all
      }

      // Compute average completion time
      let avgCompletionMinutes: number | null = null
      if (completedOrders.length > 0) {
        const totalMs = completedOrders.reduce((sum, o) => {
          return sum + (new Date(o.slaCompletedAt!).getTime() - new Date(o.slaStartedAt).getTime())
        }, 0)
        avgCompletionMinutes = Math.round(totalMs / completedOrders.length / 60000)
      }

      return reply.send({
        days,
        dateRange: { from: dateList[0], to: dateList[dateList.length - 1] },
        distribution,
        avgCompletionMinutes,
        completedCount: completedOrders.length,
        d4Unresolved,
      })
    },
  )

  // GET /reports/performance/export-pdf — ADMIN, INBOUND_ADMIN, PICKER_ADMIN, PACKER_ADMIN
  fastify.get(
    '/performance/export-pdf',
    {
      preHandler: [
        fastify.authenticate,
        requireRole(UserRole.ADMIN, UserRole.INBOUND_ADMIN, UserRole.PICKER_ADMIN, UserRole.PACKER_ADMIN),
      ],
    },
    async (request, reply) => {
      const { tenantId } = request.user as JWTPayload
      const query = request.query as { days?: string; type?: string }
      const days = Math.min(Math.max(Number(query.days) || 30, 1), 90)
      const type = query.type === 'packer' ? 'packer' : 'picker'

      const from = new Date(getManilaStartOfToday())
      from.setDate(from.getDate() - (days - 1))

      function groupByDate(timestamps: (Date | null)[]): Record<string, number> {
        const map: Record<string, number> = {}
        for (const ts of timestamps) {
          if (!ts) continue
          const dateStr = ts.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
          map[dateStr] = (map[dateStr] ?? 0) + 1
        }
        return map
      }

      const dateList: string[] = []
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(getManilaStartOfToday())
        d.setDate(d.getDate() - i)
        dateList.push(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }))
      }

      // Last 7 dates for display (full table would be too wide)
      const last7 = dateList.slice(-7)

      let rows: { username: string; daily: { date: string; completed: number }[]; total: number }[]

      if (type === 'picker') {
        const users = await prisma.user.findMany({
          where: { tenantId, role: UserRole.PICKER, isActive: true },
          select: { id: true, username: true },
          orderBy: { username: 'asc' },
        })
        const assignments = await prisma.pickerAssignment.findMany({
          where: { order: { tenantId }, completedAt: { gte: from, not: null } },
          select: { pickerId: true, completedAt: true },
        })
        const byUser: Record<string, (Date | null)[]> = {}
        for (const a of assignments) {
          if (!byUser[a.pickerId]) byUser[a.pickerId] = []
          byUser[a.pickerId].push(a.completedAt)
        }
        rows = users.map((u) => {
          const byDate = groupByDate(byUser[u.id] ?? [])
          const daily = dateList.map((date) => ({ date, completed: byDate[date] ?? 0 }))
          return { username: u.username, daily, total: daily.reduce((s, d) => s + d.completed, 0) }
        })
      } else {
        const users = await prisma.user.findMany({
          where: { tenantId, role: UserRole.PACKER, isActive: true },
          select: { id: true, username: true },
          orderBy: { username: 'asc' },
        })
        const assignments = await prisma.packerAssignment.findMany({
          where: { order: { tenantId }, completedAt: { gte: from, not: null } },
          select: { packerId: true, completedAt: true },
        })
        const byUser: Record<string, (Date | null)[]> = {}
        for (const a of assignments) {
          if (!byUser[a.packerId]) byUser[a.packerId] = []
          byUser[a.packerId].push(a.completedAt)
        }
        rows = users.map((u) => {
          const byDate = groupByDate(byUser[u.id] ?? [])
          const daily = dateList.map((date) => ({ date, completed: byDate[date] ?? 0 }))
          return { username: u.username, daily, total: daily.reduce((s, d) => s + d.completed, 0) }
        })
      }

      const todayStr = getManilaDateString(new Date())
      const generatedAt = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Manila', hour12: false })

      const pdf = await buildPdfBuffer((doc) => {
        const PAGE_W = doc.page.width - 80

        // Title
        doc.fontSize(16).font('Helvetica-Bold').text(`DOM Warehouse — ${type === 'picker' ? 'Picker' : 'Packer'} Performance Report`, 40, 40)
        doc.fontSize(10).font('Helvetica').fillColor('#64748b')
        doc.text(`Date range: ${dateList[0]} → ${dateList[dateList.length - 1]} (${days} days)`, 40, 62)
        doc.text(`Generated: ${generatedAt} (Manila time)`, 40, 76)

        doc.moveTo(40, 96).lineTo(40 + PAGE_W, 96).strokeColor('#e2e8f0').stroke()

        // Table
        const colWidths = [130, ...last7.map(() => 50), 60]
        const headers = ['Name', ...last7.map(d => d.slice(5)), 'Total'] // MM-DD format
        let y = 108

        // Header row
        doc.fillColor('#f8fafc').rect(40, y, PAGE_W, 20).fill()
        doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(8)
        let x = 40
        headers.forEach((h, i) => {
          doc.text(h, x + 4, y + 6, { width: colWidths[i], align: i === 0 ? 'left' : 'right' })
          x += colWidths[i]
        })
        y += 20

        // Data rows
        rows.forEach((row, ri) => {
          const last7Daily = row.daily.slice(-7)
          if (ri % 2 === 1) {
            doc.fillColor('#f8fafc').rect(40, y, PAGE_W, 18).fill()
          }
          doc.fillColor('#0f172a').font('Helvetica').fontSize(8)
          x = 40
          const cols = [row.username, ...last7Daily.map(d => String(d.completed)), String(row.total)]
          cols.forEach((val, i) => {
            doc.text(val, x + 4, y + 5, { width: colWidths[i], align: i === 0 ? 'left' : 'right' })
            x += colWidths[i]
          })
          y += 18
          if (y > doc.page.height - 60) {
            doc.addPage()
            y = 40
          }
        })

        // Footer
        doc.fillColor('#94a3b8').fontSize(8).font('Helvetica')
        doc.text(`DOM Warehouse System — ${type} report — ${days}d — ${todayStr}`, 40, doc.page.height - 30, { align: 'center', width: PAGE_W })
      })

      const filename = `dom-${type}-report-${days}d-${todayStr}.pdf`
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(pdf)
    },
  )

  // GET /reports/sla/export-pdf — ADMIN, INBOUND_ADMIN, PICKER_ADMIN, PACKER_ADMIN
  fastify.get(
    '/sla/export-pdf',
    {
      preHandler: [
        fastify.authenticate,
        requireRole(UserRole.ADMIN, UserRole.INBOUND_ADMIN, UserRole.PICKER_ADMIN, UserRole.PACKER_ADMIN),
      ],
    },
    async (request, reply) => {
      const { tenantId } = request.user as JWTPayload
      const days = Math.min(Number((request.query as { days?: string }).days) || 30, 30)

      const from = new Date(getManilaStartOfToday())
      from.setDate(from.getDate() - (days - 1))

      const dateList: string[] = []
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(getManilaStartOfToday())
        d.setDate(d.getDate() - i)
        dateList.push(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }))
      }

      const [distributionRaw, completedOrders, d4Unresolved] = await Promise.all([
        prisma.order.groupBy({
          by: ['delayLevel'],
          where: { tenantId, slaStartedAt: { gte: from } },
          _count: { _all: true },
        }),
        prisma.order.findMany({
          where: { tenantId, slaStartedAt: { gte: from }, slaCompletedAt: { not: null } },
          select: { slaStartedAt: true, slaCompletedAt: true },
        }),
        prisma.order.findMany({
          where: { tenantId, delayLevel: 4, slaCompletedAt: null, archivedAt: null },
          select: { trackingNumber: true, platform: true, shopName: true, carrierName: true, slaStartedAt: true, status: true },
          orderBy: { slaStartedAt: 'asc' },
          take: 50,
        }),
      ])

      const dist = { d0: 0, d1: 0, d2: 0, d3: 0, d4: 0 }
      const levelKeys = ['d0', 'd1', 'd2', 'd3', 'd4'] as const
      for (const row of distributionRaw) {
        const key = levelKeys[row.delayLevel]
        if (key) dist[key] = row._count._all
      }
      const total = Object.values(dist).reduce((s, v) => s + v, 0)

      let avgCompletionMinutes: number | null = null
      if (completedOrders.length > 0) {
        const totalMs = completedOrders.reduce((sum, o) => sum + (new Date(o.slaCompletedAt!).getTime() - new Date(o.slaStartedAt).getTime()), 0)
        avgCompletionMinutes = Math.round(totalMs / completedOrders.length / 60000)
      }

      const todayStr = getManilaDateString(new Date())
      const generatedAt = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Manila', hour12: false })

      const pdf = await buildPdfBuffer((doc) => {
        const PAGE_W = doc.page.width - 80

        doc.fontSize(16).font('Helvetica-Bold').text('DOM Warehouse — SLA Analytics Report', 40, 40)
        doc.fontSize(10).font('Helvetica').fillColor('#64748b')
        doc.text(`Date range: ${dateList[0]} → ${dateList[dateList.length - 1]} (${days} days)`, 40, 62)
        doc.text(`Generated: ${generatedAt} (Manila time)`, 40, 76)

        doc.moveTo(40, 96).lineTo(40 + PAGE_W, 96).strokeColor('#e2e8f0').stroke()

        // Summary cards
        let y = 108
        const avgH = avgCompletionMinutes != null
          ? `${Math.floor(avgCompletionMinutes / 60)}h ${avgCompletionMinutes % 60}m`
          : 'N/A'
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11)
        doc.text(`Avg SLA Completion: ${avgH}   |   Completed orders: ${completedOrders.length}   |   Total in range: ${total}`, 40, y)
        y += 24

        // D-level distribution table
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#374151').text('SLA Level Distribution', 40, y)
        y += 14

        const dHeaders = ['Level', 'Count', '% of Total']
        const dColW = [80, 80, 100]
        doc.fillColor('#f8fafc').rect(40, y, 260, 18).fill()
        doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(8)
        let x = 40
        dHeaders.forEach((h, i) => { doc.text(h, x + 4, y + 5, { width: dColW[i] }); x += dColW[i] })
        y += 18

        const dLevels = [
          { label: 'D0 (On-time)', count: dist.d0 },
          { label: 'D1 (4–8h delay)', count: dist.d1 },
          { label: 'D2 (8–12h delay)', count: dist.d2 },
          { label: 'D3 (12–16h delay)', count: dist.d3 },
          { label: 'D4 (16h+ delay)', count: dist.d4 },
        ]
        dLevels.forEach((dl, ri) => {
          if (ri % 2 === 1) doc.fillColor('#f8fafc').rect(40, y, 260, 16).fill()
          doc.fillColor('#0f172a').font('Helvetica').fontSize(8)
          x = 40
          const pct = total > 0 ? ((dl.count / total) * 100).toFixed(1) + '%' : '0%'
          const cols = [dl.label, String(dl.count), pct]
          cols.forEach((val, i) => { doc.text(val, x + 4, y + 4, { width: dColW[i] }); x += dColW[i] })
          y += 16
        })
        y += 16

        // D4 unresolved table
        if (d4Unresolved.length > 0) {
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#991b1b').text(`D4 Unresolved Orders (${d4Unresolved.length})`, 40, y)
          y += 14

          const d4Headers = ['Tracking Number', 'Platform', 'Shop', 'SLA Started', 'Status']
          const d4ColW = [130, 70, 100, 110, 110]
          doc.fillColor('#fca5a5').rect(40, y, PAGE_W, 18).fill()
          doc.fillColor('#7f1d1d').font('Helvetica-Bold').fontSize(8)
          x = 40
          d4Headers.forEach((h, i) => { doc.text(h, x + 4, y + 5, { width: d4ColW[i] }); x += d4ColW[i] })
          y += 18

          d4Unresolved.forEach((o, ri) => {
            if (y > doc.page.height - 60) { doc.addPage(); y = 40 }
            if (ri % 2 === 1) doc.fillColor('#fef2f2').rect(40, y, PAGE_W, 16).fill()
            doc.fillColor('#0f172a').font('Helvetica').fontSize(8)
            x = 40
            const slaStart = new Date(o.slaStartedAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
            const cols = [o.trackingNumber, o.platform, o.shopName ?? '—', slaStart, o.status.replace(/_/g, ' ')]
            cols.forEach((val, i) => { doc.text(val, x + 4, y + 4, { width: d4ColW[i] }); x += d4ColW[i] })
            y += 16
          })
        }

        doc.fillColor('#94a3b8').fontSize(8).font('Helvetica')
        doc.text(`DOM Warehouse System — SLA report — ${days}d — ${todayStr}`, 40, doc.page.height - 30, { align: 'center', width: PAGE_W })
      })

      const filename = `dom-sla-report-${days}d-${todayStr}.pdf`
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(pdf)
    },
  )

  // GET /reports/order-timeline?trackingNumber=X — ADMIN, INBOUND_ADMIN, PICKER_ADMIN, PACKER_ADMIN
  fastify.get(
    '/order-timeline',
    {
      preHandler: [
        fastify.authenticate,
        requireRole(UserRole.ADMIN, UserRole.INBOUND_ADMIN, UserRole.PICKER_ADMIN, UserRole.PACKER_ADMIN),
      ],
    },
    async (request, reply) => {
      const { tenantId } = request.user as JWTPayload
      const { trackingNumber } = request.query as { trackingNumber?: string }

      if (!trackingNumber || trackingNumber.trim().length === 0) {
        return reply.code(400).send({ error: 'trackingNumber is required' })
      }

      // Try active orders first, then archived
      let order = await prisma.order.findFirst({
        where: { tenantId, trackingNumber: trackingNumber.trim(), archivedAt: null },
        include: {
          statusHistory: {
            include: { changedBy: { select: { username: true } } },
            orderBy: { changedAt: 'asc' },
          },
          pickerAssignments: {
            include: {
              picker: { select: { username: true } },
              assignedBy: { select: { username: true } },
            },
            orderBy: { assignedAt: 'asc' },
          },
          packerAssignments: {
            include: {
              packer: { select: { username: true } },
              assignedBy: { select: { username: true } },
            },
            orderBy: { assignedAt: 'asc' },
          },
        },
      })

      // Fallback to archived
      if (!order) {
        order = await prisma.order.findFirst({
          where: { tenantId, trackingNumber: trackingNumber.trim() },
          include: {
            statusHistory: {
              include: { changedBy: { select: { username: true } } },
              orderBy: { changedAt: 'asc' },
            },
            pickerAssignments: {
              include: {
                picker: { select: { username: true } },
                assignedBy: { select: { username: true } },
              },
              orderBy: { assignedAt: 'asc' },
            },
            packerAssignments: {
              include: {
                packer: { select: { username: true } },
                assignedBy: { select: { username: true } },
              },
              orderBy: { assignedAt: 'asc' },
            },
          },
        })
      }

      if (!order) {
        return reply.code(404).send({ error: 'Order not found' })
      }

      interface TimelineEvent {
        type: string
        timestamp: string
        actor: string
        label: string
        durationFromPrevMs: number | null
      }

      const events: TimelineEvent[] = []

      for (const h of order.statusHistory) {
        const from = h.fromStatus ? h.fromStatus.replace(/_/g, ' ') : 'START'
        const to = h.toStatus.replace(/_/g, ' ')
        events.push({
          type: 'status_change',
          timestamp: h.changedAt.toISOString(),
          actor: h.changedBy.username,
          label: h.fromStatus ? `Status: ${from} → ${to}` : `Scanned (${to})`,
          durationFromPrevMs: null,
        })
      }

      for (const pa of order.pickerAssignments) {
        events.push({
          type: 'picker_assigned',
          timestamp: pa.assignedAt.toISOString(),
          actor: pa.assignedBy.username,
          label: `Assigned to picker: ${pa.picker.username}`,
          durationFromPrevMs: null,
        })
        if (pa.completedAt) {
          events.push({
            type: 'picker_complete',
            timestamp: pa.completedAt.toISOString(),
            actor: pa.picker.username,
            label: `Picker complete: ${pa.picker.username}`,
            durationFromPrevMs: null,
          })
        }
      }

      for (const pa of order.packerAssignments) {
        events.push({
          type: 'packer_assigned',
          timestamp: pa.assignedAt.toISOString(),
          actor: pa.assignedBy.username,
          label: `Assigned to packer: ${pa.packer.username}`,
          durationFromPrevMs: null,
        })
        if (pa.completedAt) {
          events.push({
            type: 'packer_complete',
            timestamp: pa.completedAt.toISOString(),
            actor: pa.packer.username,
            label: `Packer complete: ${pa.packer.username}`,
            durationFromPrevMs: null,
          })
        }
      }

      // Sort chronologically and compute durations
      events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      for (let i = 1; i < events.length; i++) {
        events[i].durationFromPrevMs =
          new Date(events[i].timestamp).getTime() - new Date(events[i - 1].timestamp).getTime()
      }

      const totalDurationMs = events.length > 1
        ? new Date(events[events.length - 1].timestamp).getTime() - new Date(events[0].timestamp).getTime()
        : 0

      return reply.send({
        order: {
          id: order.id,
          trackingNumber: order.trackingNumber,
          status: order.status,
          delayLevel: order.delayLevel,
          slaStartedAt: order.slaStartedAt,
          slaCompletedAt: order.slaCompletedAt,
          totalDurationMs,
        },
        timeline: events,
      })
    },
  )

  // POST /reports/trigger-nightly — ADMIN only, dev/test use
  fastify.post(
    '/trigger-nightly',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN)] },
    async (_request, reply) => {
      try {
        await runNightlyReport()
        return reply.send({ ok: true, message: 'Nightly report sent' })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed'
        return reply.code(500).send({ error: message })
      }
    },
  )
}
