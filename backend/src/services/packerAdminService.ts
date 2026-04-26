import { OrderStatus, UserRole } from '@dom/shared'
import { prisma } from '../lib/prisma'
import { getManilaStartOfToday } from '../lib/manila'

export async function getPickerCompleteOrders(tenantId: string) {
  return prisma.order.findMany({
    where: {
      tenantId,
      status: { in: [OrderStatus.PICKER_COMPLETE, OrderStatus.PACKER_ASSIGNED] },
      archivedAt: null,
    },
    select: {
      id: true,
      trackingNumber: true,
      platform: true,
      carrierName: true,
      shopName: true,
      status: true,
      priority: true,
      delayLevel: true,
      workDate: true,
      createdAt: true,
      pickerAssignments: {
        where: { completedAt: { not: null } },
        take: 1,
        orderBy: { completedAt: 'desc' },
        select: { completedAt: true, picker: { select: { username: true } } },
      },
      packerAssignments: {
        where: { completedAt: null },
        take: 1,
        orderBy: { assignedAt: 'desc' },
        select: { packer: { select: { id: true, username: true } } },
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

export async function assignPacker(
  orderId: string,
  packerId: string,
  assignedById: string,
  tenantId: string,
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      packerAssignments: { where: { completedAt: null }, take: 1, select: { id: true } },
    },
  })
  if (!order || order.tenantId !== tenantId || order.status !== OrderStatus.PICKER_COMPLETE) {
    throw new Error('Order not found or not assignable')
  }
  if (order.packerAssignments.length > 0) {
    throw new Error('Order already assigned to a packer')
  }

  const packer = await prisma.user.findUnique({
    where: { id: packerId },
    select: { tenantId: true, role: true, isActive: true },
  })
  if (!packer || packer.tenantId !== tenantId || packer.role !== UserRole.PACKER || !packer.isActive) {
    throw new Error('Invalid packer')
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.PACKER_ASSIGNED },
    })

    await tx.packerAssignment.create({
      data: { orderId, packerId, assignedById },
    })

    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: OrderStatus.PICKER_COMPLETE,
        toStatus: OrderStatus.PACKER_ASSIGNED,
        changedById: assignedById,
      },
    })

    return updated
  })
}

export async function bulkAssignPacker(
  orderIds: string[],
  packerId: string,
  assignedById: string,
  tenantId: string,
): Promise<{ assigned: number; skipped: number }> {
  let assigned = 0
  let skipped = 0
  for (const orderId of orderIds) {
    try {
      await assignPacker(orderId, packerId, assignedById, tenantId)
      assigned++
    } catch {
      skipped++
    }
  }
  return { assigned, skipped }
}

export async function lookupOrderByScan(trackingNumber: string, tenantId: string) {
  const order = await prisma.order.findFirst({
    where: { trackingNumber, tenantId, archivedAt: null },
    select: {
      id: true,
      trackingNumber: true,
      platform: true,
      carrierName: true,
      shopName: true,
      status: true,
      delayLevel: true,
      priority: true,
      createdAt: true,
      pickerAssignments: {
        where: { completedAt: { not: null } },
        take: 1,
        orderBy: { completedAt: 'desc' },
        select: { picker: { select: { username: true } } },
      },
      packerAssignments: {
        where: { completedAt: null },
        take: 1,
        orderBy: { assignedAt: 'desc' },
        select: { packer: { select: { username: true } } },
      },
    },
  })

  if (!order) throw new Error('Order not found')
  if (order.status !== OrderStatus.PICKER_COMPLETE) {
    const packerName = order.packerAssignments[0]?.packer.username
    const statusText = order.status.replace(/_/g, ' ').toLowerCase()
    throw new Error(
      packerName
        ? `Already assigned to ${packerName}`
        : `Not available (${statusText})`
    )
  }

  return order
}

export async function unassignPacker(
  orderId: string,
  tenantId: string,
  changedById: string,
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      packerAssignments: { where: { completedAt: null }, take: 1, select: { id: true } },
    },
  })
  if (!order || order.tenantId !== tenantId) throw new Error('Order not found')
  if (order.status !== OrderStatus.PACKER_ASSIGNED) {
    throw new Error('Order is not assigned to a packer')
  }
  const active = order.packerAssignments[0]
  if (!active) throw new Error('No active packer assignment found')

  return prisma.$transaction(async (tx) => {
    await tx.packerAssignment.delete({ where: { id: active.id } })
    const updated = await tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.PICKER_COMPLETE },
    })
    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: OrderStatus.PACKER_ASSIGNED,
        toStatus: OrderStatus.PICKER_COMPLETE,
        changedById,
      },
    })
    return updated
  })
}

export async function completeOrder(
  orderId: string,
  packerId: string,
  assignedById: string,
  tenantId: string,
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      packerAssignments: {
        where: { completedAt: null, packerId },
        take: 1,
        select: { id: true },
      },
    },
  })
  if (!order || order.tenantId !== tenantId) throw new Error('Order not found')
  if (order.status !== OrderStatus.PICKER_COMPLETE && order.status !== OrderStatus.PACKER_ASSIGNED) {
    throw new Error('Order is not ready for packing')
  }

  const packer = await prisma.user.findUnique({
    where: { id: packerId },
    select: { tenantId: true, role: true, isActive: true },
  })
  if (!packer || packer.tenantId !== tenantId || packer.role !== UserRole.PACKER || !packer.isActive) {
    throw new Error('Invalid packer')
  }

  const existingAssignment = order.packerAssignments[0]
  const fromStatus = order.status
  const now = new Date()

  return prisma.$transaction(async (tx) => {
    if (existingAssignment) {
      // Pre-assigned flow: complete the existing PackerAssignment
      await tx.packerAssignment.update({
        where: { id: existingAssignment.id },
        data: { completedAt: now },
      })
    } else {
      // Legacy / manual-complete flow: create assignment with both timestamps
      await tx.packerAssignment.create({
        data: { orderId, packerId, assignedById, assignedAt: now, completedAt: now },
      })
    }

    await tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.PACKER_COMPLETE },
    })

    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus,
        toStatus: OrderStatus.PACKER_COMPLETE,
        changedById: assignedById,
      },
    })

    // PACKER_COMPLETE → OUTBOUND (auto-dispatch)
    const updated = await tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.OUTBOUND, slaCompletedAt: now },
    })

    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: OrderStatus.PACKER_COMPLETE,
        toStatus: OrderStatus.OUTBOUND,
        changedById: assignedById,
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
      packerAssignments: {
        orderBy: { assignedAt: 'desc' },
        take: 1,
        select: { id: true, completedAt: true },
      },
    },
  })
  if (!order || order.tenantId !== tenantId) throw new Error('Order not found')
  if (
    order.status !== OrderStatus.PICKER_COMPLETE &&
    order.status !== OrderStatus.PACKER_ASSIGNED &&
    order.status !== OrderStatus.PACKER_COMPLETE
  ) {
    throw new Error('Order is not in the packer queue')
  }

  const previousPickerAssignment = order.pickerAssignments[0]
  const packerAssignment = order.packerAssignments[0]
  const fromStatus = order.status

  return prisma.$transaction(async (tx) => {
    // Drop the packer side of the work first.
    // - Active (PACKER_ASSIGNED): assignment exists with completedAt: null → delete it
    //   so the packer's "active" list clears and stats stay accurate.
    // - Already packed (PACKER_COMPLETE, rare since complete auto-dispatches to OUTBOUND):
    //   delete the completed assignment too so the packer's "Total Packed" count
    //   reflects that this work was undone.
    if (packerAssignment) {
      await tx.packerAssignment.delete({ where: { id: packerAssignment.id } })
    }

    const toStatus = previousPickerAssignment ? OrderStatus.PICKER_ASSIGNED : OrderStatus.INBOUND
    const updated = await tx.order.update({
      where: { id: orderId },
      data: { status: toStatus },
    })

    if (previousPickerAssignment) {
      // Reset completedAt to null — un-completes the picker's work so their
      // Total Completed count decreases and the order reappears on their device.
      // No new assignment is created; the existing one becomes active again.
      await tx.pickerAssignment.update({
        where: { id: previousPickerAssignment.id },
        data: { completedAt: null },
      })
    }

    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus,
        toStatus,
        changedById,
      },
    })

    return updated
  })
}

export async function getPackerStats(tenantId: string) {
  const packers = await prisma.user.findMany({
    where: { tenantId, role: UserRole.PACKER, isActive: true },
    select: { id: true, username: true },
    orderBy: { username: 'asc' },
  })

  const [stats, totalCompleted, returnedCount] = await Promise.all([
    Promise.all(
      packers.map(async (packer) => {
        const today = getManilaStartOfToday()
        const [completedCount, completedToday] = await Promise.all([
          prisma.packerAssignment.count({
            where: { packerId: packer.id, completedAt: { not: null } },
          }),
          prisma.packerAssignment.count({
            where: { packerId: packer.id, completedAt: { gte: today } },
          }),
        ])
        return { packer, completed: completedCount, completedToday }
      }),
    ),
    // Count all packer assignments ever completed (including already dispatched orders)
    // Previously this counted order.count({ status: PACKER_COMPLETE }) which was wrong:
    // it was identical to the "Waiting to Pack" queue and dropped to 0 after dispatch.
    prisma.packerAssignment.count({
      where: { completedAt: { not: null }, order: { tenantId, archivedAt: null } },
    }),
    prisma.order.count({
      where: {
        tenantId,
        archivedAt: null,
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
          carrierName: true,
          shopName: true,
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
