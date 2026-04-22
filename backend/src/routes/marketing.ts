import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { JWTPayload, UserRole } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import { auditMarketingAccess } from '../middleware/auditLog'
import {
  RangeQuerySchema,
  assertAgentInTenant,
  getComparison,
  getLeaderboard,
  listAgents,
} from '../services/marketingReportService'
import {
  CalendarQuerySchema,
  DayDetailQuerySchema,
  GetActivityQuerySchema,
  getActivity,
  getCalendar,
  getDayDetail,
} from '../services/salesActivityService'
import {
  UpdateDirectOrderSchema,
  deleteDirectOrder,
  getDirectOrderById,
  updateDirectOrder,
} from '../services/salesDirectOrderService'

const AgentIdParam = z.object({ id: z.string().min(1) })
const OrderIdParam = z.object({ id: z.string().min(1).max(80) })

export default async function marketingRoutes(fastify: FastifyInstance) {
  const marketingViewers = [
    fastify.authenticate,
    requireRole(UserRole.ADMIN, UserRole.SALES_AGENT),
    auditMarketingAccess,
  ]
  // Mutating any agent's direct orders — ADMIN only (audited)
  const marketingAdmin = [
    fastify.authenticate,
    requireRole(UserRole.ADMIN),
    auditMarketingAccess,
  ]

  // GET /marketing/agents — list of active sales agents in this tenant
  fastify.get('/agents', { preHandler: marketingViewers }, async (request, reply) => {
    const { tenantId } = request.user as JWTPayload
    const agents = await listAgents(tenantId)
    return reply.send({ agents })
  })

  // GET /marketing/leaderboard?from=&to=
  fastify.get('/leaderboard', { preHandler: marketingViewers }, async (request, reply) => {
    const result = RangeQuerySchema.safeParse(request.query)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid query', details: result.error.flatten() })
    }
    const { tenantId } = request.user as JWTPayload
    const rows = await getLeaderboard(tenantId, result.data.from, result.data.to)
    return reply.send({ rows })
  })

  // GET /marketing/comparison?from=&to=
  fastify.get('/comparison', { preHandler: marketingViewers }, async (request, reply) => {
    const result = RangeQuerySchema.safeParse(request.query)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid query', details: result.error.flatten() })
    }
    const { tenantId } = request.user as JWTPayload
    const trends = await getComparison(tenantId, result.data.from, result.data.to)
    return reply.send({ trends })
  })

  // GET /marketing/agents/:id/calendar?month=YYYY-MM
  fastify.get('/agents/:id/calendar', { preHandler: marketingViewers }, async (request, reply) => {
    const params = AgentIdParam.safeParse(request.params)
    const query = CalendarQuerySchema.safeParse(request.query)
    if (!params.success || !query.success) {
      return reply.code(400).send({ error: 'Invalid request' })
    }
    const { tenantId } = request.user as JWTPayload
    await assertAgentInTenant(tenantId, params.data.id)
    const days = await getCalendar(tenantId, params.data.id, query.data.month)
    return reply.send({ month: query.data.month, days })
  })

  // GET /marketing/agents/:id/day-detail?date=YYYY-MM-DD
  fastify.get('/agents/:id/day-detail', { preHandler: marketingViewers }, async (request, reply) => {
    const params = AgentIdParam.safeParse(request.params)
    const query = DayDetailQuerySchema.safeParse(request.query)
    if (!params.success || !query.success) {
      return reply.code(400).send({ error: 'Invalid request' })
    }
    const { tenantId } = request.user as JWTPayload
    await assertAgentInTenant(tenantId, params.data.id)
    const detail = await getDayDetail(tenantId, params.data.id, query.data.date)
    return reply.send(detail)
  })

  // GET /marketing/agents/:id/activity?date=&store=  — full per-store detail (read-only)
  fastify.get('/agents/:id/activity', { preHandler: marketingViewers }, async (request, reply) => {
    const params = AgentIdParam.safeParse(request.params)
    const query = GetActivityQuerySchema.safeParse(request.query)
    if (!params.success || !query.success) {
      return reply.code(400).send({ error: 'Invalid request' })
    }
    const { tenantId } = request.user as JWTPayload
    await assertAgentInTenant(tenantId, params.data.id)
    const activity = await getActivity(tenantId, params.data.id, query.data.date, query.data.store)
    return reply.send(activity)
  })

  // GET /marketing/direct-orders/:id — ADMIN, any agent in tenant (prefill edit form)
  fastify.get('/direct-orders/:id', { preHandler: marketingAdmin }, async (request, reply) => {
    const params = OrderIdParam.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'Invalid order id' })
    const { tenantId } = request.user as JWTPayload
    const order = await getDirectOrderById(params.data.id, tenantId, null)
    if (!order) return reply.code(404).send({ error: 'Order not found' })
    return reply.send({ order })
  })

  // PUT /marketing/direct-orders/:id — ADMIN, any agent in tenant
  fastify.put('/direct-orders/:id', { preHandler: marketingAdmin }, async (request, reply) => {
    const params = OrderIdParam.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'Invalid order id' })
    const body = UpdateDirectOrderSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: body.error.flatten() })
    }
    const { tenantId } = request.user as JWTPayload
    const order = await updateDirectOrder(params.data.id, tenantId, null, body.data)
    if (!order) return reply.code(404).send({ error: 'Order not found' })
    return reply.send({ order })
  })

  // DELETE /marketing/direct-orders/:id — ADMIN, any agent in tenant
  fastify.delete('/direct-orders/:id', { preHandler: marketingAdmin }, async (request, reply) => {
    const params = OrderIdParam.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'Invalid order id' })
    const { tenantId } = request.user as JWTPayload
    const ok = await deleteDirectOrder(params.data.id, tenantId, null)
    if (!ok) return reply.code(404).send({ error: 'Order not found' })
    return reply.code(204).send()
  })
}
