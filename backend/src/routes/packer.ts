import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { UserRole, JWTPayload } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import { getIO } from '../lib/socket'
import { findOrderForPacking, diagnoseTracking, completeByTracking, getMyOrders } from '../services/packerService'

const CompleteBody = z.object({ trackingNumber: z.string().min(1).max(100) })

type PackerDiag = { status: string; archivedAt: Date | null; assignedToMe: boolean; assignedToOther: string | null }

function friendlyPackerMessage(diag: PackerDiag | null): string {
  if (!diag) return 'Order not found'
  if (diag.archivedAt) return 'This order is archived and no longer active'
  if (diag.assignedToOther) return `Already assigned to ${diag.assignedToOther}`
  switch (diag.status) {
    case 'INBOUND':
    case 'PICKER_ASSIGNED':
    case 'PICKING':
      return 'This order is not ready for packing yet'
    case 'PICKER_COMPLETE':
      return 'This order is not assigned to you yet'
    case 'PACKING':
      return 'This order is already being packed'
    case 'PACKER_COMPLETE':
    case 'OUTBOUND':
      return 'This order has already been packed'
    default:
      return 'This order is not available for packing'
  }
}

export default async function packerRoutes(fastify: FastifyInstance) {
  const authHandler = [fastify.authenticate, requireRole(UserRole.PACKER)]

  // GET /packer/orders — returns the calling packer's own assigned PACKER_ASSIGNED orders
  fastify.get('/orders', { preHandler: authHandler }, async (request, reply) => {
    const { tenantId, userId } = request.user as JWTPayload
    const orders = await getMyOrders(userId, tenantId)
    return reply.send({ orders })
  })

  // GET /packer/find?tn=EXTRACTED&raw=RAW_BARCODE — look up a PACKER_ASSIGNED order owned by caller
  fastify.get('/find', { preHandler: authHandler }, async (request, reply) => {
    const { tn, raw } = request.query as { tn?: string; raw?: string }
    if (!tn || tn.trim().length === 0) {
      return reply.code(400).send({ error: 'tn query param is required' })
    }
    const { tenantId, userId } = request.user as JWTPayload
    const rawTrimmed = raw?.trim()
    request.log.warn({ tn: tn.trim(), raw: rawTrimmed?.substring(0, 300), tenantId, userId }, 'packer find attempt')
    const order = await findOrderForPacking(tn.trim(), tenantId, userId, rawTrimmed)
    if (!order) {
      const diag = await diagnoseTracking(tn.trim(), tenantId, userId, rawTrimmed)
      request.log.warn(
        { tn: tn.trim(), tenantId, userId, status: diag?.status ?? null, archived: !!diag?.archivedAt, assignedToOther: diag?.assignedToOther ?? null },
        'packer find miss',
      )
      return reply.code(404).send({ error: friendlyPackerMessage(diag) })
    }
    return reply.send({ order })
  })

  // POST /packer/complete — scan tracking number → PACKER_COMPLETE (auto-dispatches to OUTBOUND)
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
        : message.includes('not assigned to you') ? 403
        : 409
      return reply.code(code).send({ error: message })
    }
  })
}
