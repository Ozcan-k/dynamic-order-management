import 'dotenv/config'
import Fastify from 'fastify'
import corsPlugin from './plugins/cors'
import rateLimitPlugin from './plugins/rateLimit'
import authPlugin from './plugins/auth'
import { redis } from './lib/redis'
import { prisma } from './lib/prisma'
import authRoutes from './routes/auth'
import userRoutes from './routes/users'
import orderRoutes from './routes/orders'
import pickerAdminRoutes from './routes/pickerAdmin'
import pickerRoutes from './routes/picker'
import packerAdminRoutes from './routes/packerAdmin'
import packerRoutes from './routes/packer'

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
})

async function start() {
  await fastify.register(corsPlugin)
  await fastify.register(rateLimitPlugin)
  await fastify.register(authPlugin)

  await fastify.register(authRoutes, { prefix: '/auth' })
  await fastify.register(userRoutes, { prefix: '/users' })
  await fastify.register(orderRoutes, { prefix: '/orders' })
  await fastify.register(pickerAdminRoutes, { prefix: '/picker-admin' })
  await fastify.register(pickerRoutes, { prefix: '/picker' })
  await fastify.register(packerAdminRoutes, { prefix: '/packer-admin' })
  await fastify.register(packerRoutes, { prefix: '/packer' })

  fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect()
    redis.disconnect()
  })

  const port = Number(process.env.PORT) || 3000
  await fastify.listen({ port, host: '0.0.0.0' })
}

start().catch((err) => {
  fastify.log.error(err)
  process.exit(1)
})
