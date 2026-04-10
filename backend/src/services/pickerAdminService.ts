import { OrderStatus, UserRole } from '@dom/shared'
import { prisma } from '../lib/prisma'

export async function getInboundOrders(tenantId: string) {
  return prisma.order.findMany({
    where: { tenantId, status: OrderStatus.INBOUND },
    include: { scannedBy: { select: { username: true } } },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
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

export async function getPickerStats(tenantId: string) {
  const pickers = await prisma.user.findMany({
    where: { tenantId, role: UserRole.PICKER },
    select: { id: true, username: true },
  })

  const stats = await Promise.all(
    pickers.map(async (picker) => {
      const [assignedCount, completedCount] = await Promise.all([
        prisma.pickerAssignment.count({
          where: { pickerId: picker.id, completedAt: null },
        }),
        prisma.pickerAssignment.count({
          where: { pickerId: picker.id, completedAt: { not: null } },
        }),
      ])

      return {
        picker,
        assigned: assignedCount,
        completed: completedCount,
      }
    }),
  )

  return stats
}
