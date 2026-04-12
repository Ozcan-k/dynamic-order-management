import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireRole } from '../middleware/rbac'
import { listUsers, createUser, updateUser, deleteUser, CreateUserSchema, UpdateUserSchema } from '../services/userService'
import { JWTPayload, UserRole } from '@dom/shared'

export default async function userRoutes(fastify: FastifyInstance) {
  const adminOnly = [fastify.authenticate, requireRole(UserRole.ADMIN)]

  // GET /users
  fastify.get('/', { preHandler: adminOnly }, async (request, reply) => {
    const { tenantId } = request.user as JWTPayload
    const users = await listUsers(tenantId)
    return reply.send({ users })
  })

  // POST /users
  fastify.post('/', { preHandler: adminOnly }, async (request, reply) => {
    const result = CreateUserSchema.safeParse(request.body)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: result.error.flatten() })
    }

    const { userId, tenantId } = request.user as JWTPayload

    try {
      const user = await createUser(tenantId, userId, result.data)
      return reply.code(201).send({ user })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create user'
      return reply.code(409).send({ error: message })
    }
  })

  // DELETE /users/:id — soft delete (sets isActive = false)
  fastify.delete('/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId, userId } = request.user as JWTPayload
    try {
      const user = await deleteUser(tenantId, id, userId)
      return reply.send({ user })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete user'
      return reply.code(message === 'User not found' ? 404 : 400).send({ error: message })
    }
  })

  // PATCH /users/:id
  fastify.patch('/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = UpdateUserSchema.safeParse(request.body)
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: result.error.flatten() })
    }

    const { tenantId } = request.user as JWTPayload

    try {
      const user = await updateUser(tenantId, id, result.data)
      return reply.send({ user })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update user'
      const status = message === 'User not found' ? 404 : 400
      return reply.code(status).send({ error: message })
    }
  })
}
