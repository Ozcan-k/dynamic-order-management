import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { UserRole, JWTPayload, Carrier } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import { getIO } from '../lib/socket'
import { prisma } from '../lib/prisma'
import { redis } from '../lib/redis'
import {
  scanOrder,
  bulkScanOrders,
  getDistinctShopNames,
  listOrders,
  deleteOrder,
  getOrderStats,
} from '../services/orderService'

const PENDING_TTL = 300 // 5 minutes

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

      try { getIO().to(`user:${userId}`).emit('order:scanned', { order }) } catch {}
      return reply.code(201).send({ order })
    },
  )

  // POST /orders/handheld-scan — phone signals desktop to open QuickScanModal (no DB write)
  fastify.post(
    '/handheld-scan',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.INBOUND_ADMIN)] },
    async (request, reply) => {
      const result = z.object({ trackingNumber: z.string().min(1).max(100) }).safeParse(request.body)
      if (!result.success) return reply.code(400).send({ error: 'Invalid request body' })
      const { userId, tenantId } = request.user as JWTPayload
      const tn = result.data.trackingNumber.trim().toUpperCase()

      const existing = await prisma.order.findUnique({
        where: { tenantId_trackingNumber: { tenantId, trackingNumber: tn } },
      })
      if (existing) {
        return reply.code(409).send({ error: `Already exists: ${tn}` })
      }

      // Persist in Redis so desktop picks it up even if the page opens after this event
      await redis.setex(`pending:handheld:single:${userId}`, PENDING_TTL, tn)
      try { getIO().to(`user:${userId}`).emit('order:handheld-scan', { trackingNumber: tn }) } catch {}
      return reply.send({ ok: true })
    },
  )

  // POST /orders/handheld-bulk-scan — phone signals desktop to open BulkScanModal (no DB write)
  fastify.post(
    '/handheld-bulk-scan',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.INBOUND_ADMIN)] },
    async (request, reply) => {
      const result = z.object({ trackingNumbers: z.array(z.string().min(1).max(100)).min(1).max(200) }).safeParse(request.body)
      if (!result.success) return reply.code(400).send({ error: 'Invalid request body' })
      const { userId } = request.user as JWTPayload
      const tns = result.data.trackingNumbers
      // Persist in Redis so desktop picks it up even if the page opens after this event
      await redis.setex(`pending:handheld:bulk:${userId}`, PENDING_TTL, JSON.stringify(tns))
      try { getIO().to(`user:${userId}`).emit('order:handheld-bulk-scan', { trackingNumbers: tns }) } catch {}
      return reply.send({ ok: true })
    },
  )

  // GET /orders/pending-handheld — desktop polls on page load to catch missed socket events
  fastify.get(
    '/pending-handheld',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.INBOUND_ADMIN)] },
    async (request, reply) => {
      const { userId } = request.user as JWTPayload
      const [single, bulkRaw] = await Promise.all([
        redis.getdel(`pending:handheld:single:${userId}`),
        redis.getdel(`pending:handheld:bulk:${userId}`),
      ])
      const bulk = bulkRaw ? (JSON.parse(bulkRaw) as string[]) : null
      return reply.send({ single: single ?? null, bulk })
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
