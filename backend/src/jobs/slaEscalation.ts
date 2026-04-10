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
    Array<{ id: string; tracking_number: string; delay_level: number; priority: number; status: string; assigned_picker: string | null; assigned_packer: string | null }>
  >`
    SELECT
      o.id, o.tracking_number, o.delay_level, o.priority, o.status,
      (SELECT u.username FROM picker_assignments pa JOIN users u ON u.id = pa.picker_id
       WHERE pa.order_id = o.id AND pa.completed_at IS NULL LIMIT 1) AS assigned_picker,
      (SELECT u.username FROM packer_assignments pa JOIN users u ON u.id = pa.packer_id
       WHERE pa.order_id = o.id AND pa.completed_at IS NULL LIMIT 1) AS assigned_packer
    FROM orders o
    WHERE o.tenant_id = ${tenantId}
      AND o.sla_completed_at IS NULL
      AND o.delay_level < ${SLA_MAX_LEVEL}
      AND NOW() - o.sla_started_at > (o.delay_level + 1) * ${SLA_HOURS_PER_LEVEL} * INTERVAL '1 hour'
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
  order: { id: string; tracking_number: string; delay_level: number; priority: number; status: string; assigned_picker: string | null; assigned_packer: string | null },
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
        status: order.status,
        assignedPicker: order.assigned_picker,
        assignedPacker: order.assigned_packer,
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
