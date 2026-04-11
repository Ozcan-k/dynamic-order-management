import { OrderStatus } from '@dom/shared'
import { prisma } from '../lib/prisma'
import { detectPlatform } from '../lib/platformDetect'

export async function scanOrder(
  trackingNumber: string,
  scannedById: string,
  tenantId: string,
) {
  const tn = trackingNumber.trim()
  const platform = detectPlatform(tn)

  const existing = await prisma.order.findUnique({
    where: { tenantId_trackingNumber: { tenantId, trackingNumber: tn } },
  })
  if (existing) {
    return { duplicate: true, order: existing }
  }

  const order = await prisma.order.create({
    data: {
      tenantId,
      trackingNumber: tn,
      platform,
      status: OrderStatus.INBOUND,
      priority: 0,
      delayLevel: 0,
      scannedById,
      statusHistory: {
        create: {
          fromStatus: null,
          toStatus: OrderStatus.INBOUND,
          changedById: scannedById,
        },
      },
    },
    include: { scannedBy: { select: { username: true } } },
  })

  return { duplicate: false, order }
}

export async function listOrders(tenantId: string) {
  return prisma.order.findMany({
    where: { tenantId, status: OrderStatus.INBOUND },
    include: { scannedBy: { select: { username: true } } },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  })
}

export async function getOrderStats(tenantId: string) {
  const [totalScanned, pendingInbound, d0, d1, d2, d3, d4] = await Promise.all([
    prisma.order.count({ where: { tenantId } }),
    prisma.order.count({ where: { tenantId, status: OrderStatus.INBOUND } }),
    prisma.order.count({ where: { tenantId, delayLevel: 0 } }),
    prisma.order.count({ where: { tenantId, delayLevel: 1 } }),
    prisma.order.count({ where: { tenantId, delayLevel: 2 } }),
    prisma.order.count({ where: { tenantId, delayLevel: 3 } }),
    prisma.order.count({ where: { tenantId, delayLevel: 4 } }),
  ])
  return { totalScanned, pendingInbound, delayBreakdown: [d0, d1, d2, d3, d4] }
}

export async function deleteOrder(orderId: string, tenantId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order || order.tenantId !== tenantId) throw new Error('Order not found')

  await prisma.orderStatusHistory.deleteMany({ where: { orderId } })
  await prisma.slaEscalation.deleteMany({ where: { orderId } })
  await prisma.pickerAssignment.deleteMany({ where: { orderId } })
  await prisma.packerAssignment.deleteMany({ where: { orderId } })

  return prisma.order.delete({ where: { id: orderId } })
}
