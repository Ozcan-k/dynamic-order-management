import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { UserRole, JWTPayload } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import { archiveOutboundQueue } from '../lib/queues'
import {
  getArchivedOrders,
  getArchiveStats,
  bulkDeleteArchivedOrders,
  archiveOutboundOrders,
} from '../services/archiveService'

const BulkDeleteSchema = z.object({
  orderIds: z.array(z.string().uuid()).min(1).max(500),
})

const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().max(100).optional(),
  platform: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  expiresWithin: z.coerce.number().int().min(1).max(180).optional(),
})

export default async function archiveRoutes(fastify: FastifyInstance) {
  // GET /archive — paginated archived orders
  fastify.get(
    '/',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN)] },
    async (request, reply) => {
      const result = ListQuerySchema.safeParse(request.query)
      if (!result.success) return reply.code(400).send({ error: 'Invalid query params', details: result.error.flatten() })

      const { tenantId } = request.user as JWTPayload
      const data = await getArchivedOrders(tenantId, result.data)
      return reply.send(data)
    },
  )

  // GET /archive/stats — summary counts
  fastify.get(
    '/stats',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN)] },
    async (request, reply) => {
      const { tenantId } = request.user as JWTPayload
      const stats = await getArchiveStats(tenantId)
      return reply.send(stats)
    },
  )

  // POST /archive/trigger — manual archive for caller's tenant
  fastify.post(
    '/trigger',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN)] },
    async (request, reply) => {
      const { tenantId } = request.user as JWTPayload

      try {
        // Archive synchronously so the response shows the count
        const result = await archiveOutboundOrders(tenantId)
        request.log.info(
          { tenantId, archived: result.archived },
          '[archive] manual trigger completed',
        )

        // Audit enqueue is best-effort — Redis hiccups must not fail the request
        // when the DB archive already succeeded.
        try {
          await archiveOutboundQueue.add(
            'archive',
            { tenantId },
            { removeOnComplete: 10, removeOnFail: 5 },
          )
        } catch (enqueueErr) {
          request.log.warn(
            { err: enqueueErr, tenantId },
            '[archive] audit enqueue failed (DB archive OK)',
          )
        }

        return reply.send({ archived: result.archived })
      } catch (err) {
        request.log.error({ err, tenantId }, '[archive] manual trigger failed')
        const message = err instanceof Error ? err.message : 'Archive failed'
        return reply.code(500).send({ error: message })
      }
    },
  )

  // POST /archive/bulk-delete — hard delete a set of archived orders
  fastify.post(
    '/bulk-delete',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN)] },
    async (request, reply) => {
      const result = BulkDeleteSchema.safeParse(request.body)
      if (!result.success) return reply.code(400).send({ error: 'Invalid request body', details: result.error.flatten() })

      const { tenantId } = request.user as JWTPayload
      const { deleted } = await bulkDeleteArchivedOrders(tenantId, result.data.orderIds)
      return reply.send({ deleted })
    },
  )
}
