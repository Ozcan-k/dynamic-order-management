import { FastifyInstance } from 'fastify'
import { UserRole, JWTPayload, OrderStatus } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import { prisma } from '../lib/prisma'

export default async function reportsRoutes(fastify: FastifyInstance) {
  // GET /reports/dashboard — ADMIN, INBOUND_ADMIN
  fastify.get(
    '/dashboard',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.INBOUND_ADMIN)] },
    async (request, reply) => {
      const { tenantId } = request.user as JWTPayload

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
        d0, d1, d2, d3, d4,
      ] = await Promise.all([
        prisma.order.count({ where: { tenantId } }),
        prisma.order.count({ where: { tenantId, status: OrderStatus.OUTBOUND } }),
        prisma.order.count({ where: { tenantId, status: OrderStatus.INBOUND } }),
        prisma.order.count({ where: { tenantId, status: OrderStatus.PICKER_ASSIGNED } }),
        prisma.order.count({ where: { tenantId, status: OrderStatus.PICKING } }),
        prisma.order.count({ where: { tenantId, status: OrderStatus.PICKER_COMPLETE } }),
        prisma.order.count({ where: { tenantId, status: OrderStatus.PACKER_ASSIGNED } }),
        prisma.order.count({ where: { tenantId, status: OrderStatus.PACKING } }),
        prisma.order.count({ where: { tenantId, status: OrderStatus.PACKER_COMPLETE } }),
        prisma.order.count({ where: { tenantId, delayLevel: 0, slaCompletedAt: null } }),
        prisma.order.count({ where: { tenantId, delayLevel: 1, slaCompletedAt: null } }),
        prisma.order.count({ where: { tenantId, delayLevel: 2, slaCompletedAt: null } }),
        prisma.order.count({ where: { tenantId, delayLevel: 3, slaCompletedAt: null } }),
        prisma.order.count({ where: { tenantId, delayLevel: 4, slaCompletedAt: null } }),
      ])

      return reply.send({
        inboundTotal,
        outboundTotal,
        remainingCount: inboundTotal - outboundTotal,
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
