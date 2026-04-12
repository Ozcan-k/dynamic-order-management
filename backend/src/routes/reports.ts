import { FastifyInstance } from 'fastify'
import { UserRole, JWTPayload, OrderStatus } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import { prisma } from '../lib/prisma'
import { getManilaStartOfToday } from '../lib/manila'

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
        slaSummary: { d0, d1, d2, d3, d4 },
      })
    },
  )
}
