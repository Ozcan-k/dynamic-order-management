import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { UserRole, JWTPayload } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import { findOrderForPacking, diagnoseTracking, completeByTracking } from '../services/packerService'

const CompleteBody = z.object({ trackingNumber: z.string().min(1).max(100) })

export default async function packerRoutes(fastify: FastifyInstance) {
  const authHandler = [fastify.authenticate, requireRole(UserRole.PACKER)]

  // GET /packer/orders — always empty; packers self-assign by scanning
  fastify.get('/orders', { preHandler: authHandler }, async (_request, reply) => {
    return reply.send({ orders: [] })
  })

  // GET /packer/find?tn=EXTRACTED&raw=RAW_BARCODE — look up a PICKER_COMPLETE order
  fastify.get('/find', { preHandler: authHandler }, async (request, reply) => {
    const { tn, raw } = request.query as { tn?: string; raw?: string }
    if (!tn || tn.trim().length === 0) {
      return reply.code(400).send({ error: 'tn query param is required' })
    }
    const { tenantId, userId } = request.user as JWTPayload
    const rawTrimmed = raw?.trim()
    request.log.warn({ tn: tn.trim(), raw: rawTrimmed?.substring(0, 300), tenantId, userId }, 'packer find attempt')
    const order = await findOrderForPacking(tn.trim(), tenantId, rawTrimmed)
    if (!order) {
      const any = await diagnoseTracking(tn.trim(), tenantId, rawTrimmed)
      const msg = any
        ? `Order status is ${any.status}${any.archivedAt ? ' (archived)' : ''}, not PICKER_COMPLETE`
        : 'Order not found in this tenant'
      return reply.code(404).send({ error: msg })
    }
    return reply.send({ order })
  })

  // POST /packer/complete — scan tracking number → PACKER_COMPLETE
  fastify.post('/complete', { preHandler: authHandler }, async (request, reply) => {
    const parsed = CompleteBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'trackingNumber is required' })
    }
    const { userId, tenantId } = request.user as JWTPayload
    try {
      const order = await completeByTracking(parsed.data.trackingNumber.trim(), userId, tenantId)
      return reply.send({ order })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Complete failed'
      const code = message.includes('not found') ? 404 : 409
      return reply.code(code).send({ error: message })
    }
  })
}
