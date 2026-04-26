import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { UserRole, JWTPayload } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import { getIO } from '../lib/socket'
import { redis } from '../lib/redis'
import {
  getPickerCompleteOrders,
  getPackers,
  assignPacker,
  bulkAssignPacker,
  lookupOrderByScan,
  unassignPacker,
  completeOrder,
  removeOrder,
  getPackerStats,
  getPackerOrders,
} from '../services/packerAdminService'

const OrderIdBody = z.object({ orderId: z.string().min(1) })
const CompleteBody = z.object({
  orderId: z.string().min(1),
  packerId: z.string().uuid(),
})
const AssignSchema = z.object({
  orderId: z.string().min(1),
  packerId: z.string().min(1),
})
const BulkAssignSchema = z.object({
  orderIds: z.array(z.string().min(1)).min(1).max(200),
  packerId: z.string().min(1),
})

export default async function packerAdminRoutes(fastify: FastifyInstance) {
  const preHandler = [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.PACKER_ADMIN)]

  // GET /packer-admin/orders — PICKER_COMPLETE + PACKER_ASSIGNED orders (admin queue view)
  fastify.get('/orders', { preHandler }, async (request, reply) => {
    const { tenantId } = request.user as JWTPayload
    const orders = await getPickerCompleteOrders(tenantId)
    return reply.send({ orders })
  })

  // GET /packer-admin/packers — active packers
  fastify.get('/packers', { preHandler }, async (request, reply) => {
    const { tenantId } = request.user as JWTPayload
    const packers = await getPackers(tenantId)
    return reply.send({ packers })
  })

  // POST /packer-admin/assign — assign one order to a packer (PICKER_COMPLETE → PACKER_ASSIGNED)
  fastify.post('/assign', { preHandler }, async (request, reply) => {
    const result = AssignSchema.safeParse(request.body)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: result.error.flatten() })
    }
    const { userId, tenantId } = request.user as JWTPayload
    const { orderId, packerId } = result.data
    try {
      const order = await assignPacker(orderId, packerId, userId, tenantId)
      try { getIO().to(`tenant:${tenantId}`).emit('order:stats_changed') } catch {}
      try { getIO().to(`user:${packerId}`).emit('order:assigned', { order }) } catch {}
      return reply.send({ order })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Assignment failed'
      return reply.code(400).send({ error: message })
    }
  })

  // POST /packer-admin/bulk-assign — assign many orders to one packer
  fastify.post('/bulk-assign', { preHandler }, async (request, reply) => {
    const result = BulkAssignSchema.safeParse(request.body)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: result.error.flatten() })
    }
    const { userId, tenantId } = request.user as JWTPayload
    const { orderIds, packerId } = result.data
    const summary = await bulkAssignPacker(orderIds, packerId, userId, tenantId)
    try { getIO().to(`tenant:${tenantId}`).emit('order:stats_changed') } catch {}
    try { getIO().to(`user:${packerId}`).emit('order:assigned') } catch {}
    return reply.send(summary)
  })

  // POST /packer-admin/scan — phone-side stage a PICKER_COMPLETE order (no DB mutation beyond Redis pending)
  fastify.post('/scan', { preHandler }, async (request, reply) => {
    const { trackingNumber } = request.body as { trackingNumber?: string }
    if (!trackingNumber?.trim()) return reply.code(400).send({ error: 'trackingNumber is required' })
    const { userId, tenantId } = request.user as JWTPayload
    try {
      const order = await lookupOrderByScan(trackingNumber.trim(), tenantId)
      const key = `pending:packer-staged:${userId}`
      await redis.rpush(key, JSON.stringify(order))
      await redis.expire(key, 300)
      try { getIO().to(`user:${userId}`).emit('order:packer-staged', { order }) } catch {}
      return reply.send({ order })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Lookup failed'
      const code = message.includes('not found') ? 404 : 409
      return reply.code(code).send({ error: message })
    }
  })

  // GET /packer-admin/pending-staged — desktop drains Redis on page load
  fastify.get('/pending-staged', { preHandler }, async (request, reply) => {
    const { userId } = request.user as JWTPayload
    const key = `pending:packer-staged:${userId}`
    const raw = await redis.lrange(key, 0, -1)
    await redis.del(key)
    const orders = raw.map(r => JSON.parse(r))
    return reply.send({ orders })
  })

  // POST /packer-admin/handheld-bulk-scan — phone sends multiple TNs to desktop staging
  fastify.post('/handheld-bulk-scan', { preHandler }, async (request, reply) => {
    const { trackingNumbers } = request.body as { trackingNumbers?: string[] }
    if (!Array.isArray(trackingNumbers) || trackingNumbers.length === 0) {
      return reply.code(400).send({ error: 'trackingNumbers array is required' })
    }
    const { userId, tenantId } = request.user as JWTPayload
    const results: { trackingNumber: string; status: 'staged' | 'not_found' | 'error'; message?: string }[] = []

    for (const tn of trackingNumbers) {
      const trimmed = tn.trim()
      try {
        const order = await lookupOrderByScan(trimmed, tenantId)
        try { getIO().to(`user:${userId}`).emit('order:packer-staged', { order }) } catch {}
        results.push({ trackingNumber: trimmed, status: 'staged' })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Lookup failed'
        results.push({ trackingNumber: trimmed, status: message.includes('not found') ? 'not_found' : 'error', message })
      }
    }
    return reply.send({ results })
  })

  // POST /packer-admin/unassign — undo a PACKER_ASSIGNED back to PICKER_COMPLETE without sending to picker
  fastify.post('/unassign', { preHandler }, async (request, reply) => {
    const parsed = OrderIdBody.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'orderId is required' })
    const { orderId } = parsed.data
    const { userId, tenantId } = request.user as JWTPayload
    try {
      const order = await unassignPacker(orderId, tenantId, userId)
      try { getIO().to(`tenant:${tenantId}`).emit('order:stats_changed') } catch {}
      return reply.send({ order })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unassign failed'
      const code = message.includes('not found') ? 404 : 409
      return reply.code(code).send({ error: message })
    }
  })

  // GET /packer-admin/stats — per-packer completion counts + overall total
  fastify.get('/stats', { preHandler }, async (request, reply) => {
    const { tenantId } = request.user as JWTPayload
    const { stats, totalCompleted, returnedCount } = await getPackerStats(tenantId)
    return reply.send({ stats, totalCompleted, returnedCount })
  })

  // GET /packer-admin/packer/:packerId/orders — specific packer's completed orders
  fastify.get('/packer/:packerId/orders', { preHandler }, async (request, reply) => {
    const { tenantId } = request.user as JWTPayload
    const { packerId } = request.params as { packerId: string }
    const orders = await getPackerOrders(packerId, tenantId)
    return reply.send({ orders })
  })

  // POST /packer-admin/complete — admin manually completes an order (PICKER_COMPLETE or PACKER_ASSIGNED)
  fastify.post('/complete', { preHandler }, async (request, reply) => {
    const parsed = CompleteBody.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'orderId and packerId are required' })
    const { orderId, packerId } = parsed.data
    const { userId, tenantId } = request.user as JWTPayload
    try {
      const order = await completeOrder(orderId, packerId, userId, tenantId)
      try { getIO().to(`tenant:${tenantId}`).emit('order:stats_changed') } catch {}
      return reply.send({ order })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Complete failed'
      const code = message.includes('not found') ? 404 : message.includes('Invalid packer') ? 400 : 409
      return reply.code(code).send({ error: message })
    }
  })

  // POST /packer-admin/remove — send order back to INBOUND/PICKER_ASSIGNED with auto-reassign to original picker
  fastify.post('/remove', { preHandler }, async (request, reply) => {
    const parsed = OrderIdBody.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'orderId is required' })
    const { orderId } = parsed.data
    const { userId, tenantId } = request.user as JWTPayload
    try {
      const order = await removeOrder(orderId, userId, tenantId)
      try { getIO().to(`tenant:${tenantId}`).emit('order:stats_changed') } catch {}
      return reply.send({ order })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Remove failed'
      const code = message.includes('not found') ? 404 : 409
      return reply.code(code).send({ error: message })
    }
  })
}
