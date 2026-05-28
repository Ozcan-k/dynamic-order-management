import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { UserRole, JWTPayload } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import {
  generateLabelsPdf,
  listItems,
  lookupItemById,
  scanItem,
  deleteItem,
  listMovements,
  getStats,
  getSummary,
  getOutSummary,
  adjustStock,
} from '../services/stockService'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const GenerateLabelsSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid().optional(),
  unit: z.enum(['KG', 'PCS']),
  quantity: z.number().positive().max(10000),
  count: z.number().int().min(1).max(500),
})

const ListItemsQuerySchema = z.object({
  status: z.enum(['PENDING', 'IN_STOCK', 'OUT_OF_STOCK']).optional(),
  productId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
})

const ScanSchema = z.object({
  id: z.string().uuid(),
  operation: z.enum(['IN', 'OUT', 'TRANSFER']),
  warehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid().optional(),
})

const AdjustSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  operation: z.enum(['ADD', 'REMOVE']),
  unit: z.enum(['KG', 'PCS']),
  quantity: z.number().positive().max(10000).optional(),
  boxes: z.number().int().min(1).max(500),
}).refine((v) => v.operation === 'REMOVE' || (v.quantity !== undefined && v.quantity > 0), {
  message: 'quantity is required when operation is ADD',
  path: ['quantity'],
})

const MovementsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

const OutSummaryQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD'),
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

  // GET /stock/lookup/:id — ADMIN + STOCK_KEEPER. Read-only label preview
  // used by Bulk Scan to populate the queue with productName/qty/unit before
  // the operator confirms the batch commit. Does not mutate status.
  fastify.get(
    '/lookup/:id',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.STOCK_KEEPER)] },
    async (request, reply) => {
      const id = (request.params as { id: string }).id
      if (!UUID_RE.test(id)) {
        return reply.code(400).send({ error: 'Invalid id' })
      }
      const { tenantId } = request.user as JWTPayload
      try {
        const item = await lookupItemById(tenantId, id)
        return reply.send({ item })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Lookup failed'
        return reply.code(404).send({ error: msg })
      }
    },
  )

  // POST /stock/scan — ADMIN + STOCK_KEEPER. Operation-driven:
  // IN flips PENDING/OUT_OF_STOCK → IN_STOCK at warehouseId.
  // OUT flips IN_STOCK → OUT_OF_STOCK.
  // TRANSFER moves IN_STOCK from current warehouse to toWarehouseId.
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
        const scanResult = await scanItem(tenantId, userId, result.data)
        return reply.send(scanResult)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Scan failed'
        return reply.code(400).send({ error: msg })
      }
    },
  )

  // POST /stock/adjust — ADMIN: manual stock adjustment (add or remove boxes
  // at a warehouse without using scanned labels). Records IN/USED movements
  // with an ADJ-prefixed batch number so they are auditable.
  fastify.post(
    '/adjust',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN)] },
    async (request, reply) => {
      const result = AdjustSchema.safeParse(request.body)
      if (!result.success) {
        return reply.code(400).send({ error: 'Invalid request body', details: result.error.flatten() })
      }
      const { tenantId, userId } = request.user as JWTPayload
      try {
        const adjResult = await adjustStock(tenantId, userId, {
          productId: result.data.productId,
          warehouseId: result.data.warehouseId,
          operation: result.data.operation,
          unit: result.data.unit,
          quantity: result.data.quantity,
          boxes: result.data.boxes,
        })
        return reply.send(adjResult)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Adjustment failed'
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

  // GET /stock/out-summary — ADMIN: per-product USED movement totals in a date range
  fastify.get(
    '/out-summary',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN)] },
    async (request, reply) => {
      const parsed = OutSummaryQuerySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid query', details: parsed.error.flatten() })
      }
      const { tenantId } = request.user as JWTPayload
      const from = new Date(`${parsed.data.from}T00:00:00.000Z`)
      const to = new Date(`${parsed.data.to}T23:59:59.999Z`)
      const summary = await getOutSummary(tenantId, from, to)
      return reply.send({ summary })
    },
  )
}
