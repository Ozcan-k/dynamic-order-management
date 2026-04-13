import { FastifyInstance } from 'fastify'
import { UserRole, JWTPayload } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import {
  getOutboundStats,
  getStuckOrders,
  getGroupedByCarrier,
} from '../services/outboundService'

export default async function outboundRoutes(fastify: FastifyInstance) {
  const preHandler = [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.INBOUND_ADMIN)]

  // GET /outbound/grouped — today's OUTBOUND orders grouped by carrier → shop
  fastify.get('/grouped', { preHandler }, async (request, reply) => {
    const { tenantId } = request.user as JWTPayload
    return reply.send(await getGroupedByCarrier(tenantId))
  })

  // GET /outbound/stats — header stats + pipeline breakdown
  fastify.get('/stats', { preHandler }, async (request, reply) => {
    const { tenantId } = request.user as JWTPayload
    return reply.send(await getOutboundStats(tenantId))
  })

  // GET /outbound/stuck — all non-OUTBOUND orders sorted by urgency
  fastify.get('/stuck', { preHandler }, async (request, reply) => {
    const { tenantId } = request.user as JWTPayload
    const orders = await getStuckOrders(tenantId)
    return reply.send({ orders })
  })
}
