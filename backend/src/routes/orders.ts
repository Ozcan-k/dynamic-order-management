import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { UserRole, JWTPayload } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import { scanOrder, listOrders, deleteOrder } from '../services/orderService'

const ScanSchema = z.object({
  trackingNumber: z.string().min(1).max(100),
})

export default async function orderRoutes(fastify: FastifyInstance) {
  // POST /orders/scan — ADMIN, INBOUND_ADMIN
  fastify.post(
    '/scan',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.INBOUND_ADMIN)] },
    async (request, reply) => {
      const result = ScanSchema.safeParse(request.body)
      if (!result.success) {
        return reply.code(400).send({ error: 'Invalid request body', details: result.error.flatten() })
      }

      const { userId, tenantId } = request.user as JWTPayload
      const { trackingNumber } = result.data

      const { duplicate, order } = await scanOrder(trackingNumber, userId, tenantId)
      if (duplicate) {
        return reply.code(409).send({ error: 'Tracking number already exists', order })
      }

      return reply.code(201).send({ order })
    },
  )

  // GET /orders — ADMIN, INBOUND_ADMIN, PICKER_ADMIN, PACKER_ADMIN
  fastify.get(
    '/',
    {
      preHandler: [
        fastify.authenticate,
        requireRole(UserRole.ADMIN, UserRole.INBOUND_ADMIN, UserRole.PICKER_ADMIN, UserRole.PACKER_ADMIN),
      ],
    },
    async (request, reply) => {
      const { tenantId } = request.user as JWTPayload
      const orders = await listOrders(tenantId)
      return reply.send({ orders })
    },
  )

  // DELETE /orders/:id — ADMIN, INBOUND_ADMIN
  fastify.delete(
    '/:id',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.INBOUND_ADMIN)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { tenantId } = request.user as JWTPayload

      try {
        await deleteOrder(id, tenantId)
        return reply.send({ message: 'Order deleted' })
      } catch {
        return reply.code(404).send({ error: 'Order not found' })
      }
    },
  )
}
