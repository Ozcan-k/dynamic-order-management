import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { UserRole, JWTPayload } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import {
  createBulkItems,
  listItems,
  scanItem,
  listMovements,
  getStats,
} from '../services/stockService'

const CreateBulkSchema = z.object({
  productType: z.string().min(1).max(100),
  category: z.string().min(1).max(100),
  weightKg: z.number().positive().max(10000),
  quantity: z.number().int().min(1).max(500),
})

const ListItemsQuerySchema = z.object({
  status: z.enum(['IN_STOCK', 'OUT_OF_STOCK']).optional(),
  productType: z.string().min(1).max(100).optional(),
  category: z.string().min(1).max(100).optional(),
})

const ScanSchema = z.object({
  stockItemId: z.string().uuid(),
})

const MovementsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

export default async function stockRoutes(fastify: FastifyInstance) {
  // POST /stock/items/bulk — ADMIN: create N items + return PDF of stickers
  fastify.post(
    '/items/bulk',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN)] },
    async (request, reply) => {
      const result = CreateBulkSchema.safeParse(request.body)
      if (!result.success) {
        return reply.code(400).send({ error: 'Invalid request body', details: result.error.flatten() })
      }
      const { tenantId } = request.user as JWTPayload
      try {
        const { count, pdf } = await createBulkItems(tenantId, result.data)
        return reply
          .header('Content-Type', 'application/pdf')
          .header(
            'Content-Disposition',
            `inline; filename="stock-labels-${count}-${new Date().toISOString().slice(0, 10)}.pdf"`,
          )
          .header('X-Items-Created', String(count))
          .send(pdf)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to create stock items'
        return reply.code(400).send({ error: msg })
      }
    },
  )

  // GET /stock/items — ADMIN: list items with filters
  fastify.get(
    '/items',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN)] },
    async (request, reply) => {
      const result = ListItemsQuerySchema.safeParse(request.query)
      if (!result.success) {
        return reply.code(400).send({ error: 'Invalid query', details: result.error.flatten() })
      }
      const { tenantId } = request.user as JWTPayload
      const items = await listItems(tenantId, result.data)
      return reply.send({ items })
    },
  )

  // POST /stock/scan — ADMIN + STOCK_KEEPER: toggle item IN/OUT
  fastify.post(
    '/scan',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.STOCK_KEEPER)] },
    async (request, reply) => {
      const result = ScanSchema.safeParse(request.body)
      if (!result.success) {
        return reply.code(400).send({ error: 'Invalid request body', details: result.error.flatten() })
      }
      const { tenantId, userId } = request.user as JWTPayload
      try {
        const scanResult = await scanItem(tenantId, userId, result.data.stockItemId)
        return reply.send(scanResult)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Scan failed'
        const code = msg === 'Stock item not found' ? 404 : 400
        return reply.code(code).send({ error: msg })
      }
    },
  )

  // GET /stock/movements — ADMIN: history of scans
  fastify.get(
    '/movements',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN)] },
    async (request, reply) => {
      const result = MovementsQuerySchema.safeParse(request.query)
      if (!result.success) {
        return reply.code(400).send({ error: 'Invalid query', details: result.error.flatten() })
      }
      const { tenantId } = request.user as JWTPayload
      const movements = await listMovements(tenantId, result.data)
      return reply.send({ movements })
    },
  )

  // GET /stock/stats — ADMIN: dashboard summary
  fastify.get(
    '/stats',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN)] },
    async (request, reply) => {
      const { tenantId } = request.user as JWTPayload
      const stats = await getStats(tenantId)
      return reply.send(stats)
    },
  )
}
