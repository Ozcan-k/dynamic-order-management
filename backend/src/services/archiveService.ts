import { OrderStatus } from '@dom/shared'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { getManilaStartOfToday } from '../lib/manila'

const RETENTION_DAYS = 180

function retentionCutoff(): Date {
  const d = new Date()
  d.setDate(d.getDate() - RETENTION_DAYS)
  return d
}

export async function archiveOutboundOrders(tenantId: string): Promise<{ archived: number }> {
  const result = await prisma.order.updateMany({
    where: { tenantId, status: OrderStatus.OUTBOUND, archivedAt: null },
    data: { archivedAt: new Date() },
  })
  return { archived: result.count }
}

export async function archiveOutboundOrdersAllTenants(): Promise<{ tenantId: string; archived: number }[]> {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true },
  })

  const results: { tenantId: string; archived: number }[] = []
  for (const tenant of tenants) {
    try {
      const { archived } = await archiveOutboundOrders(tenant.id)
      results.push({ tenantId: tenant.id, archived })
    } catch (err) {
      console.error(`[archiveService] Failed to archive for tenant ${tenant.id}:`, err)
    }
  }
  return results
}

export interface ArchiveQueryParams {
  page?: number
  pageSize?: number
  search?: string
  platform?: string
  dateFrom?: string
  dateTo?: string
  expiresWithin?: number  // days
}

export async function getArchivedOrders(tenantId: string, params: ArchiveQueryParams) {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25))
  const skip = (page - 1) * pageSize

  const cutoffDate = params.expiresWithin != null
    ? (() => {
        const d = getManilaStartOfToday()
        d.setDate(d.getDate() - (RETENTION_DAYS - params.expiresWithin!))
        return d
      })()
    : undefined

  // dateFrom/dateTo are Manila-local YYYY-MM-DD strings from the UI filter.
  // Interpret them as Manila midnight by appending the UTC+8 offset.
  const archivedAtFilter: Prisma.DateTimeNullableFilter = {
    not: null,
    ...(params.dateFrom ? { gte: new Date(params.dateFrom + 'T00:00:00+08:00') } : {}),
    ...(params.dateTo ? { lte: new Date(params.dateTo + 'T23:59:59+08:00') } : {}),
    ...(cutoffDate ? { lte: cutoffDate } : {}),
  }

  const where: Prisma.OrderWhereInput = {
    tenantId,
    archivedAt: archivedAtFilter,
    ...(params.search ? { trackingNumber: { contains: params.search.trim().toUpperCase() } } : {}),
    ...(params.platform ? { platform: params.platform as Prisma.EnumPlatformFilter } : {}),
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      select: {
        id: true,
        trackingNumber: true,
        platform: true,
        carrierName: true,
        shopName: true,
        status: true,
        archivedAt: true,
        workDate: true,
        slaCompletedAt: true,
        pickerAssignments: {
          where: { completedAt: { not: null } },
          orderBy: { completedAt: 'desc' },
          take: 1,
          select: { picker: { select: { username: true } } },
        },
        packerAssignments: {
          where: { completedAt: { not: null } },
          orderBy: { completedAt: 'desc' },
          take: 1,
          select: { packer: { select: { username: true } } },
        },
      },
      orderBy: { archivedAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.order.count({ where }),
  ])

  const now = getManilaStartOfToday()
  const ordersWithExpiry = orders.map((o) => {
    const expiresAt = new Date(o.archivedAt!)
    expiresAt.setDate(expiresAt.getDate() + RETENTION_DAYS)
    const daysUntilExpiry = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 86_400_000))
    const { pickerAssignments, packerAssignments, ...rest } = o
    return {
      ...rest,
      pickedBy: pickerAssignments[0]?.picker.username ?? null,
      packedBy: packerAssignments[0]?.packer.username ?? null,
      expiresAt,
      daysUntilExpiry,
    }
  })

  return { orders: ordersWithExpiry, total, page, pageSize }
}

export async function getArchiveStats(tenantId: string) {
  const now = getManilaStartOfToday()

  const cutoff30 = new Date(now)
  cutoff30.setDate(cutoff30.getDate() - (RETENTION_DAYS - 30))

  const cutoff7 = new Date(now)
  cutoff7.setDate(cutoff7.getDate() - (RETENTION_DAYS - 7))

  const [total, expiring30, expiring7] = await Promise.all([
    prisma.order.count({ where: { tenantId, archivedAt: { not: null } } }),
    prisma.order.count({ where: { tenantId, archivedAt: { not: null, lte: cutoff30 } } }),
    prisma.order.count({ where: { tenantId, archivedAt: { not: null, lte: cutoff7 } } }),
  ])

  return { total, expiring30, expiring7 }
}

export async function bulkDeleteArchivedOrders(
  tenantId: string,
  orderIds: string[],
): Promise<{ deleted: number }> {
  if (orderIds.length === 0) return { deleted: 0 }

  // Validate all IDs belong to this tenant and are archived
  const valid = await prisma.order.findMany({
    where: { id: { in: orderIds }, tenantId, archivedAt: { not: null } },
    select: { id: true },
  })
  const validIds = valid.map((o) => o.id)
  if (validIds.length === 0) return { deleted: 0 }

  // Cascade delete child rows first
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: validIds } } })
  await prisma.slaEscalation.deleteMany({ where: { orderId: { in: validIds } } })
  await prisma.pickerAssignment.deleteMany({ where: { orderId: { in: validIds } } })
  await prisma.packerAssignment.deleteMany({ where: { orderId: { in: validIds } } })

  const result = await prisma.order.deleteMany({ where: { id: { in: validIds } } })
  return { deleted: result.count }
}

export async function hardDeleteExpiredOrders(tenantId: string): Promise<{ deleted: number }> {
  const cutoff = retentionCutoff()

  const expired = await prisma.order.findMany({
    where: { tenantId, archivedAt: { not: null, lte: cutoff } },
    select: { id: true },
  })
  const expiredIds = expired.map((o) => o.id)
  if (expiredIds.length === 0) return { deleted: 0 }

  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: expiredIds } } })
  await prisma.slaEscalation.deleteMany({ where: { orderId: { in: expiredIds } } })
  await prisma.pickerAssignment.deleteMany({ where: { orderId: { in: expiredIds } } })
  await prisma.packerAssignment.deleteMany({ where: { orderId: { in: expiredIds } } })

  const result = await prisma.order.deleteMany({ where: { id: { in: expiredIds } } })
  return { deleted: result.count }
}
