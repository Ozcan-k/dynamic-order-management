import fp from 'fastify-plugin'
import fastifyJwt from '@fastify/jwt'
import fastifyCookie from '@fastify/cookie'
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { JWTPayload } from '@dom/shared'
import { redis } from '../lib/redis'

const SESSION_TTL = 60 * 60 * 8 // 8 hours in seconds

export function sessionKey(userId: string, deviceType: 'desktop' | 'handheld' = 'desktop') {
  return `session:${userId}:${deviceType}`
}

export async function setSession(userId: string, payload: JWTPayload) {
  const key = sessionKey(userId, payload.deviceType ?? 'desktop')
  await redis.set(key, JSON.stringify(payload), 'EX', SESSION_TTL)
}

export async function deleteSession(userId: string, deviceType: 'desktop' | 'handheld' = 'desktop') {
  await redis.del(sessionKey(userId, deviceType))
}

export async function getSession(userId: string, deviceType: 'desktop' | 'handheld' = 'desktop'): Promise<JWTPayload | null> {
  const data = await redis.get(sessionKey(userId, deviceType))
  if (!data) return null
  return JSON.parse(data) as JWTPayload
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JWTPayload
    user: JWTPayload
  }
}

export default fp(async (fastify: FastifyInstance) => {
  await fastify.register(fastifyCookie)

  await fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET || 'change_this_secret',
    cookie: {
      cookieName: 'access_token',
      signed: false,
    },
    sign: {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    },
  })

  fastify.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify()
        const payload = request.user as JWTPayload
        const session = await getSession(payload.userId, payload.deviceType ?? 'desktop')
        if (!session) {
          return reply.code(401).send({ error: 'Session expired. Please log in again.' })
        }
      } catch {
        return reply.code(401).send({ error: 'Unauthorized' })
      }
    },
  )
})
