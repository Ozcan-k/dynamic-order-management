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
import {
  CreateDirectOrderSchema,
  ListDirectOrderQuerySchema,
  SuggestQuerySchema,
  createDirectOrder,
  listOwnDirectOrders,
  suggestCompanies,
  suggestCustomers,
  suggestProducts,
} from '../services/salesDirectOrderService'

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

  // GET /sales/orders?date=&from=&to=&store=&channel=
  fastify.get('/orders', { preHandler: agentOnly }, async (request, reply) => {
    const result = ListDirectOrderQuerySchema.safeParse(request.query)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid query', details: result.error.flatten() })
    }
    const { tenantId, userId } = request.user as JWTPayload
    const orders = await listOwnDirectOrders(tenantId, userId, result.data)
    return reply.send({ orders })
  })

  // POST /sales/orders — create direct order with items
  fastify.post('/orders', { preHandler: agentOnly }, async (request, reply) => {
    const result = CreateDirectOrderSchema.safeParse(request.body)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: result.error.flatten() })
    }
    const { tenantId, userId } = request.user as JWTPayload
    const order = await createDirectOrder(tenantId, userId, result.data)
    return reply.code(201).send({ order })
  })

  // GET /sales/suggest/companies?q=
  fastify.get('/suggest/companies', { preHandler: agentOnly }, async (request, reply) => {
    const result = SuggestQuerySchema.safeParse(request.query)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid query', details: result.error.flatten() })
    }
    const { tenantId, userId } = request.user as JWTPayload
    const suggestions = await suggestCompanies(tenantId, userId, result.data.q)
    return reply.send({ suggestions })
  })

  // GET /sales/suggest/customers?q=
  fastify.get('/suggest/customers', { preHandler: agentOnly }, async (request, reply) => {
    const result = SuggestQuerySchema.safeParse(request.query)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid query', details: result.error.flatten() })
    }
    const { tenantId, userId } = request.user as JWTPayload
    const suggestions = await suggestCustomers(tenantId, userId, result.data.q)
    return reply.send({ suggestions })
  })

  // GET /sales/suggest/products?q=
  fastify.get('/suggest/products', { preHandler: agentOnly }, async (request, reply) => {
    const result = SuggestQuerySchema.safeParse(request.query)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid query', details: result.error.flatten() })
    }
    const { tenantId, userId } = request.user as JWTPayload
    const suggestions = await suggestProducts(tenantId, userId, result.data.q)
    return reply.send({ suggestions })
  })
}
