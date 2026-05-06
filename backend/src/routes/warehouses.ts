import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { UserRole, JWTPayload } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import {
  listWarehouses,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
} from '../services/warehouseService'

const UUID = z.string().uuid()

const WarehouseBodySchema = z.object({
  name: z.string().min(1).max(80),
  address: z.string().min(1).max(300),
})

const WarehousePatchSchema = WarehouseBodySchema.partial()

export default async function warehouseRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.STOCK_KEEPER)] },
    async (request, reply) => {
      const { tenantId } = request.user as JWTPayload
      const warehouses = await listWarehouses(tenantId)
      return reply.send({ warehouses })
    },
  )

  fastify.post(
    '/',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN)] },
    async (request, reply) => {
      const result = WarehouseBodySchema.safeParse(request.body)
      if (!result.success) {
        return reply.code(400).send({ error: 'Invalid request body', details: result.error.flatten() })
      }
      const { tenantId } = request.user as JWTPayload
      try {
        const created = await createWarehouse(tenantId, result.data)
        return reply.code(201).send(created)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to create warehouse'
        return reply.code(400).send({ error: msg })
      }
    },
  )

  fastify.put(
    '/:id',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN)] },
    async (request, reply) => {
      const idResult = UUID.safeParse((request.params as { id: string }).id)
      if (!idResult.success) return reply.code(400).send({ error: 'Invalid warehouse id' })
      const result = WarehousePatchSchema.safeParse(request.body)
      if (!result.success) {
        return reply.code(400).send({ error: 'Invalid request body', details: result.error.flatten() })
      }
      const { tenantId } = request.user as JWTPayload
      try {
        const updated = await updateWarehouse(tenantId, idResult.data, result.data)
        return reply.send(updated)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Update failed'
        const code = msg === 'Warehouse not found' ? 404 : 400
        return reply.code(code).send({ error: msg })
      }
    },
  )

  fastify.delete(
    '/:id',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN)] },
    async (request, reply) => {
      const idResult = UUID.safeParse((request.params as { id: string }).id)
      if (!idResult.success) return reply.code(400).send({ error: 'Invalid warehouse id' })
      const { tenantId } = request.user as JWTPayload
      try {
        const result = await deleteWarehouse(tenantId, idResult.data)
        return reply.send(result)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Delete failed'
        const code = msg === 'Warehouse not found' ? 404 : 409
        return reply.code(code).send({ error: msg })
      }
    },
  )
}
