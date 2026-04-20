import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { JWTPayload, UserRole } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
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

const AgentIdParam = z.object({ id: z.string().min(1) })

export default async function marketingRoutes(fastify: FastifyInstance) {
  const adminOnly = [fastify.authenticate, requireRole(UserRole.ADMIN)]

  // GET /marketing/agents — list of active sales agents in this tenant
  fastify.get('/agents', { preHandler: adminOnly }, async (request, reply) => {
    const { tenantId } = request.user as JWTPayload
    const agents = await listAgents(tenantId)
    return reply.send({ agents })
  })

  // GET /marketing/leaderboard?from=&to=
  fastify.get('/leaderboard', { preHandler: adminOnly }, async (request, reply) => {
    const result = RangeQuerySchema.safeParse(request.query)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid query', details: result.error.flatten() })
    }
    const { tenantId } = request.user as JWTPayload
    const rows = await getLeaderboard(tenantId, result.data.from, result.data.to)
    return reply.send({ rows })
  })

  // GET /marketing/comparison?from=&to=
  fastify.get('/comparison', { preHandler: adminOnly }, async (request, reply) => {
    const result = RangeQuerySchema.safeParse(request.query)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid query', details: result.error.flatten() })
    }
    const { tenantId } = request.user as JWTPayload
    const trends = await getComparison(tenantId, result.data.from, result.data.to)
    return reply.send({ trends })
  })

  // GET /marketing/agents/:id/calendar?month=YYYY-MM
  fastify.get('/agents/:id/calendar', { preHandler: adminOnly }, async (request, reply) => {
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
  fastify.get('/agents/:id/day-detail', { preHandler: adminOnly }, async (request, reply) => {
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
  fastify.get('/agents/:id/activity', { preHandler: adminOnly }, async (request, reply) => {
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
}
