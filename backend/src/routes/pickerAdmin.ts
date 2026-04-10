import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { UserRole, JWTPayload } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import { prisma } from '../lib/prisma'
import {
  getInboundOrders,
  getPickers,
  assignPicker,
  bulkAssignPicker,
  getPickerStats,
  getPickerOrders,
  completeOrder,
  unassignOrder,
  lookupOrderByScan,
} from '../services/pickerAdminService'

const AssignSchema = z.object({
  orderId: z.string().min(1),
  pickerId: z.string().min(1),
})

const BulkAssignSchema = z.object({
  orderIds: z.array(z.string().min(1)).min(1).max(200),
  pickerId: z.string().min(1),
})

export default async function pickerAdminRoutes(fastify: FastifyInstance) {
  const preHandler = [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.PICKER_ADMIN)]

  // GET /picker-admin/orders
  fastify.get('/orders', { preHandler }, async (request, reply) => {
    const { tenantId } = request.user as JWTPayload
    const orders = await getInboundOrders(tenantId)
    return reply.send({ orders })
  })

  // GET /picker-admin/pickers
  fastify.get('/pickers', { preHandler }, async (request, reply) => {
    const { tenantId } = request.user as JWTPayload
    const pickers = await getPickers(tenantId)
    return reply.send({ pickers })
  })

  // POST /picker-admin/assign
  fastify.post('/assign', { preHandler }, async (request, reply) => {
    const result = AssignSchema.safeParse(request.body)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: result.error.flatten() })
    }

    const { userId, tenantId } = request.user as JWTPayload
    const { orderId, pickerId } = result.data

    try {
      const order = await assignPicker(orderId, pickerId, userId, tenantId)
      return reply.send({ order })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Assignment failed'
      return reply.code(400).send({ error: message })
    }
  })

  // POST /picker-admin/bulk-assign
  fastify.post('/bulk-assign', { preHandler }, async (request, reply) => {
    const result = BulkAssignSchema.safeParse(request.body)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: result.error.flatten() })
    }

    const { userId, tenantId } = request.user as JWTPayload
    const { orderIds, pickerId } = result.data

    const summary = await bulkAssignPicker(orderIds, pickerId, userId, tenantId)
    return reply.send(summary)
  })

  // POST /picker-admin/scan — lookup an INBOUND order by tracking number (does not create)
  fastify.post('/scan', { preHandler }, async (request, reply) => {
    const { trackingNumber } = request.body as { trackingNumber?: string }
    if (!trackingNumber?.trim()) return reply.code(400).send({ error: 'trackingNumber is required' })
    const { tenantId } = request.user as JWTPayload
    try {
      const order = await lookupOrderByScan(trackingNumber.trim(), tenantId)
      return reply.send({ order })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Lookup failed'
      const code = message.includes('not found') ? 404 : 409
      return reply.code(code).send({ error: message })
    }
  })

  // GET /picker-admin/stats
  fastify.get('/stats', { preHandler }, async (request, reply) => {
    const { tenantId } = request.user as JWTPayload
    const { stats, returnedCount, totalCompleted } = await getPickerStats(tenantId)
    return reply.send({ stats, returnedCount, totalCompleted })
  })

  // GET /picker-admin/picker/:pickerId/orders
  fastify.get('/picker/:pickerId/orders', { preHandler }, async (request, reply) => {
    const { tenantId } = request.user as JWTPayload
    const { pickerId } = request.params as { pickerId: string }
    const orders = await getPickerOrders(pickerId, tenantId)
    return reply.send({ orders })
  })

  // POST /picker-admin/unassign
  fastify.post('/unassign', { preHandler }, async (request, reply) => {
    const { orderId, pickerId } = request.body as { orderId: string; pickerId: string }
    if (!orderId || !pickerId) return reply.code(400).send({ error: 'orderId and pickerId required' })
    const { tenantId } = request.user as JWTPayload
    try {
      const order = await unassignOrder(orderId, pickerId, tenantId)
      return reply.send({ order })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unassign failed'
      return reply.code(400).send({ error: message })
    }
  })

  // POST /picker-admin/complete
  fastify.post('/complete', { preHandler }, async (request, reply) => {
    const { orderId, pickerId } = request.body as { orderId: string; pickerId: string }
    if (!orderId || !pickerId) return reply.code(400).send({ error: 'orderId and pickerId required' })
    const { tenantId } = request.user as JWTPayload
    try {
      const order = await completeOrder(orderId, pickerId, tenantId)
      return reply.send({ order })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Complete failed'
      return reply.code(400).send({ error: message })
    }
  })

  // PATCH /picker-admin/picker/:pickerId/pin — picker'a PIN ata
  fastify.patch('/picker/:pickerId/pin', { preHandler }, async (request, reply) => {
    const { pickerId } = request.params as { pickerId: string }
    const { pin } = request.body as { pin?: string }
    const { tenantId } = request.user as JWTPayload

    if (!pin || !/^\d{4}$/.test(pin)) {
      return reply.code(400).send({ error: 'PIN must be exactly 4 digits' })
    }

    const target = await prisma.user.findFirst({
      where: { id: pickerId, tenantId, role: UserRole.PICKER },
    })
    if (!target) return reply.code(404).send({ error: 'Picker not found' })

    const conflict = await prisma.user.findFirst({
      where: { tenantId, pickerPin: pin, id: { not: pickerId } },
    })
    if (conflict) return reply.code(409).send({ error: 'PIN already in use' })

    const updated = await prisma.user.update({
      where: { id: pickerId },
      data: { pickerPin: pin },
      select: { id: true, username: true, pickerPin: true },
    })
    return reply.send({ picker: updated })
  })
}
