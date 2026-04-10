import { Worker } from 'bullmq'
import { prisma } from '../lib/prisma'
import { getIO } from '../lib/socket'
import { slaD4EmailQueue, redisConnection } from '../lib/queues'
import { SLA_HOURS_PER_LEVEL, SLA_MAX_LEVEL, SLA_PRIORITY_BOOSTS } from '@dom/shared'

export function startSlaEscalationWorker() {
  const worker = new Worker(
    'slaEscalation',
    async () => {
      const tenants = await prisma.tenant.findMany({ where: { isActive: true }, select: { id: true } })

      for (const tenant of tenants) {
        await runEscalationForTenant(tenant.id)
      }
    },
    { connection: redisConnection },
  )

  worker.on('failed', (job, err) => {
    console.error(`[slaEscalation] job ${job?.id} failed:`, err.message)
  })

  return worker
}

async function runEscalationForTenant(tenantId: string) {
  // Find orders that need escalation: not completed, not yet at max level,
  // and older than (delayLevel + 1) * SLA_HOURS_PER_LEVEL hours
  const orders = await prisma.$queryRaw<
    Array<{ id: string; tracking_number: string; delay_level: number; priority: number }>
  >`
    SELECT id, tracking_number, delay_level, priority
    FROM orders
    WHERE tenant_id = ${tenantId}
      AND sla_completed_at IS NULL
      AND delay_level < ${SLA_MAX_LEVEL}
      AND NOW() - sla_started_at > (delay_level + 1) * ${SLA_HOURS_PER_LEVEL} * INTERVAL '1 hour'
  `

  for (const order of orders) {
    try {
      await escalateOrder(tenantId, order)
    } catch (err) {
      console.error(`[slaEscalation] failed to escalate order ${order.id}:`, err)
    }
  }
}

async function escalateOrder(
  tenantId: string,
  order: { id: string; tracking_number: string; delay_level: number; priority: number },
) {
  const fromLevel = order.delay_level
  const toLevel = Math.min(SLA_MAX_LEVEL, fromLevel + 1)

  const priorityDelta =
    (SLA_PRIORITY_BOOSTS[toLevel] ?? 0) - (SLA_PRIORITY_BOOSTS[fromLevel] ?? 0)

  const isD4 = toLevel === SLA_MAX_LEVEL

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        delayLevel: toLevel,
        priority: order.priority + priorityDelta,
        ...(isD4 ? { d4NotifiedAt: new Date() } : {}),
      },
    })

    await tx.slaEscalation.create({
      data: {
        orderId: order.id,
        tenantId,
        fromLevel,
        toLevel,
        triggerSource: 'auto_timeout',
      },
    })
  })

  // Emit socket event after transaction
  try {
    const io = getIO()
    io.to(`tenant:${tenantId}`).emit('sla:escalated', {
      orderId: order.id,
      fromLevel,
      toLevel,
      tenantId,
    })

    if (isD4) {
      io.to(`tenant:${tenantId}`).emit('sla:d4_alert', {
        orderId: order.id,
        trackingNumber: order.tracking_number,
        tenantId,
      })

      await slaD4EmailQueue.add('sendD4Email', {
        orderId: order.id,
        trackingNumber: order.tracking_number,
        tenantId,
      })
    }
  } catch {
    // Socket not initialized (e.g. during tests) — not fatal
  }
}
