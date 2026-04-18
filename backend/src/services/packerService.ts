import { OrderStatus } from '@dom/shared'
import { prisma } from '../lib/prisma'
import { completeOrder } from './packerAdminService'

const ORDER_SELECT = { id: true, trackingNumber: true, platform: true, delayLevel: true, status: true } as const

type OrderRow = { id: string; trackingNumber: string; platform: string; delayLevel: number; status: string }

export async function findOrderForPacking(trackingNumber: string, tenantId: string) {
  // 1. Exact case-insensitive match
  const exact = await prisma.order.findFirst({
    where: {
      trackingNumber: { equals: trackingNumber, mode: 'insensitive' },
      tenantId,
      status: OrderStatus.PICKER_COMPLETE,
    },
    select: ORDER_SELECT,
  })
  if (exact) return exact

  // 2. Fallback: the scanned value might be a URL that contains the tracking number.
  //    Find a PICKER_COMPLETE order whose stored trackingNumber is a substring of what was scanned.
  if (trackingNumber.length >= 8) {
    const rows = await prisma.$queryRaw<OrderRow[]>`
      SELECT id, tracking_number AS "trackingNumber", platform, delay_level AS "delayLevel", status::text
      FROM orders
      WHERE tenant_id = ${tenantId}
        AND status = 'PICKER_COMPLETE'
        AND archived_at IS NULL
        AND ${trackingNumber} ILIKE '%' || tracking_number || '%'
      LIMIT 1
    `
    return rows[0] ?? null
  }
  return null
}

export async function diagnoseTracking(trackingNumber: string, tenantId: string) {
  // 1. Exact match
  const exact = await prisma.order.findFirst({
    where: { trackingNumber: { equals: trackingNumber, mode: 'insensitive' }, tenantId },
    select: { status: true, archivedAt: true },
  })
  if (exact) return exact

  // 2. Fallback: substring match (same logic as findOrderForPacking)
  if (trackingNumber.length >= 8) {
    const rows = await prisma.$queryRaw<Array<{ status: string; archivedAt: Date | null }>>`
      SELECT status::text, archived_at AS "archivedAt"
      FROM orders
      WHERE tenant_id = ${tenantId}
        AND ${trackingNumber} ILIKE '%' || tracking_number || '%'
      LIMIT 1
    `
    return rows[0] ?? null
  }
  return null
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
