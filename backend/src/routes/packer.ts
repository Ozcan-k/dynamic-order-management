import { FastifyInstance } from 'fastify'
import { UserRole, JWTPayload } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import { findPackerByPin } from '../services/authService'
import { setSession } from '../plugins/auth'
import { getAllPickerCompleteOrders, completeByTracking } from '../services/packerService'

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 8,
}

export default async function packerRoutes(fastify: FastifyInstance) {
  const authHandler = [fastify.authenticate, requireRole(UserRole.PACKER)]

  // POST /packer/auth — PIN login (public, no auth required)
  fastify.post('/auth', async (request, reply) => {
    const { pin } = request.body as { pin?: string }
    if (!pin || !/^\d{4}$/.test(pin)) {
      return reply.code(400).send({ error: 'A 4-digit PIN is required' })
    }

    const user = await findPackerByPin(pin)
    if (!user || !user.tenant.isActive) {
      return reply.code(401).send({ error: 'Invalid PIN' })
    }

    const payload: JWTPayload = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role as JWTPayload['role'],
    }

    const token = fastify.jwt.sign(payload)
    await setSession(user.id, payload)

    return reply.setCookie('access_token', token, COOKIE_OPTIONS).send({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        tenantId: user.tenantId,
      },
    })
  })

  // GET /packer/orders — all PICKER_COMPLETE orders (shared queue)
  fastify.get('/orders', { preHandler: authHandler }, async (request, reply) => {
    const { tenantId } = request.user as JWTPayload
    const orders = await getAllPickerCompleteOrders(tenantId)
    return reply.send({ orders })
  })

  // POST /packer/complete — scan tracking number → PACKER_COMPLETE
  fastify.post('/complete', { preHandler: authHandler }, async (request, reply) => {
    const { trackingNumber } = request.body as { trackingNumber?: string }
    if (!trackingNumber?.trim()) {
      return reply.code(400).send({ error: 'trackingNumber is required' })
    }
    const { userId, tenantId } = request.user as JWTPayload
    try {
      const order = await completeByTracking(trackingNumber.trim(), userId, tenantId)
      return reply.send({ order })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Complete failed'
      const code = message.includes('not found') ? 404 : 409
      return reply.code(code).send({ error: message })
    }
  })
}
