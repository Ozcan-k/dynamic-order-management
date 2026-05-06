import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { UserRole, JWTPayload } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import {
  generateLabelsPdf,
  listItems,
  scanItem,
  deleteItem,
  listMovements,
  getStats,
  getSummary,
} from '../services/stockService'

const GenerateLabelsSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  unit: z.enum(['KG', 'PCS']),
  quantity: z.number().positive().max(10000),
  count: z.number().int().min(1).max(500),
})

const ListItemsQuerySchema = z.object({
  status: z.enum(['IN_STOCK', 'OUT_OF_STOCK']).optional(),
  productId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
})

const ScanSchema = z.object({
  id: z.string().uuid(),
  warehouseId: z.string().uuid(),
})

const MovementsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

export default async function stockRoutes(fastify: FastifyInstance) {
  // POST /stock/labels — ADMIN: create N stock items + generate PDF labels.
  // Unlike the old design (PDF-only, lazy-create on scan), each label now
  // corresponds to a real StockItem row in the picked warehouse from print time.
  fastify.post(
    '/labels',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN)] },
    async (request, reply) => {
      const result = GenerateLabelsSchema.safeParse(request.body)
      if (!result.success) {
        return reply.code(400).send({ error: 'Invalid request body', details: result.error.flatten() })
      }
      const { tenantId } = request.user as JWTPayload
      try {
        const { count, batchNumber, pdf } = await generateLabelsPdf(tenantId, result.data)
        return reply
          .header('Content-Type', 'application/pdf')
          .header(
            'Content-Disposition',
            `inline; filename="stock-labels-${batchNumber}-${count}.pdf"`,
          )
          .header('X-Labels-Generated', String(count))
          .header('X-Batch-Number', batchNumber)
          .send(pdf)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to generate labels'
        return reply.code(400).send({ error: msg })
      }
    },
  )

  // GET /stock/items — ADMIN
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

  // POST /stock/scan — ADMIN + STOCK_KEEPER. State machine: IN / USED / TRANSFER.
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
        const scanResult = await scanItem(tenantId, userId, result.data.warehouseId, { id: result.data.id })
        return reply.send(scanResult)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Scan failed'
        return reply.code(400).send({ error: msg })
      }
    },
  )

  // DELETE /stock/items/:id — ADMIN
  fastify.delete(
    '/items/:id',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN)] },
    async (request, reply) => {
      const id = (request.params as { id: string }).id
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return reply.code(400).send({ error: 'Invalid item id' })
      }
      const { tenantId } = request.user as JWTPayload
      try {
        const result = await deleteItem(tenantId, id)
        return reply.send(result)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Delete failed'
        const code = msg === 'Stock item not found' ? 404 : 400
        return reply.code(code).send({ error: msg })
      }
    },
  )

  // GET /stock/movements — ADMIN
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

  // GET /stock/stats — ADMIN: dashboard KPI numbers
  fastify.get(
    '/stats',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN)] },
    async (request, reply) => {
      const { tenantId } = request.user as JWTPayload
      const stats = await getStats(tenantId)
      return reply.send(stats)
    },
  )

  // GET /stock/summary — ADMIN: per-product aggregates for Stock page
  fastify.get(
    '/summary',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN)] },
    async (request, reply) => {
      const { tenantId } = request.user as JWTPayload
      const summary = await getSummary(tenantId)
      return reply.send({ summary })
    },
  )
}
