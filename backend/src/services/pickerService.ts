import { OrderStatus } from '@dom/shared'
import { prisma } from '../lib/prisma'
import { completeOrder } from './pickerAdminService'

export async function getMyOrders(pickerId: string, tenantId: string) {
  const assignments = await prisma.pickerAssignment.findMany({
    where: {
      pickerId,
      completedAt: null,
      order: {
        tenantId,
        status: { in: [OrderStatus.PICKER_ASSIGNED, OrderStatus.PICKING] },
      },
    },
    include: {
      order: {
        select: {
          id: true,
          trackingNumber: true,
          platform: true,
          status: true,
          delayLevel: true,
          priority: true,
          createdAt: true,
        },
      },
    },
    orderBy: [{ order: { priority: 'desc' } }, { assignedAt: 'asc' }],
  })

  return assignments.map((a) => ({
    assignmentId: a.id,
    assignedAt: a.assignedAt,
    ...a.order,
  }))
}

export async function completeByTracking(
  trackingNumber: string,
  pickerId: string,
  tenantId: string,
) {
  // Active, non-archived order only. Partial unique index allows an archived row
  // with the same trackingNumber in the same tenant — without this filter,
  // findFirst can pick the old archived row and reject the scan as unassigned.
  const order = await prisma.order.findFirst({
    where: {
      trackingNumber: { equals: trackingNumber, mode: 'insensitive' },
      tenantId,
      archivedAt: null,
      status: { in: [OrderStatus.PICKER_ASSIGNED, OrderStatus.PICKING] },
    },
  })
  if (!order) throw new Error('Order not found')

  const assignment = await prisma.pickerAssignment.findFirst({
    where: { orderId: order.id, pickerId, completedAt: null },
  })
  if (!assignment) throw new Error('Order not assigned to you')

  return completeOrder(order.id, pickerId, tenantId)
}
