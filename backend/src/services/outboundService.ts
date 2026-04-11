import { OrderStatus } from '@dom/shared'
import { prisma } from '../lib/prisma'

export async function getReadyToDispatch(tenantId: string) {
  return prisma.order.findMany({
    where: { tenantId, status: OrderStatus.PACKER_COMPLETE },
    include: {
      packerAssignments: {
        where: { completedAt: { not: null } },
        take: 1,
        orderBy: { completedAt: 'desc' },
        select: { completedAt: true, packer: { select: { username: true } } },
      },
    },
    orderBy: [{ delayLevel: 'desc' }, { createdAt: 'asc' }],
  })
}

export async function dispatchOrder(orderId: string, userId: string, tenantId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order || order.tenantId !== tenantId) throw new Error('Order not found')
  if (order.status !== OrderStatus.PACKER_COMPLETE) throw new Error('Order is not ready for dispatch')

  const now = new Date()
  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.OUTBOUND, slaCompletedAt: now },
    })
    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: OrderStatus.PACKER_COMPLETE,
        toStatus: OrderStatus.OUTBOUND,
        changedById: userId,
      },
    })
    return updated
  })
}

export async function bulkDispatch(
  orderIds: string[],
  userId: string,
  tenantId: string,
): Promise<{ dispatched: number; skipped: number }> {
  let dispatched = 0
  let skipped = 0
  for (const orderId of orderIds) {
    try {
      await dispatchOrder(orderId, userId, tenantId)
      dispatched++
    } catch {
      skipped++
    }
  }
  return { dispatched, skipped }
}

export async function getOutboundStats(tenantId: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [
    waitingCount,
    dispatchedToday,
    inboundTotal,
    outboundTotal,
    d4Count,
    inboundQueueCount,
    pickerActiveCount,
    pickerCompleteCount,
    packerCompleteCount,
  ] = await Promise.all([
    prisma.order.count({ where: { tenantId, status: OrderStatus.PACKER_COMPLETE } }),
    prisma.order.count({
      where: { tenantId, status: OrderStatus.OUTBOUND, slaCompletedAt: { gte: today } },
    }),
    prisma.order.count({ where: { tenantId } }),
    prisma.order.count({ where: { tenantId, status: OrderStatus.OUTBOUND } }),
    prisma.order.count({
      where: { tenantId, delayLevel: 4, status: { not: OrderStatus.OUTBOUND } },
    }),
    // Per-phase breakdown so UI can verify: inboundQueueCount + pickerActiveCount + pickerCompleteCount + packerCompleteCount + outboundTotal === inboundTotal
    prisma.order.count({ where: { tenantId, status: OrderStatus.INBOUND } }),
    prisma.order.count({ where: { tenantId, status: { in: [OrderStatus.PICKER_ASSIGNED, OrderStatus.PICKING] } } }),
    prisma.order.count({ where: { tenantId, status: OrderStatus.PICKER_COMPLETE } }),
    prisma.order.count({ where: { tenantId, status: OrderStatus.PACKER_COMPLETE } }),
  ])

  return {
    waitingCount,
    dispatchedToday,
    inboundTotal,
    outboundTotal,
    missingCount: inboundTotal - outboundTotal,
    d4Count,
    // Pipeline breakdown — these 5 values always sum to inboundTotal
    pipeline: {
      inboundQueue: inboundQueueCount,
      pickerActive: pickerActiveCount,
      pickerComplete: pickerCompleteCount,
      packerComplete: packerCompleteCount,
      dispatched: outboundTotal,
    },
  }
}

export async function getStuckOrders(tenantId: string) {
  return prisma.order.findMany({
    where: { tenantId, status: { not: OrderStatus.OUTBOUND } },
    select: {
      id: true,
      trackingNumber: true,
      platform: true,
      status: true,
      delayLevel: true,
      slaStartedAt: true,
      updatedAt: true,
    },
    orderBy: [{ delayLevel: 'desc' }, { slaStartedAt: 'asc' }],
  })
}
