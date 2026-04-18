import { OrderStatus } from '@dom/shared'
import { prisma } from '../lib/prisma'
import { completeOrder } from './packerAdminService'

export async function findOrderForPacking(trackingNumber: string, tenantId: string) {
  return prisma.order.findFirst({
    where: {
      trackingNumber: { equals: trackingNumber, mode: 'insensitive' },
      tenantId,
      status: OrderStatus.PICKER_COMPLETE,
    },
    select: { id: true, trackingNumber: true, platform: true, delayLevel: true, status: true },
  })
}

export async function diagnoseTracking(trackingNumber: string, tenantId: string) {
  return prisma.order.findFirst({
    where: { trackingNumber: { equals: trackingNumber, mode: 'insensitive' }, tenantId },
    select: { status: true, archivedAt: true },
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
