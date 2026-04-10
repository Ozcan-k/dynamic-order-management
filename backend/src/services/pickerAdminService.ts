import { OrderStatus, UserRole } from '@dom/shared'
import { prisma } from '../lib/prisma'

export async function getInboundOrders(tenantId: string) {
  return prisma.order.findMany({
    where: { tenantId, status: OrderStatus.INBOUND },
    include: { scannedBy: { select: { username: true } } },
    orderBy: [{ priority: 'desc' }, { delayLevel: 'desc' }, { createdAt: 'asc' }],
  })
}

export async function getPickers(tenantId: string) {
  return prisma.user.findMany({
    where: { tenantId, role: UserRole.PICKER, isActive: true },
    select: { id: true, username: true },
  })
}

export async function assignPicker(
  orderId: string,
  pickerId: string,
  assignedById: string,
  tenantId: string,
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order || order.tenantId !== tenantId || order.status !== OrderStatus.INBOUND) {
    throw new Error('Order not found or not assignable')
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.PICKER_ASSIGNED },
      include: {
        pickerAssignments: {
          take: 1,
          orderBy: { assignedAt: 'desc' },
          include: { picker: { select: { username: true } } },
        },
      },
    })

    await tx.pickerAssignment.create({
      data: { orderId, pickerId, assignedById },
    })

    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: OrderStatus.INBOUND,
        toStatus: OrderStatus.PICKER_ASSIGNED,
        changedById: assignedById,
      },
    })

    return updated
  })
}

export async function bulkAssignPicker(
  orderIds: string[],
  pickerId: string,
  assignedById: string,
  tenantId: string,
): Promise<{ assigned: number; skipped: number }> {
  let assigned = 0
  let skipped = 0

  for (const orderId of orderIds) {
    try {
      await assignPicker(orderId, pickerId, assignedById, tenantId)
      assigned++
    } catch {
      skipped++
    }
  }

  return { assigned, skipped }
}

export async function lookupOrderByScan(trackingNumber: string, tenantId: string) {
  const order = await prisma.order.findFirst({
    where: { trackingNumber, tenantId },
    select: {
      id: true,
      trackingNumber: true,
      platform: true,
      status: true,
      delayLevel: true,
      priority: true,
      createdAt: true,
      scannedBy: { select: { username: true } },
    },
  })

  if (!order) throw new Error('Order not found')
  if (order.status !== OrderStatus.INBOUND) {
    throw new Error(`Order is not available (status: ${order.status.replace(/_/g, ' ')})`)
  }

  return order
}

export async function getPickerOrders(pickerId: string, tenantId: string) {
  const assignments = await prisma.pickerAssignment.findMany({
    where: {
      pickerId,
      completedAt: null,
      order: { tenantId },
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

export async function unassignOrder(
  orderId: string,
  pickerId: string,
  tenantId: string,
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order || order.tenantId !== tenantId) throw new Error('Order not found')
  if (
    order.status !== OrderStatus.PICKER_ASSIGNED &&
    order.status !== OrderStatus.PICKING
  ) {
    throw new Error('Order is not assigned')
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.INBOUND },
    })

    await tx.pickerAssignment.deleteMany({
      where: { orderId, pickerId, completedAt: null },
    })

    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: OrderStatus.INBOUND,
        changedById: pickerId,
      },
    })

    return updated
  })
}

export async function completeOrder(
  orderId: string,
  pickerId: string,
  tenantId: string,
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order || order.tenantId !== tenantId) throw new Error('Order not found')
  if (
    order.status !== OrderStatus.PICKER_ASSIGNED &&
    order.status !== OrderStatus.PICKING
  ) {
    throw new Error('Order is not in a completable state')
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.PICKER_COMPLETE },
    })

    await tx.pickerAssignment.updateMany({
      where: { orderId, pickerId, completedAt: null },
      data: { completedAt: new Date() },
    })

    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: OrderStatus.PICKER_COMPLETE,
        changedById: pickerId,
      },
    })

    return updated
  })
}

export async function getPickerStats(tenantId: string) {
  const pickers = await prisma.user.findMany({
    where: { tenantId, role: UserRole.PICKER },
    select: { id: true, username: true, pickerPin: true },
    orderBy: { username: 'asc' },
  })

  const [stats, returnedCount, totalCompleted] = await Promise.all([
    Promise.all(
      pickers.map(async (picker) => {
        const [activeAssignments, completedCount, returned] = await Promise.all([
          prisma.pickerAssignment.findMany({
            where: {
              pickerId: picker.id,
              completedAt: null,
              order: { tenantId },
            },
            select: { order: { select: { status: true } } },
          }),
          prisma.pickerAssignment.count({
            where: { pickerId: picker.id, completedAt: { not: null } },
          }),
          prisma.pickerAssignment.count({
            where: {
              pickerId: picker.id,
              completedAt: null,
              order: {
                status: OrderStatus.PICKER_ASSIGNED,
                statusHistory: {
                  some: {
                    fromStatus: OrderStatus.PICKER_COMPLETE,
                    toStatus: OrderStatus.PICKER_ASSIGNED,
                  },
                },
              },
            },
          }),
        ])

        const statusCounts = {
          PICKER_ASSIGNED: 0,
          PICKING: 0,
          PICKER_COMPLETE: 0,
        }

        for (const a of activeAssignments) {
          const s = a.order.status
          if (s === OrderStatus.PICKER_ASSIGNED) statusCounts.PICKER_ASSIGNED++
          else if (s === OrderStatus.PICKING) statusCounts.PICKING++
          else if (s === OrderStatus.PICKER_COMPLETE) statusCounts.PICKER_COMPLETE++
        }

        return {
          picker,
          statusCounts,
          total: activeAssignments.length,
          completed: completedCount,
          returned,
        }
      }),
    ),
    prisma.order.count({
      where: {
        tenantId,
        status: OrderStatus.PICKER_ASSIGNED,
        statusHistory: {
          some: {
            fromStatus: OrderStatus.PICKER_COMPLETE,
            toStatus: OrderStatus.PICKER_ASSIGNED,
          },
        },
      },
    }),
    prisma.pickerAssignment.count({
      where: { completedAt: { not: null }, order: { tenantId } },
    }),
  ])

  return { stats, returnedCount, totalCompleted }
}
