import { FastifyInstance } from 'fastify'
import { UserRole, JWTPayload } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import { getAllPickerCompleteOrders, completeByTracking } from '../services/packerService'

export default async function packerRoutes(fastify: FastifyInstance) {
  const authHandler = [fastify.authenticate, requireRole(UserRole.PACKER)]

  // GET /packer/orders — all PICKER_COMPLETE orders (shared queue)
  fastify.get('/orders', { preHandler: authHandler }, async (request, reply) => {
    const { tenantId } = request.user as JWTPayload
    const orders = await getAllPickerCompleteOrders(tenantId)
    return reply.send({ orders })
  })

  // POST /packer/complete — scan tracking number → PACKER_COMPLETE
  fastify.post('/complete', { preHandler: authHandler }, async (request, reply) => {
    const { trackingNumber } = request.body as { trackingNumber?: string }
    if (!trackingNumber?.trim()) {
      return reply.code(400).send({ error: 'trackingNumber is required' })
    }
    const { userId, tenantId } = request.user as JWTPayload
    try {
      const order = await completeByTracking(trackingNumber.trim(), userId, tenantId)
      return reply.send({ order })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Complete failed'
      const code = message.includes('not found') ? 404 : 409
      return reply.code(code).send({ error: message })
    }
  })
}
