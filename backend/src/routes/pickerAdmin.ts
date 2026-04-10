import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { UserRole, JWTPayload } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import {
  getInboundOrders,
  getPickers,
  assignPicker,
  bulkAssignPicker,
  getPickerStats,
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

  // GET /picker-admin/stats
  fastify.get('/stats', { preHandler }, async (request, reply) => {
    const { tenantId } = request.user as JWTPayload
    const stats = await getPickerStats(tenantId)
    return reply.send({ stats })
  })
}
