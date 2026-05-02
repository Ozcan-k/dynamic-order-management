import 'dotenv/config'
import Fastify from 'fastify'
import { Prisma } from '@prisma/client'
import helmetPlugin from './plugins/helmet'
import corsPlugin from './plugins/cors'
import rateLimitPlugin from './plugins/rateLimit'
import authPlugin from './plugins/auth'
import { redis } from './lib/redis'
import { prisma } from './lib/prisma'
import { initSocket } from './lib/socket'
import { slaEscalationQueue, nightlyReportQueue, archiveOutboundQueue } from './lib/queues'
import { startSlaEscalationWorker } from './jobs/slaEscalation'
import { startNightlyReportWorker } from './jobs/nightlyReport'
import { startArchiveOutboundWorker } from './jobs/archiveOutbound'
import authRoutes from './routes/auth'
import userRoutes from './routes/users'
import orderRoutes from './routes/orders'
import pickerAdminRoutes from './routes/pickerAdmin'
import pickerRoutes from './routes/picker'
import packerAdminRoutes from './routes/packerAdmin'
import packerRoutes from './routes/packer'
import outboundRoutes from './routes/outbound'
import reportsRoutes from './routes/reports'
import archiveRoutes from './routes/archive'
import salesRoutes from './routes/sales'
import marketingRoutes from './routes/marketing'
import stockRoutes from './routes/stock'
import devTestRoutes from './routes/devTest'

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
  await fastify.register(helmetPlugin)
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
  await fastify.register(outboundRoutes, { prefix: '/outbound' })
  await fastify.register(reportsRoutes, { prefix: '/reports' })
  await fastify.register(archiveRoutes, { prefix: '/archive' })
  await fastify.register(salesRoutes, { prefix: '/sales' })
  await fastify.register(marketingRoutes, { prefix: '/marketing' })
  await fastify.register(stockRoutes, { prefix: '/stock' })
  if (process.env.NODE_ENV !== 'production') {
    await fastify.register(devTestRoutes)
  }

  fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  fastify.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({ error: `Route not found: ${request.method} ${request.url}` })
  })

  // Global error handler — logs full detail server-side, returns a structured body so
  // the frontend can distinguish DB/connection issues from generic failures.
  fastify.setErrorHandler((err, request, reply) => {
    // Let @fastify/rate-limit and validation errors keep their intended status
    const status = err.statusCode ?? 500
    if (status < 500) {
      return reply.code(status).send({ error: err.message })
    }

    const reqId = request.id
    const context = { reqId, route: `${request.method} ${request.url}`, err }

    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      request.log.error(context, `prisma_known_error code=${err.code}`)
      return reply.code(500).send({ error: 'Database error', code: err.code, reqId })
    }
    if (err instanceof Prisma.PrismaClientInitializationError) {
      request.log.error(context, 'prisma_init_error')
      return reply.code(503).send({ error: 'Database unavailable', reqId })
    }
    if (err.message?.includes('Timed out fetching a new connection')) {
      request.log.error(context, 'prisma_pool_timeout')
      return reply.code(503).send({ error: 'Database pool exhausted', reqId })
    }

    request.log.error(context, 'unhandled_error')
    return reply.code(500).send({ error: 'Internal server error', reqId })
  })

  // BullMQ workers — declared here so onClose hook can reference them
  let escalationWorker: ReturnType<typeof startSlaEscalationWorker> | null = null
  let nightlyReportWorker: ReturnType<typeof startNightlyReportWorker> | null = null
  let archiveOutboundWorker: ReturnType<typeof startArchiveOutboundWorker> | null = null

  // Register onClose BEFORE fastify.ready() — Fastify rejects hooks after ready
  fastify.addHook('onClose', async () => {
    if (escalationWorker) await escalationWorker.close()
    if (nightlyReportWorker) await nightlyReportWorker.close()
    if (archiveOutboundWorker) await archiveOutboundWorker.close()
    await prisma.$disconnect()
    redis.disconnect()
  })

  // Attach Socket.io to the underlying HTTP server (requires fastify.ready first)
  await fastify.ready()
  initSocket(fastify.server)

  // Clear ALL existing repeatable jobs before re-registering to prevent duplication.
  // Uses direct Redis SCAN+DEL as a safety net for stale keys that BullMQ's
  // getRepeatableJobs() may not list (e.g. jobs registered by older BullMQ versions).
  const clearQueue = async (queueName: string) => {
    // Standard BullMQ API
    const queue = { slaEscalation: slaEscalationQueue, nightlyReport: nightlyReportQueue, archiveOutbound: archiveOutboundQueue }[queueName]!
    for (const job of await queue.getRepeatableJobs()) {
      await queue.removeRepeatableByKey(job.key)
    }
    // Redis-level sweep for any leftover keys matching this queue's repeat pattern
    const pattern = `bull:${queueName}:repeat:*`
    let cursor = '0'
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', '100')
      cursor = next
      if (keys.length > 0) await redis.del(...keys)
    } while (cursor !== '0')
  }

  await clearQueue('slaEscalation')
  await clearQueue('nightlyReport')
  await clearQueue('archiveOutbound')

  // Register SLA escalation as a repeatable BullMQ job (every 15 min)
  await slaEscalationQueue.add(
    'sweep',
    {},
    {
      repeat: { pattern: '*/15 * * * *' },
      jobId: 'sla-escalation-repeat',
    },
  )

  // Register archive job: 23:30 Manila time (explicit tz — no UTC conversion needed)
  await archiveOutboundQueue.add(
    'archive',
    {},
    {
      repeat: { pattern: '30 23 * * *', tz: 'Asia/Manila' },
      jobId: 'archive-outbound-repeat',
    },
  )

  // Register nightly report: 23:40 Manila time — archive runs first to close the day
  await nightlyReportQueue.add(
    'send',
    {},
    {
      repeat: { pattern: '40 23 * * *', tz: 'Asia/Manila' },
      jobId: 'nightly-report-repeat',
    },
  )

  // Start BullMQ workers
  escalationWorker = startSlaEscalationWorker()
  nightlyReportWorker = startNightlyReportWorker()
  archiveOutboundWorker = startArchiveOutboundWorker()

  const port = Number(process.env.PORT) || 3000
  await fastify.listen({ port, host: '0.0.0.0' })
}

start().catch((err) => {
  fastify.log.error(err)
  process.exit(1)
})
