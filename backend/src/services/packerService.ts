import { OrderStatus } from '@dom/shared'
import { prisma } from '../lib/prisma'
import { completeOrder } from './packerAdminService'

const ORDER_SELECT = { id: true, trackingNumber: true, platform: true, delayLevel: true, status: true } as const
type OrderRow = { id: string; trackingNumber: string; platform: string; delayLevel: number; status: string }
const TRACKING_RE = /^[A-Z0-9]{6,40}$/i

// Build a de-duped list of candidate tracking numbers from the extracted value and raw barcode.
// The raw barcode may be a URL — we try all query params and path segments.
function buildCandidates(tn: string, rawBarcode?: string): string[] {
  const set = new Set<string>()
  set.add(tn)

  if (rawBarcode) {
    const rawUp = rawBarcode.trim().toUpperCase()
    if (rawUp) set.add(rawUp)

    try {
      const url = new URL(rawBarcode)
      for (const [, v] of url.searchParams) {
        if (v && TRACKING_RE.test(v)) set.add(v.toUpperCase())
      }
      const parts = url.pathname.split('/').filter(Boolean)
      for (const p of parts) {
        if (TRACKING_RE.test(p)) set.add(p.toUpperCase())
      }
    } catch {}
  }

  return [...set]
}

export async function findOrderForPacking(tn: string, tenantId: string, rawBarcode?: string) {
  const candidates = buildCandidates(tn, rawBarcode)

  // 1. Exact case-insensitive match for each candidate
  for (const c of candidates) {
    const exact = await prisma.order.findFirst({
      where: {
        trackingNumber: { equals: c, mode: 'insensitive' },
        tenantId,
        status: OrderStatus.PICKER_COMPLETE,
      },
      select: ORDER_SELECT,
    })
    if (exact) return exact
  }

  // 2. Bidirectional substring fallback — handles mismatched formats:
  //    e.g. DB has "JT123456" but barcode encodes a URL containing it,
  //    or DB has the full format but scan gives a shorter variant.
  for (const c of candidates) {
    if (c.length < 6) continue
    const rows = await prisma.$queryRaw<OrderRow[]>`
      SELECT id, tracking_number AS "trackingNumber", platform, delay_level AS "delayLevel", status::text
      FROM orders
      WHERE tenant_id = ${tenantId}
        AND status = 'PICKER_COMPLETE'
        AND archived_at IS NULL
        AND (
          ${c} ILIKE '%' || tracking_number || '%'
          OR tracking_number ILIKE '%' || ${c} || '%'
        )
      LIMIT 1
    `
    if (rows[0]) return rows[0]
  }

  return null
}

export async function diagnoseTracking(tn: string, tenantId: string, rawBarcode?: string) {
  const candidates = buildCandidates(tn, rawBarcode)

  for (const c of candidates) {
    const exact = await prisma.order.findFirst({
      where: { trackingNumber: { equals: c, mode: 'insensitive' }, tenantId },
      select: { status: true, archivedAt: true },
    })
    if (exact) return exact
  }

  for (const c of candidates) {
    if (c.length < 6) continue
    const rows = await prisma.$queryRaw<Array<{ status: string; archivedAt: Date | null }>>`
      SELECT status::text, archived_at AS "archivedAt"
      FROM orders
      WHERE tenant_id = ${tenantId}
        AND (
          ${c} ILIKE '%' || tracking_number || '%'
          OR tracking_number ILIKE '%' || ${c} || '%'
        )
      LIMIT 1
    `
    if (rows[0]) return rows[0]
  }

  return null
}

export async function completeByTracking(
  trackingNumber: string,
  packerId: string,
  tenantId: string,
) {
  // Active, non-archived, picker-complete row only. Partial unique index allows
  // archived duplicates with the same trackingNumber in the same tenant —
  // without this filter, findFirst can pick an archived row and misreport state.
  const order = await prisma.order.findFirst({
    where: {
      trackingNumber: { equals: trackingNumber, mode: 'insensitive' },
      tenantId,
      archivedAt: null,
      status: OrderStatus.PICKER_COMPLETE,
    },
  })

  if (!order) throw new Error('Order not found')

  return completeOrder(order.id, packerId, tenantId)
}
