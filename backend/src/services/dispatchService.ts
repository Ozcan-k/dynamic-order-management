import { Prisma, OrderStatus } from '@prisma/client'
import { Platform, Carrier, DispatchSource } from '@dom/shared'
import { prisma } from '../lib/prisma'
import { getManilaStartOf, getManilaStartOfToday } from '../lib/manila'

// ─── Outbound (dispatch) service ──────────────────────────────────────────────
// Independent "handed-to-courier" log. NEVER writes to the Order pipeline — the
// in-house lookup below is read-only. Records are kept indefinitely (no purge).

const EXTERNAL_SHOP = 'Others'

const dispatchSelect = {
  id: true,
  trackingNumber: true,
  source: true,
  platform: true,
  carrier: true,
  shopName: true,
  orderId: true,
  createdAt: true,
  createdBy: { select: { username: true } },
} satisfies Prisma.DispatchParcelSelect

// ─── In-house order lookup (read-only) ────────────────────────────────────────

export interface OrderLookupResult {
  found: boolean
  platform: Platform | null
  shopName: string | null
  carrierName: string | null
}

/** Read-only lookup of OUR orders by tracking number. Never mutates the order. */
export async function lookupOrderForDispatch(
  tenantId: string,
  trackingNumber: string,
): Promise<OrderLookupResult> {
  const tn = trackingNumber.trim().toUpperCase()
  // Do NOT filter on archivedAt: completed parcels auto-advance to OUTBOUND and
  // are archived nightly (23:30 Manila), so a parcel handed to the courier the
  // day after it was packed would otherwise read as "not in our system".
  // Match case-insensitively too — inbound stores the raw scanned text (no
  // upper-casing), so a case difference must not break the match. When a tracking
  // number was re-used after archival, prefer the most recent order.
  const order = await prisma.order.findFirst({
    where: { tenantId, trackingNumber: { equals: tn, mode: 'insensitive' } },
    orderBy: { createdAt: 'desc' },
    select: { platform: true, shopName: true, carrierName: true },
  })
  if (!order) return { found: false, platform: null, shopName: null, carrierName: null }
  return {
    found: true,
    platform: order.platform as Platform,
    shopName: order.shopName,
    carrierName: order.carrierName,
  }
}

// ─── Create ───────────────────────────────────────────────────────────────────

export interface CreateDispatchInput {
  tenantId: string
  createdById: string
  trackingNumber: string
  source: DispatchSource
  platform: Platform
  carrier: Carrier
  shopName?: string
}

/** Thrown when the same waybill is dispatched twice — one record per parcel. */
export class DuplicateDispatchError extends Error {
  constructor() {
    super('DUPLICATE_DISPATCH')
    this.name = 'DuplicateDispatchError'
  }
}

/** Thrown when an in-house parcel has no matching order in our system. */
export class OrderNotFoundError extends Error {
  constructor() {
    super('ORDER_NOT_FOUND')
    this.name = 'OrderNotFoundError'
  }
}

export async function createDispatchParcel(input: CreateDispatchInput) {
  const trackingNumber = input.trackingNumber.trim().toUpperCase()

  // One record per parcel — reject re-scans up front.
  const existing = await prisma.dispatchParcel.findFirst({
    where: { tenantId: input.tenantId, trackingNumber },
    select: { id: true },
  })
  if (existing) throw new DuplicateDispatchError()

  let shopName = EXTERNAL_SHOP
  let orderId: string | null = null

  if (input.source === DispatchSource.IN_HOUSE) {
    // Re-verify the parcel really is ours (drives the "block it" error on the scanner).
    // Match archived orders too and case-insensitively — see lookupOrderForDispatch.
    const order = await prisma.order.findFirst({
      where: { tenantId: input.tenantId, trackingNumber: { equals: trackingNumber, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, shopName: true },
    })
    if (!order) throw new OrderNotFoundError()
    orderId = order.id
    shopName = (input.shopName?.trim() || order.shopName || 'Unknown')
  }
  // EXTERNAL always rolls up under "Others" regardless of any supplied shop.

  return prisma.dispatchParcel.create({
    data: {
      tenantId: input.tenantId,
      createdById: input.createdById,
      trackingNumber,
      source: input.source,
      platform: input.platform,
      carrier: input.carrier,
      shopName,
      orderId,
    },
    select: dispatchSelect,
  })
}

// ─── Grouped by carrier → shop (board, single day) ────────────────────────────

export async function getDispatchGrouped(tenantId: string, date?: string) {
  const startOfDay = date ? getManilaStartOf(date) : getManilaStartOfToday()
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000)

  const parcels = await prisma.dispatchParcel.findMany({
    where: { tenantId, createdAt: { gte: startOfDay, lt: endOfDay } },
    select: { carrier: true, shopName: true },
  })

  const map = new Map<string, Map<string, number>>()
  for (const p of parcels) {
    const carrier = p.carrier ?? 'OTHER'
    const shop = p.shopName || EXTERNAL_SHOP
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

// ─── Header stats (board, single day) ─────────────────────────────────────────

export async function getDispatchStats(tenantId: string, date?: string) {
  const startOfDay = date ? getManilaStartOf(date) : getManilaStartOfToday()
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000)
  const where = { tenantId, createdAt: { gte: startOfDay, lt: endOfDay } }

  const [total, inHouse, external] = await Promise.all([
    prisma.dispatchParcel.count({ where }),
    prisma.dispatchParcel.count({ where: { ...where, source: DispatchSource.IN_HOUSE } }),
    prisma.dispatchParcel.count({ where: { ...where, source: DispatchSource.EXTERNAL } }),
  ])
  return { total, inHouse, external, historical: Boolean(date) }
}

// ─── Historical report (per-carrier totals across a range) ────────────────────

export async function getDispatchReport(tenantId: string, from?: string, to?: string) {
  const createdAt: Prisma.DateTimeFilter = {
    ...(from ? { gte: new Date(from + 'T00:00:00+08:00') } : {}),
    ...(to ? { lte: new Date(to + 'T23:59:59+08:00') } : {}),
  }
  const where: Prisma.DispatchParcelWhereInput = {
    tenantId,
    ...(from || to ? { createdAt } : {}),
  }

  const parcels = await prisma.dispatchParcel.findMany({
    where,
    select: { carrier: true, source: true },
  })

  const map = new Map<string, { total: number; inHouse: number; external: number }>()
  for (const p of parcels) {
    const carrier = p.carrier ?? 'OTHER'
    if (!map.has(carrier)) map.set(carrier, { total: 0, inHouse: 0, external: 0 })
    const row = map.get(carrier)!
    row.total += 1
    if (p.source === DispatchSource.IN_HOUSE) row.inHouse += 1
    else row.external += 1
  }

  const carriers = Array.from(map.entries())
    .map(([carrier, v]) => ({ carrier, ...v }))
    .sort((a, b) => b.total - a.total)

  const totals = carriers.reduce(
    (acc, c) => ({ total: acc.total + c.total, inHouse: acc.inHouse + c.inHouse, external: acc.external + c.external }),
    { total: 0, inHouse: 0, external: 0 },
  )

  return { carriers, totals }
}

// ─── Order pipeline funnel (Outbound Report; read-only order-pipeline stats) ──
// Stages 1-4 = how many DISTINCT orders transitioned INTO each pipeline stage within
// the Manila date range (by OrderStatusHistory.changedAt) — the WAREHOUSE milestones
// (packing complete auto-advances PACKER_COMPLETE → OUTBOUND, so those two track each
// other). Stage 5 "dispatched" = in-house parcels physically handed to courier (the
// independent Dispatch module, by dispatchParcel.createdAt) — a DIFFERENT event on a
// DIFFERENT timeline, so it can exceed "outbound" on a given day (backlog packed on
// earlier days but shipped today). Read-only; never touches the order pipeline. Note:
// OrderStatusHistory is hard-deleted with the order after 180 days, so stages 1-4 only
// cover the retention window (dispatch records are kept indefinitely).
export async function getOrderPipeline(tenantId: string, from?: string, to?: string) {
  const range: Prisma.DateTimeFilter = {
    ...(from ? { gte: new Date(from + 'T00:00:00+08:00') } : {}),
    ...(to ? { lte: new Date(to + 'T23:59:59+08:00') } : {}),
  }
  const hasRange = Boolean(from || to)
  const base: Prisma.OrderStatusHistoryWhereInput = {
    order: { tenantId },
    ...(hasRange ? { changedAt: range } : {}),
  }

  const distinctOrders = async (toStatus: OrderStatus) => {
    const rows = await prisma.orderStatusHistory.findMany({
      where: { ...base, toStatus },
      distinct: ['orderId'],
      select: { orderId: true },
    })
    return rows.length
  }

  const [inbound, pickerComplete, packerComplete, outbound, dispatched] = await Promise.all([
    distinctOrders(OrderStatus.INBOUND),
    distinctOrders(OrderStatus.PICKER_COMPLETE),
    distinctOrders(OrderStatus.PACKER_COMPLETE),
    distinctOrders(OrderStatus.OUTBOUND),
    // In-house parcels handed to courier (matches the header "In-house" counter).
    prisma.dispatchParcel.count({
      where: { tenantId, source: DispatchSource.IN_HOUSE, ...(hasRange ? { createdAt: range } : {}) },
    }),
  ])
  return { inbound, pickerComplete, packerComplete, outbound, dispatched }
}

// ─── Paginated list + delete (admin corrections) ──────────────────────────────

export interface ListDispatchParams {
  page?: number
  pageSize?: number
  search?: string
  source?: DispatchSource
  from?: string
  to?: string
}

export async function listDispatch(tenantId: string, params: ListDispatchParams) {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25))
  const skip = (page - 1) * pageSize

  const createdAt: Prisma.DateTimeFilter = {
    ...(params.from ? { gte: new Date(params.from + 'T00:00:00+08:00') } : {}),
    ...(params.to ? { lte: new Date(params.to + 'T23:59:59+08:00') } : {}),
  }
  const where: Prisma.DispatchParcelWhereInput = {
    tenantId,
    ...(params.from || params.to ? { createdAt } : {}),
    ...(params.source ? { source: params.source } : {}),
    ...(params.search ? { trackingNumber: { contains: params.search.trim().toUpperCase() } } : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.dispatchParcel.findMany({
      where,
      select: dispatchSelect,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.dispatchParcel.count({ where }),
  ])

  return { rows, total, page, pageSize }
}

export async function deleteDispatch(tenantId: string, id: string): Promise<{ id: string } | null> {
  const found = await prisma.dispatchParcel.findFirst({ where: { id, tenantId }, select: { id: true } })
  if (!found) return null
  await prisma.dispatchParcel.delete({ where: { id } })
  return { id }
}
