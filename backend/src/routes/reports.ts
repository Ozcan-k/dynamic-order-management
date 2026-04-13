import { FastifyInstance } from 'fastify'
import { UserRole, JWTPayload, OrderStatus } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import { prisma } from '../lib/prisma'
import { getManilaStartOfToday, getManilaDateString } from '../lib/manila'
import { runNightlyReport } from '../jobs/nightlyReport'

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

  // GET /reports/performance?days=30 — ADMIN, INBOUND_ADMIN
  fastify.get(
    '/performance',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.INBOUND_ADMIN)] },
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
