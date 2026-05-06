import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { UserRole, JWTPayload } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import {
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  listCategories,
  createCategory,
  deleteCategory,
} from '../services/productService'

const UUID = z.string().uuid()

const CategoryBodySchema = z.object({
  name: z.string().min(1).max(80),
})

const ProductBodySchema = z.object({
  categoryId: UUID,
  productCode: z.string().min(1).max(60),
  name: z.string().min(1).max(120),
  defaultUnit: z.enum(['KG', 'PCS']),
  reservedThreshold: z.number().min(0).max(1_000_000),
})

const ProductPatchSchema = ProductBodySchema.partial()

const ListProductsQuerySchema = z.object({
  categoryId: UUID.optional(),
})

export default async function productRoutes(fastify: FastifyInstance) {
  // ─── Categories ─────────────────────────────────────────────────────────

  fastify.get(
    '/categories',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.STOCK_KEEPER)] },
    async (request, reply) => {
      const { tenantId } = request.user as JWTPayload
      const categories = await listCategories(tenantId)
      return reply.send({ categories })
    },
  )

  fastify.post(
    '/categories',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN)] },
    async (request, reply) => {
      const result = CategoryBodySchema.safeParse(request.body)
      if (!result.success) {
        return reply.code(400).send({ error: 'Invalid request body', details: result.error.flatten() })
      }
      const { tenantId } = request.user as JWTPayload
      try {
        const created = await createCategory(tenantId, result.data)
        return reply.code(201).send(created)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to create category'
        return reply.code(400).send({ error: msg })
      }
    },
  )

  fastify.delete(
    '/categories/:id',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN)] },
    async (request, reply) => {
      const idResult = UUID.safeParse((request.params as { id: string }).id)
      if (!idResult.success) return reply.code(400).send({ error: 'Invalid category id' })
      const { tenantId } = request.user as JWTPayload
      try {
        const result = await deleteCategory(tenantId, idResult.data)
        return reply.send(result)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Delete failed'
        const code = msg === 'Category not found' ? 404 : 409
        return reply.code(code).send({ error: msg })
      }
    },
  )

  // ─── Products ───────────────────────────────────────────────────────────

  fastify.get(
    '/',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.STOCK_KEEPER)] },
    async (request, reply) => {
      const result = ListProductsQuerySchema.safeParse(request.query)
      if (!result.success) {
        return reply.code(400).send({ error: 'Invalid query', details: result.error.flatten() })
      }
      const { tenantId } = request.user as JWTPayload
      const products = await listProducts(tenantId, result.data)
      return reply.send({ products })
    },
  )

  fastify.post(
    '/',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN)] },
    async (request, reply) => {
      const result = ProductBodySchema.safeParse(request.body)
      if (!result.success) {
        return reply.code(400).send({ error: 'Invalid request body', details: result.error.flatten() })
      }
      const { tenantId } = request.user as JWTPayload
      try {
        const created = await createProduct(tenantId, result.data)
        return reply.code(201).send(created)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to create product'
        return reply.code(400).send({ error: msg })
      }
    },
  )

  fastify.put(
    '/:id',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN)] },
    async (request, reply) => {
      const idResult = UUID.safeParse((request.params as { id: string }).id)
      if (!idResult.success) return reply.code(400).send({ error: 'Invalid product id' })
      const result = ProductPatchSchema.safeParse(request.body)
      if (!result.success) {
        return reply.code(400).send({ error: 'Invalid request body', details: result.error.flatten() })
      }
      const { tenantId } = request.user as JWTPayload
      try {
        const updated = await updateProduct(tenantId, idResult.data, result.data)
        return reply.send(updated)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Update failed'
        const code = msg === 'Product not found' ? 404 : 400
        return reply.code(code).send({ error: msg })
      }
    },
  )

  fastify.delete(
    '/:id',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN)] },
    async (request, reply) => {
      const idResult = UUID.safeParse((request.params as { id: string }).id)
      if (!idResult.success) return reply.code(400).send({ error: 'Invalid product id' })
      const { tenantId } = request.user as JWTPayload
      try {
        const result = await deleteProduct(tenantId, idResult.data)
        return reply.send(result)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Delete failed'
        const code = msg === 'Product not found' ? 404 : 409
        return reply.code(code).send({ error: msg })
      }
    },
  )
}
