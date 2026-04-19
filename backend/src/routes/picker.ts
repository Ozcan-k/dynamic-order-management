import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { UserRole, JWTPayload } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import { getIO } from '../lib/socket'
import { getMyOrders, completeByTracking } from '../services/pickerService'

const CompleteBody = z.object({ trackingNumber: z.string().min(1).max(100) })

export default async function pickerRoutes(fastify: FastifyInstance) {
  const authHandler = [fastify.authenticate, requireRole(UserRole.PICKER)]

  // GET /picker/orders — picker'ın aktif orderları
  fastify.get('/orders', { preHandler: authHandler }, async (request, reply) => {
    const { userId, tenantId } = request.user as JWTPayload
    const orders = await getMyOrders(userId, tenantId)
    return reply.send({ orders })
  })

  // POST /picker/complete — tracking number ile order tamamla
  fastify.post('/complete', { preHandler: authHandler }, async (request, reply) => {
    const parsed = CompleteBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'trackingNumber is required' })
    }
    const { userId, tenantId } = request.user as JWTPayload
    try {
      const order = await completeByTracking(parsed.data.trackingNumber.trim(), userId, tenantId)
      try { getIO().to(`tenant:${tenantId}`).emit('order:stats_changed') } catch {}
      return reply.send({ order })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Complete failed'
      const code = message.includes('not found') ? 404
        : message.includes('not assigned') ? 403
        : 400
      return reply.code(code).send({ error: message })
    }
  })
}
