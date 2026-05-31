import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  UserRole,
  JWTPayload,
  ReturnCancelType,
  Platform,
  Carrier,
  RETURN_CANCEL_PLATFORMS,
} from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import {
  createReturnCancel,
  listReturnCancel,
  deleteReturnCancel,
} from '../services/returnCancelService'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Reading the report (list) and deleting records is for the desktop viewers:
// ADMIN, WAREHOUSE_ADMIN and the Inbound/Outbound Admin (INBOUND_ADMIN).
const readGuard = () => requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN, UserRole.INBOUND_ADMIN)
// Creating a record (phone scan or the desktop "Add Parcel" popup) additionally
// allows the handheld-only RETURN_SCANNER role.
const writeGuard = () => requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN, UserRole.INBOUND_ADMIN, UserRole.RETURN_SCANNER)

const ListQuerySchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search:   z.string().max(80).optional(),
  type:     z.nativeEnum(ReturnCancelType).optional(),
  from:     z.string().regex(DATE_RE).optional(),
  to:       z.string().regex(DATE_RE).optional(),
})

const CreateBodySchema = z.object({
  trackingNumber: z.string().min(1).max(80),
  type:           z.nativeEnum(ReturnCancelType),
  storeName:      z.string().min(1).max(120),
  platform:       z.nativeEnum(Platform).refine(
    (p) => RETURN_CANCEL_PLATFORMS.includes(p),
    { message: 'Platform must be Shopee, Lazada or TikTok' },
  ),
  carrier:        z.nativeEnum(Carrier),
})

export default async function returnRoutes(fastify: FastifyInstance) {
  // ─── List + summary stats ──────────────────────────────────────────────────
  fastify.get(
    '/',
    { preHandler: [fastify.authenticate, readGuard()] },
    async (request, reply) => {
      const parsed = ListQuerySchema.safeParse(request.query)
      if (!parsed.success) return reply.code(400).send({ error: 'Invalid query', details: parsed.error.flatten() })
      const { tenantId } = request.user as JWTPayload
      const data = await listReturnCancel(tenantId, parsed.data)
      return reply.send(data)
    },
  )

  // ─── Create (scan submit) ───────────────────────────────────────────────────
  fastify.post(
    '/',
    { preHandler: [fastify.authenticate, writeGuard()] },
    async (request, reply) => {
      const parsed = CreateBodySchema.safeParse(request.body)
      if (!parsed.success) return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
      const body = parsed.data
      const { tenantId, userId } = request.user as JWTPayload
      const created = await createReturnCancel({
        tenantId,
        createdById:    userId,
        trackingNumber: body.trackingNumber.trim().toUpperCase(),
        type:           body.type,
        storeName:      body.storeName.trim(),
        platform:       body.platform,
        carrier:        body.carrier,
      })
      return reply.code(201).send(created)
    },
  )

  // ─── Delete ──────────────────────────────────────────────────────────────────
  fastify.delete(
    '/:id',
    { preHandler: [fastify.authenticate, readGuard()] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { tenantId } = request.user as JWTPayload
      const deleted = await deleteReturnCancel(tenantId, id)
      if (!deleted) return reply.code(404).send({ error: 'Record not found' })
      return reply.send(deleted)
    },
  )
}
