import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { findUserByUsername, verifyPassword } from '../services/authService'
import { setSession, deleteSession } from '../plugins/auth'
import { JWTPayload } from '@dom/shared'

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 8, // 8 hours
}

export default async function authRoutes(fastify: FastifyInstance) {
  // POST /auth/login
  fastify.post('/login', async (request, reply) => {
    const result = LoginSchema.safeParse(request.body)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: result.error.flatten() })
    }

    const { username, password } = result.data
    const user = await findUserByUsername(username)
    if (!user || !user.tenant.isActive) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const payload: JWTPayload = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role as JWTPayload['role'],
    }

    const token = fastify.jwt.sign(payload)
    await setSession(user.id, payload)

    return reply
      .setCookie('access_token', token, COOKIE_OPTIONS)
      .send({
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          tenantId: user.tenantId,
        },
      })
  })

  // POST /auth/logout
  fastify.post(
    '/logout',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { userId } = request.user as JWTPayload
      await deleteSession(userId)
      return reply
        .clearCookie('access_token', { path: '/' })
        .send({ message: 'Logged out successfully' })
    },
  )

  // GET /auth/me — check current session
  fastify.get(
    '/me',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      return reply.send({ user: request.user })
    },
  )
}
