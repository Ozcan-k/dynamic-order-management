import { FastifyInstance } from 'fastify'
import { UserRole, JWTPayload } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import { findPickerByPin } from '../services/authService'
import { setSession } from '../plugins/auth'
import { getMyOrders, completeByTracking } from '../services/pickerService'

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 8,
}

export default async function pickerRoutes(fastify: FastifyInstance) {
  const authHandler = [fastify.authenticate, requireRole(UserRole.PICKER)]

  // POST /picker/auth — PIN ile oturum aç (public, auth gerekmez)
  fastify.post('/auth', async (request, reply) => {
    const { pin } = request.body as { pin?: string }
    if (!pin || !/^\d{4}$/.test(pin)) {
      return reply.code(400).send({ error: 'A 4-digit PIN is required' })
    }

    const user = await findPickerByPin(pin)
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

  // GET /picker/orders — picker'ın aktif orderları
  fastify.get('/orders', { preHandler: authHandler }, async (request, reply) => {
    const { userId, tenantId } = request.user as JWTPayload
    const orders = await getMyOrders(userId, tenantId)
    return reply.send({ orders })
  })

  // POST /picker/complete — tracking number ile order tamamla
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
      const code = message.includes('not found') ? 404
        : message.includes('not assigned') ? 403
        : 400
      return reply.code(code).send({ error: message })
    }
  })
}
