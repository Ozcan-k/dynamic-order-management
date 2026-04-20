import { FastifyInstance } from 'fastify'
import { JWTPayload, SALES_STORES, UserRole } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import {
  CalendarQuerySchema,
  GetActivityQuerySchema,
  UpsertActivitySchema,
  getActivity,
  getCalendar,
  upsertActivity,
} from '../services/salesActivityService'

export default async function salesRoutes(fastify: FastifyInstance) {
  const agentOnly = [fastify.authenticate, requireRole(UserRole.SALES_AGENT)]

  // GET /sales/stores — static list, useful for client cache
  fastify.get('/stores', { preHandler: agentOnly }, async (_request, reply) => {
    return reply.send({ stores: SALES_STORES })
  })

  // GET /sales/calendar?month=YYYY-MM
  fastify.get('/calendar', { preHandler: agentOnly }, async (request, reply) => {
    const result = CalendarQuerySchema.safeParse(request.query)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid query', details: result.error.flatten() })
    }
    const { tenantId, userId } = request.user as JWTPayload
    const days = await getCalendar(tenantId, userId, result.data.month)
    return reply.send({ month: result.data.month, days })
  })

  // GET /sales/activity?date=YYYY-MM-DD&store=NAME
  fastify.get('/activity', { preHandler: agentOnly }, async (request, reply) => {
    const result = GetActivityQuerySchema.safeParse(request.query)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid query', details: result.error.flatten() })
    }
    const { tenantId, userId } = request.user as JWTPayload
    const activity = await getActivity(tenantId, userId, result.data.date, result.data.store)
    return reply.send(activity)
  })

  // PUT /sales/activity — idempotent upsert (auto-save target)
  fastify.put('/activity', { preHandler: agentOnly }, async (request, reply) => {
    const result = UpsertActivitySchema.safeParse(request.body)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: result.error.flatten() })
    }
    const { tenantId, userId } = request.user as JWTPayload
    const out = await upsertActivity(tenantId, userId, result.data)
    return reply.send({ ok: true, ...out })
  })
}
