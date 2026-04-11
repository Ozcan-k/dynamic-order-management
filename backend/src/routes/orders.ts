import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { UserRole, JWTPayload, Carrier } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import {
  scanOrder,
  bulkScanOrders,
  getDistinctShopNames,
  listOrders,
  deleteOrder,
  getOrderStats,
} from '../services/orderService'

const ScanSchema = z.object({
  trackingNumber: z.string().min(1).max(100),
  carrierName: z.nativeEnum(Carrier).optional(),
  shopName: z.string().min(1).max(100).optional(),
})

const BulkScanSchema = z.object({
  trackingNumbers: z.array(z.string().min(1).max(100)).min(1).max(200),
  carrierName: z.nativeEnum(Carrier),
  shopName: z.string().min(1).max(100),
})

export default async function orderRoutes(fastify: FastifyInstance) {
  // POST /orders/scan — ADMIN, INBOUND_ADMIN
  fastify.post(
    '/scan',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.INBOUND_ADMIN)] },
    async (request, reply) => {
      const result = ScanSchema.safeParse(request.body)
      if (!result.success) {
        return reply.code(400).send({ error: 'Invalid request body', details: result.error.flatten() })
      }

      const { userId, tenantId } = request.user as JWTPayload
      const { trackingNumber, carrierName, shopName } = result.data

      const { duplicate, order } = await scanOrder(trackingNumber, userId, tenantId, { carrierName, shopName })
      if (duplicate) {
        return reply.code(409).send({ error: 'Tracking number already exists', order })
      }

      return reply.code(201).send({ order })
    },
  )

  // POST /orders/bulk-scan — ADMIN, INBOUND_ADMIN
  fastify.post(
    '/bulk-scan',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.INBOUND_ADMIN)] },
    async (request, reply) => {
      const result = BulkScanSchema.safeParse(request.body)
      if (!result.success) {
        return reply.code(400).send({ error: 'Invalid request body', details: result.error.flatten() })
      }

      const { userId, tenantId } = request.user as JWTPayload
      const { trackingNumbers, carrierName, shopName } = result.data

      const summary = await bulkScanOrders(trackingNumbers, userId, tenantId, carrierName, shopName)
      return reply.code(201).send(summary)
    },
  )

  // GET /orders/shops — ADMIN, INBOUND_ADMIN
  fastify.get(
    '/shops',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.INBOUND_ADMIN)] },
    async (request, reply) => {
      const { tenantId } = request.user as JWTPayload
      const shops = await getDistinctShopNames(tenantId)
      return reply.send({ shops })
    },
  )

  // GET /orders — ADMIN, INBOUND_ADMIN, PICKER_ADMIN, PACKER_ADMIN
  fastify.get(
    '/',
    {
      preHandler: [
        fastify.authenticate,
        requireRole(UserRole.ADMIN, UserRole.INBOUND_ADMIN, UserRole.PICKER_ADMIN, UserRole.PACKER_ADMIN),
      ],
    },
    async (request, reply) => {
      const { tenantId } = request.user as JWTPayload
      const orders = await listOrders(tenantId)
      return reply.send({ orders })
    },
  )

  // GET /orders/stats — ADMIN, INBOUND_ADMIN, PICKER_ADMIN, PACKER_ADMIN
  fastify.get(
    '/stats',
    {
      preHandler: [
        fastify.authenticate,
        requireRole(UserRole.ADMIN, UserRole.INBOUND_ADMIN, UserRole.PICKER_ADMIN, UserRole.PACKER_ADMIN),
      ],
    },
    async (request, reply) => {
      const { tenantId } = request.user as JWTPayload
      return reply.send(await getOrderStats(tenantId))
    },
  )

  // DELETE /orders/:id — ADMIN, INBOUND_ADMIN
  fastify.delete(
    '/:id',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.INBOUND_ADMIN)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { tenantId } = request.user as JWTPayload

      try {
        await deleteOrder(id, tenantId)
        return reply.send({ message: 'Order deleted' })
      } catch {
        return reply.code(404).send({ error: 'Order not found' })
      }
    },
  )
}
