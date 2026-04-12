import { OrderStatus } from '@dom/shared'
import { prisma } from '../lib/prisma'
import { detectPlatform } from '../lib/platformDetect'

export async function scanOrder(
  trackingNumber: string,
  scannedById: string,
  tenantId: string,
  options?: { carrierName?: string; shopName?: string },
) {
  const tn = trackingNumber.trim()
  const platform = detectPlatform(tn)

  const existing = await prisma.order.findFirst({
    where: { tenantId, trackingNumber: tn, archivedAt: null },
  })
  if (existing) {
    return { duplicate: true, order: existing }
  }

  const workDate = new Date()
  workDate.setHours(0, 0, 0, 0)

  const order = await prisma.order.create({
    data: {
      tenantId,
      trackingNumber: tn,
      platform,
      carrierName: options?.carrierName ?? null,
      shopName: options?.shopName ?? null,
      status: OrderStatus.INBOUND,
      priority: 0,
      delayLevel: 0,
      workDate,
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

export async function bulkScanOrders(
  trackingNumbers: string[],
  scannedById: string,
  tenantId: string,
  carrierName: string,
  shopName?: string,
): Promise<{ created: number; duplicates: string[] }> {
  let created = 0
  const duplicates: string[] = []

  for (const tn of trackingNumbers) {
    try {
      const { duplicate } = await scanOrder(tn, scannedById, tenantId, {
        carrierName,
        shopName: shopName?.trim() || undefined,
      })
      if (duplicate) {
        duplicates.push(tn.trim().toUpperCase())
      } else {
        created++
      }
    } catch {
      duplicates.push(tn.trim().toUpperCase())
    }
  }

  return { created, duplicates }
}

export async function getDistinctShopNames(tenantId: string): Promise<string[]> {
  const rows = await prisma.order.findMany({
    where: { tenantId, shopName: { not: null } },
    select: { shopName: true },
    distinct: ['shopName'],
    orderBy: { shopName: 'asc' },
  })
  return rows.map(r => r.shopName as string)
}

export async function listOrders(tenantId: string) {
  return prisma.order.findMany({
    where: { tenantId, status: OrderStatus.INBOUND, archivedAt: null },
    include: { scannedBy: { select: { username: true } } },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  })
}

export async function getOrderStats(tenantId: string) {
  const [totalScanned, pendingInbound, inProgressCount, pickerDoneCount, d0, d1, d2, d3, d4] = await Promise.all([
    prisma.order.count({ where: { tenantId, archivedAt: null } }),
    prisma.order.count({ where: { tenantId, status: OrderStatus.INBOUND, archivedAt: null } }),
    prisma.order.count({ where: { tenantId, status: { in: [OrderStatus.PICKER_ASSIGNED, OrderStatus.PICKING] }, archivedAt: null } }),
    prisma.order.count({ where: { tenantId, status: { in: [OrderStatus.PICKER_COMPLETE, OrderStatus.PACKER_COMPLETE, OrderStatus.OUTBOUND] }, archivedAt: null } }),
    prisma.order.count({ where: { tenantId, delayLevel: 0, archivedAt: null } }),
    prisma.order.count({ where: { tenantId, delayLevel: 1, archivedAt: null } }),
    prisma.order.count({ where: { tenantId, delayLevel: 2, archivedAt: null } }),
    prisma.order.count({ where: { tenantId, delayLevel: 3, archivedAt: null } }),
    prisma.order.count({ where: { tenantId, delayLevel: 4, archivedAt: null } }),
  ])
  return { totalScanned, pendingInbound, inProgressCount, pickerDoneCount, delayBreakdown: [d0, d1, d2, d3, d4] }
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
