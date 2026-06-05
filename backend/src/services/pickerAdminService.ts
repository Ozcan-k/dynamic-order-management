import { OrderStatus, UserRole } from '@dom/shared'
import { prisma } from '../lib/prisma'
import { getManilaStartOfToday } from '../lib/manila'

export async function getInboundOrders(tenantId: string) {
  return prisma.order.findMany({
    where: { tenantId, status: OrderStatus.INBOUND, archivedAt: null },
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
      scannedBy: { select: { username: true } },
    },
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
      scannedBy: { select: { username: true } },
      pickerAssignments: {
        where: { completedAt: null },
        take: 1,
        orderBy: { assignedAt: 'desc' },
        select: { picker: { select: { username: true } } },
      },
    },
  })

  if (!order) throw new Error('Order not found')
  if (order.status !== OrderStatus.INBOUND) {
    const pickerName = order.pickerAssignments[0]?.picker.username
    const statusText = order.status.replace(/_/g, ' ').toLowerCase()
    throw new Error(
      pickerName
        ? `Already assigned to ${pickerName}`
        : `Not available (${statusText})`
    )
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
          carrierName: true,
          shopName: true,
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

export async function bulkCompleteOrders(
  orderIds: string[],
  pickerId: string,
  tenantId: string,
): Promise<{ completed: number; skipped: number }> {
  let completed = 0
  let skipped = 0
  for (const orderId of orderIds) {
    try {
      await completeOrder(orderId, pickerId, tenantId)
      completed++
    } catch {
      skipped++
    }
  }
  return { completed, skipped }
}

export async function bulkUnassignOrders(
  orderIds: string[],
  pickerId: string,
  tenantId: string,
): Promise<{ unassigned: number; skipped: number }> {
  let unassigned = 0
  let skipped = 0
  for (const orderId of orderIds) {
    try {
      await unassignOrder(orderId, pickerId, tenantId)
      unassigned++
    } catch {
      skipped++
    }
  }
  return { unassigned, skipped }
}

export async function getPickerStats(tenantId: string) {
  const today = getManilaStartOfToday()

  const pickers = await prisma.user.findMany({
    where: { tenantId, role: UserRole.PICKER, isActive: true },
    select: { id: true, username: true },
    orderBy: { username: 'asc' },
  })
  const pickerIds = pickers.map((p) => p.id)

  const returnedFromStatuses = [
    OrderStatus.PICKER_COMPLETE,
    OrderStatus.PACKER_ASSIGNED,
    OrderStatus.PACKER_COMPLETE,
  ]

  const [
    activeAssignments,
    completedTotals,
    completedTodayTotals,
    returnedAssignments,
    returnedCount,
    totalCompleted,
  ] = await Promise.all([
    prisma.pickerAssignment.findMany({
      where: {
        pickerId: { in: pickerIds },
        completedAt: null,
        order: { tenantId, archivedAt: null },
      },
      select: { pickerId: true, order: { select: { status: true } } },
    }),
    prisma.pickerAssignment.groupBy({
      by: ['pickerId'],
      where: { pickerId: { in: pickerIds }, completedAt: { not: null } },
      _count: { _all: true },
    }),
    prisma.pickerAssignment.groupBy({
      by: ['pickerId'],
      where: { pickerId: { in: pickerIds }, completedAt: { gte: today } },
      _count: { _all: true },
    }),
    prisma.pickerAssignment.findMany({
      where: {
        pickerId: { in: pickerIds },
        completedAt: null,
        order: {
          tenantId,
          archivedAt: null,
          status: OrderStatus.PICKER_ASSIGNED,
          statusHistory: {
            some: {
              fromStatus: { in: returnedFromStatuses },
              toStatus: OrderStatus.PICKER_ASSIGNED,
            },
          },
        },
      },
      select: { pickerId: true },
    }),
    prisma.order.count({
      where: {
        tenantId,
        archivedAt: null,
        status: OrderStatus.PICKER_ASSIGNED,
        statusHistory: {
          some: {
            fromStatus: { in: returnedFromStatuses },
            toStatus: OrderStatus.PICKER_ASSIGNED,
          },
        },
      },
    }),
    prisma.pickerAssignment.count({
      where: { completedAt: { not: null }, order: { tenantId, archivedAt: null } },
    }),
  ])

  const completedMap = new Map<string, number>()
  for (const row of completedTotals) {
    completedMap.set(row.pickerId, row._count._all)
  }

  const completedTodayMap = new Map<string, number>()
  for (const row of completedTodayTotals) {
    completedTodayMap.set(row.pickerId, row._count._all)
  }

  const returnedMap = new Map<string, number>()
  for (const a of returnedAssignments) {
    returnedMap.set(a.pickerId, (returnedMap.get(a.pickerId) ?? 0) + 1)
  }

  type ActiveBucket = {
    PICKER_ASSIGNED: number
    PICKING: number
    PICKER_COMPLETE: number
    total: number
  }
  const activeMap = new Map<string, ActiveBucket>()
  for (const a of activeAssignments) {
    const bucket = activeMap.get(a.pickerId) ?? {
      PICKER_ASSIGNED: 0,
      PICKING: 0,
      PICKER_COMPLETE: 0,
      total: 0,
    }
    const s = a.order.status
    if (s === OrderStatus.PICKER_ASSIGNED) bucket.PICKER_ASSIGNED++
    else if (s === OrderStatus.PICKING) bucket.PICKING++
    else if (s === OrderStatus.PICKER_COMPLETE) bucket.PICKER_COMPLETE++
    bucket.total++
    activeMap.set(a.pickerId, bucket)
  }

  const stats = pickers.map((picker) => {
    const active = activeMap.get(picker.id) ?? {
      PICKER_ASSIGNED: 0,
      PICKING: 0,
      PICKER_COMPLETE: 0,
      total: 0,
    }
    return {
      picker,
      statusCounts: {
        PICKER_ASSIGNED: active.PICKER_ASSIGNED,
        PICKING: active.PICKING,
        PICKER_COMPLETE: active.PICKER_COMPLETE,
      },
      total: active.total,
      completed: completedMap.get(picker.id) ?? 0,
      completedToday: completedTodayMap.get(picker.id) ?? 0,
      returned: returnedMap.get(picker.id) ?? 0,
    }
  })

  // Header "In Progress" = orders currently assigned to a picker (PICKER_ASSIGNED + PICKING),
  // derived from the SAME per-picker workload so the card always equals the sum of the cards.
  const inProgressTotal = stats.reduce(
    (sum, s) => sum + s.statusCounts.PICKER_ASSIGNED + s.statusCounts.PICKING,
    0,
  )
  // Header "Total Completed" = pickers' completions THIS Manila day (resets at midnight).
  const completedTodayTotal = stats.reduce((sum, s) => sum + s.completedToday, 0)

  return { stats, returnedCount, totalCompleted, inProgressTotal, completedTodayTotal }
}
