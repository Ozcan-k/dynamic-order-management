import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { JWTPayload, UserRole } from '@dom/shared'
import { prisma } from '../lib/prisma'
import {
  createStore,
  deleteStore,
  listStores,
  listStoresForAdmin,
  previewRename,
  renameStore,
  setStoreActive,
  UnknownStoreError,
  type Actor,
} from '../services/storeService'
import { requireRole } from '../middleware/rbac'
import {
  CalendarQuerySchema,
  DayDetailQuerySchema,
  GetActivityQuerySchema,
  UpsertActivitySchema,
  getActivity,
  getCalendar,
  getDayDetail,
  upsertActivity,
} from '../services/salesActivityService'
import { z } from 'zod'
import {
  CreateDirectOrderSchema,
  ListDirectOrderQuerySchema,
  SuggestQuerySchema,
  UpdateDirectOrderSchema,
  createDirectOrder,
  deleteDirectOrder,
  getDirectOrderById,
  listOwnDirectOrders,
  suggestCompanies,
  suggestCustomers,
  suggestProducts,
  updateDirectOrder,
} from '../services/salesDirectOrderService'

const OrderIdParam = z.object({ id: z.string().min(1).max(80) })

export default async function salesRoutes(fastify: FastifyInstance) {
  const agentOnly = [fastify.authenticate, requireRole(UserRole.SALES_AGENT)]

  // GET /sales/stores — active store names (managed in Settings → Stores). Any signed-in
  // user may read it: sales agents, the Marketing Report filters and Return/Cancel use it.
  // ?all=1 also returns archived stores (report filters still need their history).
  fastify.get('/stores', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { tenantId } = request.user as JWTPayload
    const all = (request.query as { all?: string }).all === '1'
    const rows = await listStores(tenantId, { includeArchived: all })
    return reply.send({ stores: rows.map((s) => s.name), items: rows })
  })

  // ─── Store management (Settings → Stores) — ADMIN only ─────────────────────
  const adminOnly = [fastify.authenticate, requireRole(UserRole.ADMIN)]
  const StoreNameBody = z.object({ name: z.string().trim().min(1, 'Store name is required').max(60) })
  const StoreIdParam = z.object({ id: z.string().uuid() })

  const actorOf = async (request: FastifyRequest): Promise<Actor> => {
    const { userId } = request.user as JWTPayload
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } })
    return { userId, username: u?.username ?? null }
  }
  // Store errors carry a 4xx statusCode; send them in the `{ error }` shape the UI reads
  const storeError = (reply: FastifyReply, e: unknown) => {
    const status = (e as { statusCode?: number })?.statusCode
    if (status && status < 500) return reply.code(status).send({ error: (e as Error).message })
    throw e
  }

  // GET /sales/stores/manage — every store (incl. archived) + usage counts + recent changes
  fastify.get('/stores/manage', { preHandler: adminOnly }, async (request, reply) => {
    const { tenantId } = request.user as JWTPayload
    return reply.send(await listStoresForAdmin(tenantId))
  })

  // POST /sales/stores — add a store
  fastify.post('/stores', { preHandler: adminOnly }, async (request, reply) => {
    const body = StoreNameBody.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Invalid name' })
    const { tenantId } = request.user as JWTPayload
    try {
      return reply.code(201).send({ store: await createStore(tenantId, body.data.name, await actorOf(request)) })
    } catch (e) { return storeError(reply, e) }
  })

  // GET /sales/stores/:id/rename-preview?name= — how many records a rename rewrites
  fastify.get('/stores/:id/rename-preview', { preHandler: adminOnly }, async (request, reply) => {
    const params = StoreIdParam.safeParse(request.params)
    const q = StoreNameBody.safeParse(request.query)
    if (!params.success) return reply.code(400).send({ error: 'Invalid store id' })
    if (!q.success) return reply.code(400).send({ error: q.error.issues[0]?.message ?? 'Invalid name' })
    const { tenantId } = request.user as JWTPayload
    try {
      return reply.send(await previewRename(tenantId, params.data.id, q.data.name))
    } catch (e) { return storeError(reply, e) }
  })

  // POST /sales/stores/:id/rename — store + every record using the old name, one transaction
  fastify.post('/stores/:id/rename', { preHandler: adminOnly }, async (request, reply) => {
    const params = StoreIdParam.safeParse(request.params)
    const body = StoreNameBody.safeParse(request.body)
    if (!params.success) return reply.code(400).send({ error: 'Invalid store id' })
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Invalid name' })
    const { tenantId } = request.user as JWTPayload
    try {
      return reply.send(await renameStore(tenantId, params.data.id, body.data.name, await actorOf(request)))
    } catch (e) { return storeError(reply, e) }
  })

  // POST /sales/stores/:id/archive | /restore — hide from / return to new entries
  for (const [path, active] of [['archive', false], ['restore', true]] as const) {
    fastify.post(`/stores/:id/${path}`, { preHandler: adminOnly }, async (request, reply) => {
      const params = StoreIdParam.safeParse(request.params)
      if (!params.success) return reply.code(400).send({ error: 'Invalid store id' })
      const { tenantId } = request.user as JWTPayload
      try {
        const store = await setStoreActive(tenantId, params.data.id, active, await actorOf(request))
        return reply.send({ store: { id: store.id, name: store.name, isActive: store.isActive } })
      } catch (e) { return storeError(reply, e) }
    })
  }

  // DELETE /sales/stores/:id — only a store no record has ever used
  fastify.delete('/stores/:id', { preHandler: adminOnly }, async (request, reply) => {
    const params = StoreIdParam.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'Invalid store id' })
    const { tenantId } = request.user as JWTPayload
    try {
      await deleteStore(tenantId, params.data.id, await actorOf(request))
      return reply.code(204).send()
    } catch (e) { return storeError(reply, e) }
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

  // GET /sales/day-detail?date=YYYY-MM-DD — populates the calendar popup
  fastify.get('/day-detail', { preHandler: agentOnly }, async (request, reply) => {
    const result = DayDetailQuerySchema.safeParse(request.query)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid query', details: result.error.flatten() })
    }
    const { tenantId, userId } = request.user as JWTPayload
    const detail = await getDayDetail(tenantId, userId, result.data.date)
    return reply.send(detail)
  })

  // PUT /sales/activity — idempotent upsert (auto-save target)
  fastify.put('/activity', { preHandler: agentOnly }, async (request, reply) => {
    const result = UpsertActivitySchema.safeParse(request.body)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: result.error.flatten() })
    }
    const { tenantId, userId } = request.user as JWTPayload
    try {
      const out = await upsertActivity(tenantId, userId, result.data)
      return reply.send({ ok: true, ...out })
    } catch (e) { if (e instanceof UnknownStoreError) return reply.code(400).send({ error: e.message }); throw e }
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
    try {
      const order = await createDirectOrder(tenantId, userId, result.data)
      return reply.code(201).send({ order })
    } catch (e) { if (e instanceof UnknownStoreError) return reply.code(400).send({ error: e.message }); throw e }
  })

  // GET /sales/orders/:id — own order (used to prefill edit form)
  fastify.get('/orders/:id', { preHandler: agentOnly }, async (request, reply) => {
    const params = OrderIdParam.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'Invalid order id' })
    const { tenantId, userId } = request.user as JWTPayload
    const order = await getDirectOrderById(params.data.id, tenantId, userId)
    if (!order) return reply.code(404).send({ error: 'Order not found' })
    return reply.send({ order })
  })

  // PUT /sales/orders/:id — full-replace update (own order only)
  fastify.put('/orders/:id', { preHandler: agentOnly }, async (request, reply) => {
    const params = OrderIdParam.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'Invalid order id' })
    const body = UpdateDirectOrderSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: body.error.flatten() })
    }
    const { tenantId, userId } = request.user as JWTPayload
    try {
      const order = await updateDirectOrder(params.data.id, tenantId, userId, body.data)
      if (!order) return reply.code(404).send({ error: 'Order not found' })
      return reply.send({ order })
    } catch (e) { if (e instanceof UnknownStoreError) return reply.code(400).send({ error: e.message }); throw e }
  })

  // DELETE /sales/orders/:id — own order only (items cascade)
  fastify.delete('/orders/:id', { preHandler: agentOnly }, async (request, reply) => {
    const params = OrderIdParam.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'Invalid order id' })
    const { tenantId, userId } = request.user as JWTPayload
    const ok = await deleteDirectOrder(params.data.id, tenantId, userId)
    if (!ok) return reply.code(404).send({ error: 'Order not found' })
    return reply.code(204).send()
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
