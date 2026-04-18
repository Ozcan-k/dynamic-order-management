import 'dotenv/config'
import Fastify from 'fastify'
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
  if (process.env.NODE_ENV !== 'production') {
    await fastify.register(devTestRoutes)
  }

  fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  fastify.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({ error: `Route not found: ${request.method} ${request.url}` })
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

  // Clear existing repeatable jobs before re-registering to prevent duplication on restart
  for (const job of await slaEscalationQueue.getRepeatableJobs()) {
    await slaEscalationQueue.removeRepeatableByKey(job.key)
  }
  for (const job of await nightlyReportQueue.getRepeatableJobs()) {
    await nightlyReportQueue.removeRepeatableByKey(job.key)
  }
  for (const job of await archiveOutboundQueue.getRepeatableJobs()) {
    await archiveOutboundQueue.removeRepeatableByKey(job.key)
  }

  // Register SLA escalation as a repeatable BullMQ job (every 15 min)
  await slaEscalationQueue.add(
    'sweep',
    {},
    {
      repeat: { pattern: '*/15 * * * *' },
      jobId: 'sla-escalation-repeat',
    },
  )

  // Register archive job as a repeatable BullMQ job (23:30 Manila = 15:30 UTC)
  await archiveOutboundQueue.add(
    'archive',
    {},
    {
      repeat: { pattern: '30 15 * * *' },
      jobId: 'archive-outbound-repeat',
    },
  )

  // Register nightly report as a repeatable BullMQ job (23:40 Manila = 15:40 UTC)
  // Archive runs first (23:30) to close the day, then report counts final numbers
  await nightlyReportQueue.add(
    'send',
    {},
    {
      repeat: { pattern: '40 15 * * *' },
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
