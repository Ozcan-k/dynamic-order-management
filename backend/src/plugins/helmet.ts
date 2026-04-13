import fp from 'fastify-plugin'
import helmet from '@fastify/helmet'
import { FastifyInstance } from 'fastify'

export default fp(async (fastify: FastifyInstance) => {
  await fastify.register(helmet, {
    // CSP disabled: React SPA uses inline scripts (Vite dev) and dynamic styles
    contentSecurityPolicy: false,
  })
})
