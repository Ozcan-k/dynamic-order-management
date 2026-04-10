import { OrderStatus } from '@dom/shared'
import { prisma } from '../lib/prisma'
import { completeOrder } from './packerAdminService'

export async function getAllPickerCompleteOrders(tenantId: string) {
  return prisma.order.findMany({
    where: { tenantId, status: OrderStatus.PICKER_COMPLETE },
    select: {
      id: true,
      trackingNumber: true,
      platform: true,
      status: true,
      delayLevel: true,
      priority: true,
      createdAt: true,
    },
    orderBy: [{ priority: 'desc' }, { delayLevel: 'desc' }, { createdAt: 'asc' }],
  })
}

export async function completeByTracking(
  trackingNumber: string,
  packerId: string,
  tenantId: string,
) {
  const order = await prisma.order.findFirst({
    where: {
      trackingNumber: { equals: trackingNumber, mode: 'insensitive' },
      tenantId,
    },
  })

  if (!order) throw new Error('Order not found')
  if (order.status !== OrderStatus.PICKER_COMPLETE) {
    throw new Error('Order is not ready for packing')
  }

  return completeOrder(order.id, packerId, tenantId)
}
