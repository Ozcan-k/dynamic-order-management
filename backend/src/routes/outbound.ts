import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { UserRole, JWTPayload } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import {
  getReadyToDispatch,
  dispatchOrder,
  bulkDispatch,
  getOutboundStats,
  getStuckOrders,
} from '../services/outboundService'

const BulkDispatchSchema = z.object({
  orderIds: z.array(z.string().min(1)).min(1).max(200),
})

export default async function outboundRoutes(fastify: FastifyInstance) {
  const preHandler = [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.INBOUND_ADMIN)]

  // GET /outbound/orders — PACKER_COMPLETE orders ready to dispatch
  fastify.get('/orders', { preHandler }, async (request, reply) => {
    const { tenantId } = request.user as JWTPayload
    const orders = await getReadyToDispatch(tenantId)
    return reply.send({ orders })
  })

  // GET /outbound/stats — header stats + comparison report numbers
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

  // POST /outbound/dispatch { orderId }
  fastify.post('/dispatch', { preHandler }, async (request, reply) => {
    const { orderId } = request.body as { orderId?: string }
    if (!orderId) return reply.code(400).send({ error: 'orderId is required' })
    const { userId, tenantId } = request.user as JWTPayload
    try {
      const order = await dispatchOrder(orderId, userId, tenantId)
      return reply.send({ order })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Dispatch failed'
      return reply.code(message.includes('not found') ? 404 : 409).send({ error: message })
    }
  })

  // POST /outbound/bulk-dispatch { orderIds }
  fastify.post('/bulk-dispatch', { preHandler }, async (request, reply) => {
    const result = BulkDispatchSchema.safeParse(request.body)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: result.error.flatten() })
    }
    const { userId, tenantId } = request.user as JWTPayload
    const summary = await bulkDispatch(result.data.orderIds, userId, tenantId)
    return reply.send(summary)
  })
}
