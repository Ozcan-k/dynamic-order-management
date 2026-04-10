import { FastifyInstance } from 'fastify'
import { UserRole, JWTPayload } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import { prisma } from '../lib/prisma'
import {
  getPickerCompleteOrders,
  getPackers,
  completeOrder,
  removeOrder,
  getPackerStats,
  getPackerOrders,
} from '../services/packerAdminService'

export default async function packerAdminRoutes(fastify: FastifyInstance) {
  const preHandler = [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.PACKER_ADMIN)]

  // GET /packer-admin/orders — PICKER_COMPLETE orders waiting to be packed
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

  // POST /packer-admin/complete — admin manually completes an order
  fastify.post('/complete', { preHandler }, async (request, reply) => {
    const { orderId } = request.body as { orderId?: string }
    if (!orderId) return reply.code(400).send({ error: 'orderId is required' })
    const { userId, tenantId } = request.user as JWTPayload
    try {
      const order = await completeOrder(orderId, userId, tenantId)
      return reply.send({ order })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Complete failed'
      const code = message.includes('not found') ? 404 : 409
      return reply.code(code).send({ error: message })
    }
  })

  // POST /packer-admin/remove — send order back to INBOUND
  fastify.post('/remove', { preHandler }, async (request, reply) => {
    const { orderId } = request.body as { orderId?: string }
    if (!orderId) return reply.code(400).send({ error: 'orderId is required' })
    const { userId, tenantId } = request.user as JWTPayload
    try {
      const order = await removeOrder(orderId, userId, tenantId)
      return reply.send({ order })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Remove failed'
      const code = message.includes('not found') ? 404 : 409
      return reply.code(code).send({ error: message })
    }
  })

  // PATCH /packer-admin/packer/:packerId/pin — set packer device PIN
  fastify.patch('/packer/:packerId/pin', { preHandler }, async (request, reply) => {
    const { packerId } = request.params as { packerId: string }
    const { pin } = request.body as { pin?: string }
    const { tenantId } = request.user as JWTPayload

    if (!pin || !/^\d{4}$/.test(pin)) {
      return reply.code(400).send({ error: 'PIN must be exactly 4 digits' })
    }

    const target = await prisma.user.findFirst({
      where: { id: packerId, tenantId, role: UserRole.PACKER },
    })
    if (!target) return reply.code(404).send({ error: 'Packer not found' })

    const conflict = await prisma.user.findFirst({
      where: { tenantId, packerPin: pin, id: { not: packerId } },
    })
    if (conflict) return reply.code(409).send({ error: 'PIN already in use' })

    const updated = await prisma.user.update({
      where: { id: packerId },
      data: { packerPin: pin },
      select: { id: true, username: true, packerPin: true },
    })
    return reply.send({ packer: updated })
  })
}
