import { FastifyReply, FastifyRequest } from 'fastify'
import { UserRole, JWTPayload } from '@dom/shared'

/**
 * Middleware factory: restricts a route to users with one of the given roles.
 * Usage: preHandler: [fastify.authenticate, requireRole('ADMIN', 'PICKER_ADMIN')]
 */
export function requireRole(...roles: UserRole[]) {
  const check = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as JWTPayload
    if (!roles.includes(user.role as UserRole)) {
      return reply.code(403).send({ error: 'Forbidden: insufficient permissions' })
    }
  }
  // v2.92.0: the allowed roles ride along as metadata so the permission map
  // (services/permissionMap.ts) can list what is enforced — the check is unchanged.
  ALLOWED_ROLES.set(check, roles)
  return check
}

const ALLOWED_ROLES = new WeakMap<object, UserRole[]>()

/** Roles a `requireRole(...)` preHandler allows, or null for any other function. */
export function rolesOf(handler: unknown): UserRole[] | null {
  return typeof handler === 'function' ? ALLOWED_ROLES.get(handler) ?? null : null
}
