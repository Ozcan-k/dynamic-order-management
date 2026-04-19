import { FastifyInstance } from 'fastify'
import { UserRole, JWTPayload } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import {
  getOutboundStats,
  getStuckOrders,
  getGroupedByCarrier,
} from '../services/outboundService'

export default async function outboundRoutes(fastify: FastifyInstance) {
  const preHandler = [
    fastify.authenticate,
    requireRole(UserRole.ADMIN, UserRole.INBOUND_ADMIN, UserRole.PICKER_ADMIN, UserRole.PACKER_ADMIN),
  ]

  // GET /outbound/grouped?date=YYYY-MM-DD — OUTBOUND orders grouped by carrier → shop
  fastify.get('/grouped', { preHandler }, async (request, reply) => {
    const { tenantId } = request.user as JWTPayload
    const { date } = request.query as { date?: string }
    const validDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined
    return reply.send(await getGroupedByCarrier(tenantId, validDate))
  })

  // GET /outbound/stats?date=YYYY-MM-DD — header stats (historical mode returns only dispatched count)
  fastify.get('/stats', { preHandler }, async (request, reply) => {
    const { tenantId } = request.user as JWTPayload
    const { date } = request.query as { date?: string }
    const validDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined
    return reply.send(await getOutboundStats(tenantId, validDate))
  })

  // GET /outbound/stuck — all non-OUTBOUND orders sorted by urgency
  fastify.get('/stuck', { preHandler }, async (request, reply) => {
    const { tenantId } = request.user as JWTPayload
    const orders = await getStuckOrders(tenantId)
    return reply.send({ orders })
  })
}
