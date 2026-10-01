import { Prisma, OrderStatus } from '@prisma/client'
import { Platform, Carrier, DispatchSource } from '@dom/shared'
import { prisma } from '../lib/prisma'
import { getManilaStartOf, getManilaStartOfToday, getManilaDateString } from '../lib/manila'

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

// ─── Carrier correction (v2.98.0) ─────────────────────────────────────────────
// Before v2.98.0 the Outbound scanner guessed an in-house parcel's courier from the
// order's carrier text with a substring match, so "SHOPEE_INSTANT" (contains
// "SHOPEE") was stored as SPX — Shopee Instant never showed up in Outbound reports.
// For in-house parcels the order row is the source of truth, so reads re-derive
// the carrier from it: historical days report Shopee Instant correctly without
// rewriting stored dispatch rows. Only SPX in-house rows are ever re-labelled
// (the only mis-mapping), and only when the linked order says SHOPEE_INSTANT.

const CARRIER_VALUES = new Set<string>(Object.values(Carrier))

function isCarrier(value: string | null | undefined): value is Carrier {
  return !!value && CARRIER_VALUES.has(value)
}

export async function withEffectiveCarrier<
  T extends { carrier: string; source: string; orderId: string | null },
>(rows: T[]): Promise<T[]> {
  const candidateIds = Array.from(new Set(
    rows
      .filter((r) => r.carrier === Carrier.SPX && r.source === DispatchSource.IN_HOUSE && r.orderId)
      .map((r) => r.orderId as string),
  ))
  if (candidateIds.length === 0) return rows
  const instant = await prisma.order.findMany({
    where: { id: { in: candidateIds }, carrierName: Carrier.SHOPEE_INSTANT },
    select: { id: true },
  })
  if (instant.length === 0) return rows
  const instantIds = new Set(instant.map((o) => o.id))
  return rows.map((r) =>
    r.carrier === Carrier.SPX && r.source === DispatchSource.IN_HOUSE && r.orderId && instantIds.has(r.orderId)
      ? { ...r, carrier: Carrier.SHOPEE_INSTANT }
      : r,
  )
}

// ─── In-house order lookup (read-only) ────────────────────────────────────────

export interface OrderLookupResult {
  found: boolean
  platform: Platform | null
  shopName: string | null
  carrierName: string | null
  packerComplete: boolean
}

// An order may only be dispatched once the packer has finished it. Packing
// complete auto-advances PACKER_COMPLETE → OUTBOUND, and the nightly archive
// keeps it OUTBOUND, so both statuses mean "the packer scanned it". Any earlier
// status means the packer has not completed the parcel yet.
const DISPATCHABLE_STATUSES: OrderStatus[] = [OrderStatus.PACKER_COMPLETE, OrderStatus.OUTBOUND]

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
    select: { platform: true, shopName: true, carrierName: true, status: true },
  })
  if (!order) return { found: false, platform: null, shopName: null, carrierName: null, packerComplete: false }
  return {
    found: true,
    platform: order.platform as Platform,
    shopName: order.shopName,
    carrierName: order.carrierName,
    packerComplete: DISPATCHABLE_STATUSES.includes(order.status),
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

/** Thrown when an in-house parcel's order hasn't been packer-completed yet. */
export class OrderNotPackerCompleteError extends Error {
  constructor() {
    super('ORDER_NOT_PACKER_COMPLETE')
    this.name = 'OrderNotPackerCompleteError'
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
  let carrier = input.carrier

  if (input.source === DispatchSource.IN_HOUSE) {
    // Re-verify the parcel really is ours (drives the "block it" error on the scanner).
    // Match archived orders too and case-insensitively — see lookupOrderForDispatch.
    const order = await prisma.order.findFirst({
      where: { tenantId: input.tenantId, trackingNumber: { equals: trackingNumber, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, shopName: true, status: true, carrierName: true },
    })
    if (!order) throw new OrderNotFoundError()
    // The packer must have finished the parcel before it can leave on a courier.
    if (!DISPATCHABLE_STATUSES.includes(order.status)) throw new OrderNotPackerCompleteError()
    orderId = order.id
    shopName = (input.shopName?.trim() || order.shopName || 'Unknown')
    // The order's carrier (picked at inbound) wins over the scanner's guess.
    if (isCarrier(order.carrierName)) carrier = order.carrierName
  }
  // EXTERNAL always rolls up under "Others" regardless of any supplied shop.

  return prisma.dispatchParcel.create({
    data: {
      tenantId: input.tenantId,
      createdById: input.createdById,
      trackingNumber,
      source: input.source,
      platform: input.platform,
      carrier,
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

  const parcels = await withEffectiveCarrier(await prisma.dispatchParcel.findMany({
    where: { tenantId, createdAt: { gte: startOfDay, lt: endOfDay } },
    select: { carrier: true, shopName: true, source: true, orderId: true },
  }))

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

  const parcels = await withEffectiveCarrier(await prisma.dispatchParcel.findMany({
    where,
    select: { carrier: true, source: true, orderId: true },
  }))

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
// Stages 1-3 = how many DISTINCT orders transitioned INTO each pipeline stage within
// the Manila date range (by OrderStatusHistory.changedAt) — the WAREHOUSE milestones
// Inbound → Picker Complete → Packer Complete.
//
// Stage 4 "outbound" is SCAN-DRIVEN, not the PACKER_COMPLETE → OUTBOUND auto-advance:
// it counts the in-house parcels the Outbound Admin actually SCANNED out in this range
// (Dispatch module, by dispatchParcel.createdAt). A parcel not scanned is NOT counted,
// even though its order auto-advanced to OUTBOUND when the packer finished it.
//
// Stage 5 "oldOrders" is a SUBSET of stage 4 (not a sequential drop): of the scanned
// parcels, how many were packer-completed on an EARLIER Manila day than the scan day
// (backlog packed before, shipped today). Same-day packed-and-scanned parcels are the
// normal flow and are NOT counted here. A scanned parcel whose order is gone (archived
// after 180 days) counts as old — archival means it was packed long ago.
// Read-only; never touches the order pipeline.
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

  // In-house parcels actually scanned out in this range (drives "outbound").
  const scannedParcels = await prisma.dispatchParcel.findMany({
    where: { tenantId, source: DispatchSource.IN_HOUSE, ...(hasRange ? { createdAt: range } : {}) },
    select: { createdAt: true, orderId: true },
  })

  // Resolve each scanned parcel's packer-complete day to split same-day vs backlog.
  // slaCompletedAt is stamped at the PACKER_COMPLETE → OUTBOUND auto-advance, i.e. the
  // moment the packer finished — the right "packed on" timestamp to compare against.
  const orderIds = scannedParcels
    .map((p) => p.orderId)
    .filter((id): id is string => Boolean(id))
  const completedOrders = orderIds.length
    ? await prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, slaCompletedAt: true },
      })
    : []
  const completedAtById = new Map(completedOrders.map((o) => [o.id, o.slaCompletedAt]))

  let oldOrders = 0
  for (const p of scannedParcels) {
    const completedAt = p.orderId ? completedAtById.get(p.orderId) ?? null : null
    const packedDay = completedAt ? getManilaDateString(completedAt) : null
    const scanDay = getManilaDateString(p.createdAt)
    // packed on an earlier day, or order archived/unknown → backlog "old order".
    if (packedDay === null || packedDay < scanDay) oldOrders++
  }
  const outbound = scannedParcels.length

  const [inbound, pickerComplete, packerComplete] = await Promise.all([
    distinctOrders(OrderStatus.INBOUND),
    distinctOrders(OrderStatus.PICKER_COMPLETE),
    distinctOrders(OrderStatus.PACKER_COMPLETE),
  ])
  return { inbound, pickerComplete, packerComplete, outbound, oldOrders }
}

// ─── Old-orders drill-down (backlog behind the funnel's "incl. N old orders") ──
// The list behind the Outbound box badge: in-house parcels scanned out in the range
// whose order was packer-completed on an EARLIER Manila day (or whose order is already
// archived). Same backlog predicate as getOrderPipeline's oldOrders counter, so the
// row count matches the badge. Read-only.
export interface OldOrderRow {
  trackingNumber: string
  inboundDate: string | null        // order.createdAt — when it entered the system
  packerCompleteDate: string | null // order.slaCompletedAt — when the packer finished
  assignedPicker: string | null     // picker username (completed PickerAssignment)
  assignedPacker: string | null     // packer username (completed PackerAssignment)
  scanDate: string                  // dispatchParcel.createdAt — the outbound scan
  archived: boolean                 // order row gone (>180d retention) → definitely backlog
}

export async function getOldOrdersList(
  tenantId: string,
  from?: string,
  to?: string,
): Promise<OldOrderRow[]> {
  const range: Prisma.DateTimeFilter = {
    ...(from ? { gte: new Date(from + 'T00:00:00+08:00') } : {}),
    ...(to ? { lte: new Date(to + 'T23:59:59+08:00') } : {}),
  }
  const hasRange = Boolean(from || to)

  const scannedParcels = await prisma.dispatchParcel.findMany({
    where: { tenantId, source: DispatchSource.IN_HOUSE, ...(hasRange ? { createdAt: range } : {}) },
    select: { trackingNumber: true, createdAt: true, orderId: true },
    orderBy: { createdAt: 'desc' },
  })

  const orderIds = scannedParcels
    .map((p) => p.orderId)
    .filter((id): id is string => Boolean(id))
  const orders = orderIds.length
    ? await prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: {
          id: true,
          createdAt: true,
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
      })
    : []
  const orderById = new Map(orders.map((o) => [o.id, o]))

  const rows: OldOrderRow[] = []
  for (const p of scannedParcels) {
    const order = p.orderId ? orderById.get(p.orderId) ?? null : null
    const completedAt = order?.slaCompletedAt ?? null
    const packedDay = completedAt ? getManilaDateString(completedAt) : null
    const scanDay = getManilaDateString(p.createdAt)
    // Same-day packed-and-scanned is the normal flow — only backlog belongs here.
    if (packedDay !== null && packedDay >= scanDay) continue
    rows.push({
      trackingNumber: p.trackingNumber,
      inboundDate: order?.createdAt ? order.createdAt.toISOString() : null,
      packerCompleteDate: completedAt ? completedAt.toISOString() : null,
      assignedPicker: order?.pickerAssignments[0]?.picker.username ?? null,
      assignedPacker: order?.packerAssignments[0]?.packer.username ?? null,
      scanDate: p.createdAt.toISOString(),
      archived: order === null,
    })
  }
  return rows
}

// ─── Order history (Outbound → Order History; read-only) ─────────────────────
// Everything that happened to one waybill, end to end: who scanned it in, which
// picker / packer had it and when, and who scanned it out to the courier. Replaces
// the Warehouse Report "Order Timeline" tab (v2.98.0). Matches archived orders and
// case-insensitively (inbound stores the raw scanned text), prefers the most recent
// order when a tracking number was re-used, and still answers for an external parcel
// that only exists in the dispatch log. Never writes anything.

export type HistoryEventType =
  | 'inbound'
  | 'picker_assigned'
  | 'picking'
  | 'picker_complete'
  | 'packer_assigned'
  | 'packing'
  | 'packer_complete'
  | 'ready'
  | 'returned'
  | 'outbound'

export interface HistoryEvent {
  type: HistoryEventType
  timestamp: string
  actor: string
  label: string
  detail: string | null
  durationFromPrevMs: number | null
}

export interface HistoryWorkStage {
  worker: string | null
  assignedBy: string | null
  assignedAt: string | null
  startedAt: string | null
  completedAt: string | null
  durationMs: number | null   // assigned → completed
  assignments: number         // > 1 = re-assigned
}

export interface OrderHistory {
  trackingNumber: string
  order: {
    id: string
    platform: string
    shopName: string | null
    carrierName: string | null
    status: string
    delayLevel: number
    slaStartedAt: string
    slaCompletedAt: string | null
    createdAt: string
    archived: boolean
  } | null
  stages: {
    inbound: { by: string; at: string } | null
    picker: HistoryWorkStage | null
    packer: HistoryWorkStage | null
    outbound: {
      by: string
      at: string
      carrier: string
      source: string
      platform: string
      shopName: string
    } | null
  }
  timeline: HistoryEvent[]
  totalDurationMs: number | null // first event → last event
  otherOrders: number            // older orders that re-used this tracking number
}

const STATUS_EVENT: Record<OrderStatus, { type: HistoryEventType; label: string }> = {
  INBOUND:         { type: 'inbound',         label: 'Scanned in at Inbound' },
  PICKER_ASSIGNED: { type: 'picker_assigned', label: 'Assigned to picker' },
  PICKING:         { type: 'picking',         label: 'Picking started' },
  PICKER_COMPLETE: { type: 'picker_complete', label: 'Picking complete' },
  PACKER_ASSIGNED: { type: 'packer_assigned', label: 'Assigned to packer' },
  PACKING:         { type: 'packing',         label: 'Packing started' },
  PACKER_COMPLETE: { type: 'packer_complete', label: 'Packing complete' },
  OUTBOUND:        { type: 'ready',           label: 'Ready for outbound' },
}

const STATUS_ORDER: OrderStatus[] = [
  OrderStatus.INBOUND,
  OrderStatus.PICKER_ASSIGNED,
  OrderStatus.PICKING,
  OrderStatus.PICKER_COMPLETE,
  OrderStatus.PACKER_ASSIGNED,
  OrderStatus.PACKING,
  OrderStatus.PACKER_COMPLETE,
  OrderStatus.OUTBOUND,
]

// An assignment row and its PICKER/PACKER_ASSIGNED status row are written together.
const MATCH_WINDOW_MS = 60 * 1000

interface AssignmentRow {
  assignedAt: Date
  completedAt: Date | null
  worker: string
  assignedBy: string
}

function nearestAssignment(rows: AssignmentRow[], at: Date): AssignmentRow | null {
  let best: AssignmentRow | null = null
  let bestDiff = Infinity
  for (const r of rows) {
    const diff = Math.abs(r.assignedAt.getTime() - at.getTime())
    if (diff < bestDiff) { best = r; bestDiff = diff }
  }
  return best && bestDiff <= MATCH_WINDOW_MS ? best : null
}

function workStage(
  rows: AssignmentRow[],
  history: { toStatus: OrderStatus; changedAt: Date }[],
  startStatus: OrderStatus,
): HistoryWorkStage | null {
  if (rows.length === 0) return null
  // The assignment that finished the job; otherwise the latest (still open) one.
  const done = rows.filter((r) => r.completedAt)
  const final = done.length ? done[done.length - 1] : rows[rows.length - 1]
  const started = history.find((h) => h.toStatus === startStatus && h.changedAt >= final.assignedAt)
  return {
    worker: final.worker,
    assignedBy: final.assignedBy,
    assignedAt: final.assignedAt.toISOString(),
    startedAt: started ? started.changedAt.toISOString() : null,
    completedAt: final.completedAt ? final.completedAt.toISOString() : null,
    durationMs: final.completedAt ? final.completedAt.getTime() - final.assignedAt.getTime() : null,
    assignments: rows.length,
  }
}

export async function getOrderHistory(tenantId: string, trackingNumber: string): Promise<OrderHistory | null> {
  const tn = trackingNumber.trim()
  const tnMatch = { equals: tn, mode: 'insensitive' as const }

  const [orders, dispatchRows] = await Promise.all([
    prisma.order.findMany({
      where: { tenantId, trackingNumber: tnMatch },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        trackingNumber: true,
        platform: true,
        shopName: true,
        carrierName: true,
        status: true,
        delayLevel: true,
        slaStartedAt: true,
        slaCompletedAt: true,
        createdAt: true,
        archivedAt: true,
        scannedBy: { select: { username: true } },
        statusHistory: {
          orderBy: { changedAt: 'asc' },
          select: { fromStatus: true, toStatus: true, changedAt: true, changedBy: { select: { username: true } } },
        },
        pickerAssignments: {
          orderBy: { assignedAt: 'asc' },
          select: {
            assignedAt: true,
            completedAt: true,
            picker: { select: { username: true } },
            assignedBy: { select: { username: true } },
          },
        },
        packerAssignments: {
          orderBy: { assignedAt: 'asc' },
          select: {
            assignedAt: true,
            completedAt: true,
            packer: { select: { username: true } },
            assignedBy: { select: { username: true } },
          },
        },
      },
    }),
    prisma.dispatchParcel.findMany({
      where: { tenantId, trackingNumber: tnMatch },
      orderBy: { createdAt: 'desc' },
      select: dispatchSelect,
    }),
  ])

  const order = orders[0] ?? null
  // Prefer the dispatch record linked to this order; fall back to any by waybill.
  const linked = order ? dispatchRows.find((d) => d.orderId === order.id) : undefined
  const rawDispatch = linked ?? dispatchRows[0] ?? null
  if (!order && !rawDispatch) return null
  const dispatch = rawDispatch ? (await withEffectiveCarrier([rawDispatch]))[0] : null

  const pickerRows: AssignmentRow[] = (order?.pickerAssignments ?? []).map((a) => ({
    assignedAt: a.assignedAt, completedAt: a.completedAt, worker: a.picker.username, assignedBy: a.assignedBy.username,
  }))
  const packerRows: AssignmentRow[] = (order?.packerAssignments ?? []).map((a) => ({
    assignedAt: a.assignedAt, completedAt: a.completedAt, worker: a.packer.username, assignedBy: a.assignedBy.username,
  }))
  const history = order?.statusHistory ?? []

  const events: HistoryEvent[] = []
  for (const h of history) {
    const meta = STATUS_EVENT[h.toStatus]
    const backwards = h.fromStatus !== null
      && STATUS_ORDER.indexOf(h.toStatus) < STATUS_ORDER.indexOf(h.fromStatus)
    let type = meta.type
    let label = meta.label
    let detail: string | null = null
    if (backwards && h.fromStatus) {
      type = 'returned'
      label = `Sent back to ${h.toStatus.replace(/_/g, ' ').toLowerCase()}`
      detail = `from ${h.fromStatus.replace(/_/g, ' ').toLowerCase()}`
    } else if (h.toStatus === OrderStatus.PICKER_ASSIGNED) {
      const a = nearestAssignment(pickerRows, h.changedAt)
      if (a) label = `Assigned to picker ${a.worker}`
    } else if (h.toStatus === OrderStatus.PACKER_ASSIGNED) {
      const a = nearestAssignment(packerRows, h.changedAt)
      if (a) label = `Assigned to packer ${a.worker}`
    }
    events.push({
      type,
      timestamp: h.changedAt.toISOString(),
      actor: h.changedBy.username,
      label,
      detail,
      durationFromPrevMs: null,
    })
  }

  if (dispatch) {
    events.push({
      type: 'outbound',
      timestamp: dispatch.createdAt.toISOString(),
      actor: dispatch.createdBy.username,
      label: 'Scanned out to courier',
      detail: dispatch.source === DispatchSource.IN_HOUSE ? 'In-house' : 'External',
      durationFromPrevMs: null,
    })
  }

  events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  for (let i = 1; i < events.length; i++) {
    events[i].durationFromPrevMs =
      new Date(events[i].timestamp).getTime() - new Date(events[i - 1].timestamp).getTime()
  }

  const inboundEvent = history.find((h) => h.toStatus === OrderStatus.INBOUND && h.fromStatus === null)
  const inbound = order
    ? {
        by: inboundEvent?.changedBy.username ?? order.scannedBy.username,
        at: (inboundEvent?.changedAt ?? order.createdAt).toISOString(),
      }
    : null

  return {
    trackingNumber: order?.trackingNumber ?? rawDispatch?.trackingNumber ?? tn,
    order: order
      ? {
          id: order.id,
          platform: order.platform,
          shopName: order.shopName,
          carrierName: order.carrierName,
          status: order.status,
          delayLevel: order.delayLevel,
          slaStartedAt: order.slaStartedAt.toISOString(),
          slaCompletedAt: order.slaCompletedAt ? order.slaCompletedAt.toISOString() : null,
          createdAt: order.createdAt.toISOString(),
          archived: order.archivedAt !== null,
        }
      : null,
    stages: {
      inbound,
      picker: workStage(pickerRows, history, OrderStatus.PICKING),
      packer: workStage(packerRows, history, OrderStatus.PACKING),
      outbound: dispatch
        ? {
            by: dispatch.createdBy.username,
            at: dispatch.createdAt.toISOString(),
            carrier: dispatch.carrier,
            source: dispatch.source,
            platform: dispatch.platform,
            shopName: dispatch.shopName,
          }
        : null,
    },
    timeline: events,
    totalDurationMs: events.length > 1
      ? new Date(events[events.length - 1].timestamp).getTime() - new Date(events[0].timestamp).getTime()
      : null,
    otherOrders: Math.max(0, orders.length - 1),
  }
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

  const [rawRows, total] = await Promise.all([
    prisma.dispatchParcel.findMany({
      where,
      select: dispatchSelect,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.dispatchParcel.count({ where }),
  ])
  const rows = await withEffectiveCarrier(rawRows)

  return { rows, total, page, pageSize }
}

export async function deleteDispatch(tenantId: string, id: string): Promise<{ id: string } | null> {
  const found = await prisma.dispatchParcel.findFirst({ where: { id, tenantId }, select: { id: true } })
  if (!found) return null
  await prisma.dispatchParcel.delete({ where: { id } })
  return { id }
}
