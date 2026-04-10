import { OrderStatus, UserRole } from '@dom/shared'
import { prisma } from '../lib/prisma'

export async function getPickerCompleteOrders(tenantId: string) {
  return prisma.order.findMany({
    where: { tenantId, status: OrderStatus.PICKER_COMPLETE },
    include: {
      pickerAssignments: {
        where: { completedAt: { not: null } },
        take: 1,
        orderBy: { completedAt: 'desc' },
        select: { completedAt: true, picker: { select: { username: true } } },
      },
    },
    orderBy: [{ priority: 'desc' }, { delayLevel: 'desc' }, { createdAt: 'asc' }],
  })
}

export async function getPackers(tenantId: string) {
  return prisma.user.findMany({
    where: { tenantId, role: UserRole.PACKER, isActive: true },
    select: { id: true, username: true },
  })
}

export async function completeOrder(
  orderId: string,
  packerId: string,
  tenantId: string,
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order || order.tenantId !== tenantId) throw new Error('Order not found')
  if (order.status !== OrderStatus.PICKER_COMPLETE) {
    throw new Error('Order is not ready for packing')
  }

  const now = new Date()
  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.PACKER_COMPLETE },
    })

    await tx.packerAssignment.create({
      data: {
        orderId,
        packerId,
        assignedById: packerId,
        assignedAt: now,
        completedAt: now,
      },
    })

    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: OrderStatus.PICKER_COMPLETE,
        toStatus: OrderStatus.PACKER_COMPLETE,
        changedById: packerId,
      },
    })

    return updated
  })
}

export async function removeOrder(
  orderId: string,
  changedById: string,
  tenantId: string,
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      pickerAssignments: {
        where: { completedAt: { not: null } },
        orderBy: { completedAt: 'desc' },
        take: 1,
        select: { id: true, pickerId: true },
      },
    },
  })
  if (!order || order.tenantId !== tenantId) throw new Error('Order not found')
  if (order.status !== OrderStatus.PICKER_COMPLETE) {
    throw new Error('Order is not in the packer queue')
  }

  const previousAssignment = order.pickerAssignments[0]

  return prisma.$transaction(async (tx) => {
    const toStatus = previousAssignment ? OrderStatus.PICKER_ASSIGNED : OrderStatus.INBOUND
    const updated = await tx.order.update({
      where: { id: orderId },
      data: { status: toStatus },
    })

    if (previousAssignment) {
      // Reset completedAt to null — un-completes the picker's work so their
      // Total Completed count decreases and the order reappears on their device.
      // No new assignment is created; the existing one becomes active again.
      await tx.pickerAssignment.update({
        where: { id: previousAssignment.id },
        data: { completedAt: null },
      })
    }

    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: OrderStatus.PICKER_COMPLETE,
        toStatus,
        changedById,
      },
    })

    return updated
  })
}

export async function getPackerStats(tenantId: string) {
  const packers = await prisma.user.findMany({
    where: { tenantId, role: UserRole.PACKER },
    select: { id: true, username: true, packerPin: true },
    orderBy: { username: 'asc' },
  })

  const [stats, totalCompleted, returnedCount] = await Promise.all([
    Promise.all(
      packers.map(async (packer) => {
        const completedCount = await prisma.packerAssignment.count({
          where: { packerId: packer.id, completedAt: { not: null } },
        })
        return { packer, completed: completedCount }
      }),
    ),
    prisma.order.count({
      where: { tenantId, status: OrderStatus.PACKER_COMPLETE },
    }),
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
  ])

  return { stats, totalCompleted, returnedCount }
}

export async function getPackerOrders(packerId: string, tenantId: string) {
  const assignments = await prisma.packerAssignment.findMany({
    where: {
      packerId,
      completedAt: { not: null },
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
    orderBy: { completedAt: 'desc' },
    take: 50,
  })

  return assignments.map((a) => ({
    assignmentId: a.id,
    completedAt: a.completedAt,
    ...a.order,
  }))
}
