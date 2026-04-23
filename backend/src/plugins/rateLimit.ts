import fp from 'fastify-plugin'
import fastifyRateLimit from '@fastify/rate-limit'
import { FastifyInstance } from 'fastify'

export default fp(async (fastify: FastifyInstance) => {
  await fastify.register(fastifyRateLimit, {
    max: 500,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      error: 'Too many requests. Please slow down.',
    }),
  })
})
