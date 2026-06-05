import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { UserRole, JWTPayload, Platform, Carrier, DispatchSource } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import {
  lookupOrderForDispatch,
  createDispatchParcel,
  getDispatchGrouped,
  getDispatchStats,
  getDispatchReport,
  getOrderPipeline,
  listDispatch,
  deleteDispatch,
  DuplicateDispatchError,
  OrderNotFoundError,
  OrderNotPackerCompleteError,
} from '../services/dispatchService'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Outbound module — Admin + Outbound Admin only (the scan screen too).
const guard = () => requireRole(UserRole.ADMIN, UserRole.OUTBOUND_ADMIN)

const CreateBodySchema = z.object({
  trackingNumber: z.string().min(1).max(80),
  source:         z.nativeEnum(DispatchSource),
  platform:       z.nativeEnum(Platform),
  carrier:        z.nativeEnum(Carrier),
  shopName:       z.string().max(120).optional(),
})

const ListQuerySchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search:   z.string().max(80).optional(),
  source:   z.nativeEnum(DispatchSource).optional(),
  from:     z.string().regex(DATE_RE).optional(),
  to:       z.string().regex(DATE_RE).optional(),
})

export default async function dispatchRoutes(fastify: FastifyInstance) {
  const preHandler = [fastify.authenticate, guard()]

  // GET /dispatch/lookup?trackingNumber= — read-only in-house order lookup
  fastify.get('/lookup', { preHandler }, async (request, reply) => {
    const { trackingNumber } = request.query as { trackingNumber?: string }
    if (!trackingNumber || !trackingNumber.trim()) {
      return reply.code(400).send({ error: 'trackingNumber is required' })
    }
    const { tenantId } = request.user as JWTPayload
    return reply.send(await lookupOrderForDispatch(tenantId, trackingNumber))
  })

  // POST /dispatch — record a parcel (in-house or external)
  fastify.post('/', { preHandler }, async (request, reply) => {
    const parsed = CreateBodySchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
    const body = parsed.data
    const { tenantId, userId } = request.user as JWTPayload
    const tn = body.trackingNumber.trim().toUpperCase()
    try {
      const created = await createDispatchParcel({
        tenantId,
        createdById: userId,
        trackingNumber: tn,
        source: body.source,
        platform: body.platform,
        carrier: body.carrier,
        shopName: body.shopName,
      })
      return reply.code(201).send(created)
    } catch (err) {
      if (err instanceof DuplicateDispatchError) {
        return reply.code(409).send({ error: `Waybill ${tn} has already been dispatched.` })
      }
      if (err instanceof OrderNotFoundError) {
        return reply.code(404).send({ error: `Waybill ${tn} was not found in our orders. In-house parcels must already be in the system.` })
      }
      if (err instanceof OrderNotPackerCompleteError) {
        return reply.code(409).send({ error: `Waybill ${tn} is not packer-complete yet — the packer must scan it before it can be dispatched. Outbound cannot accept it.` })
      }
      throw err
    }
  })

  // GET /dispatch/grouped?date= — carrier → shop for a single Manila day
  fastify.get('/grouped', { preHandler }, async (request, reply) => {
    const { date } = request.query as { date?: string }
    const validDate = date && DATE_RE.test(date) ? date : undefined
    const { tenantId } = request.user as JWTPayload
    return reply.send(await getDispatchGrouped(tenantId, validDate))
  })

  // GET /dispatch/stats?date= — header counts (total / in-house / external)
  fastify.get('/stats', { preHandler }, async (request, reply) => {
    const { date } = request.query as { date?: string }
    const validDate = date && DATE_RE.test(date) ? date : undefined
    const { tenantId } = request.user as JWTPayload
    return reply.send(await getDispatchStats(tenantId, validDate))
  })

  // GET /dispatch/report?from=&to= — per-carrier totals across a range
  fastify.get('/report', { preHandler }, async (request, reply) => {
    const { from, to } = request.query as { from?: string; to?: string }
    const validFrom = from && DATE_RE.test(from) ? from : undefined
    const validTo = to && DATE_RE.test(to) ? to : undefined
    const { tenantId } = request.user as JWTPayload
    return reply.send(await getDispatchReport(tenantId, validFrom, validTo))
  })

  // GET /dispatch/pipeline?from=&to= — order-pipeline funnel (Inbound→Picker→Packer→Outbound)
  fastify.get('/pipeline', { preHandler }, async (request, reply) => {
    const { from, to } = request.query as { from?: string; to?: string }
    const validFrom = from && DATE_RE.test(from) ? from : undefined
    const validTo = to && DATE_RE.test(to) ? to : undefined
    const { tenantId } = request.user as JWTPayload
    return reply.send(await getOrderPipeline(tenantId, validFrom, validTo))
  })

  // GET /dispatch — paginated list (admin corrections)
  fastify.get('/', { preHandler }, async (request, reply) => {
    const parsed = ListQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid query', details: parsed.error.flatten() })
    const { tenantId } = request.user as JWTPayload
    return reply.send(await listDispatch(tenantId, parsed.data))
  })

  // DELETE /dispatch/:id
  fastify.delete('/:id', { preHandler }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user as JWTPayload
    const deleted = await deleteDispatch(tenantId, id)
    if (!deleted) return reply.code(404).send({ error: 'Record not found' })
    return reply.send(deleted)
  })
}
