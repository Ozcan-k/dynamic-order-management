import { OrderStatus } from '@dom/shared'
import { prisma } from '../lib/prisma'
import { completeOrder } from './packerAdminService'

export async function findOrderForPacking(trackingNumber: string, tenantId: string) {
  const order = await prisma.order.findFirst({
    where: {
      trackingNumber: { equals: trackingNumber, mode: 'insensitive' },
      tenantId,
      status: OrderStatus.PICKER_COMPLETE,
    },
    select: { id: true, trackingNumber: true, platform: true, delayLevel: true, status: true },
  })

  if (!order) {
    const anyStatus = await prisma.order.findFirst({
      where: { trackingNumber: { equals: trackingNumber, mode: 'insensitive' }, tenantId },
      select: { status: true, archivedAt: true },
    })
    if (anyStatus) {
      const suffix = anyStatus.archivedAt ? ' (archived)' : ''
      throw new Error(`Order status is ${anyStatus.status}${suffix}, not PICKER_COMPLETE`)
    }
    throw new Error('Order not found in this warehouse')
  }

  return order
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
