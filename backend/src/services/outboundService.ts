import { OrderStatus } from '@dom/shared'
import { prisma } from '../lib/prisma'
import { getManilaStartOfToday, getManilaStartOf } from '../lib/manila'

export async function getOutboundStats(tenantId: string, date?: string) {
  if (date) {
    // Historical mode: only dispatched count for that specific date
    const startOfDay = getManilaStartOf(date)
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000)
    const dispatched = await prisma.order.count({
      where: {
        tenantId,
        status: OrderStatus.OUTBOUND,
        slaCompletedAt: { gte: startOfDay, lt: endOfDay },
      },
    })
    return { dispatchedToday: dispatched, historical: true }
  }

  const today = getManilaStartOfToday()

  const [
    dispatchedToday,
    inboundTotal,
    outboundTotal,
    d4Count,
    inboundQueueCount,
    pickerActiveCount,
    pickerCompleteCount,
  ] = await Promise.all([
    // dispatchedToday includes archived — orders dispatched today must remain in count even after archiving
    prisma.order.count({
      where: { tenantId, status: OrderStatus.OUTBOUND, slaCompletedAt: { gte: today } },
    }),
    prisma.order.count({ where: { tenantId, archivedAt: null } }),
    prisma.order.count({ where: { tenantId, status: OrderStatus.OUTBOUND, archivedAt: null } }),
    prisma.order.count({
      where: { tenantId, delayLevel: 4, status: { not: OrderStatus.OUTBOUND }, archivedAt: null },
    }),
    // Per-phase breakdown — all exclude archived
    prisma.order.count({ where: { tenantId, status: OrderStatus.INBOUND, archivedAt: null } }),
    prisma.order.count({ where: { tenantId, status: { in: [OrderStatus.PICKER_ASSIGNED, OrderStatus.PICKING] }, archivedAt: null } }),
    prisma.order.count({ where: { tenantId, status: OrderStatus.PICKER_COMPLETE, archivedAt: null } }),
  ])

  return {
    dispatchedToday,
    inboundTotal,
    outboundTotal,
    missingCount: inboundTotal - outboundTotal,
    d4Count,
    historical: false,
    // Pipeline breakdown
    pipeline: {
      inboundQueue: inboundQueueCount,
      pickerActive: pickerActiveCount,
      pickerComplete: pickerCompleteCount,
      dispatched: outboundTotal,
    },
  }
}

export async function getGroupedByCarrier(tenantId: string, date?: string) {
  const startOfDay = date ? getManilaStartOf(date) : getManilaStartOfToday()
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000)

  const orders = await prisma.order.findMany({
    where: {
      tenantId,
      status: OrderStatus.OUTBOUND,
      slaCompletedAt: { gte: startOfDay, lt: endOfDay },
    },
    select: { carrierName: true, shopName: true },
  })

  const map = new Map<string, Map<string, number>>()
  for (const o of orders) {
    const carrier = o.carrierName ?? 'OTHER'
    const shop = o.shopName ?? 'Unknown'
    if (!map.has(carrier)) map.set(carrier, new Map())
    const shopMap = map.get(carrier)!
    shopMap.set(shop, (shopMap.get(shop) ?? 0) + 1)
  }

  return Array.from(map.entries())
    .map(([carrierName, shopMap]) => ({
      carrierName,
      totalOrders: Array.from(shopMap.values()).reduce((a, b) => a + b, 0),
      shops: Array.from(shopMap.entries())
        .map(([shopName, count]) => ({ shopName, count }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.totalOrders - a.totalOrders)
}

export async function getStuckOrders(tenantId: string) {
  return prisma.order.findMany({
    where: { tenantId, status: { not: OrderStatus.OUTBOUND }, archivedAt: null },
    select: {
      id: true,
      trackingNumber: true,
      platform: true,
      status: true,
      delayLevel: true,
      slaStartedAt: true,
      updatedAt: true,
    },
    orderBy: [{ delayLevel: 'desc' }, { slaStartedAt: 'asc' }],
  })
}
