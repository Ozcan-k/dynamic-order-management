import { FastifyReply, FastifyRequest } from 'fastify'
import { UserRole, JWTPayload } from '@dom/shared'

/**
 * Middleware factory: restricts a route to users with one of the given roles.
 * Usage: preHandler: [fastify.authenticate, requireRole('ADMIN', 'PICKER_ADMIN')]
 */
export function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as JWTPayload
    if (!roles.includes(user.role as UserRole)) {
      return reply.code(403).send({ error: 'Forbidden: insufficient permissions' })
    }
  }
}
