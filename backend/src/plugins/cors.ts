import fp from 'fastify-plugin'
import fastifyCors from '@fastify/cors'
import { FastifyInstance } from 'fastify'

export default fp(async (fastify: FastifyInstance) => {
  const allowedOrigins =
    process.env.NODE_ENV === 'production'
      ? (process.env.CORS_ORIGIN || '').split(',').map((o) => o.trim())
      : ['http://localhost:5173', 'http://127.0.0.1:5173']

  await fastify.register(fastifyCors, {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
})
