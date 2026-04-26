import { OrderStatus } from '@dom/shared'
import { prisma } from '../lib/prisma'
import { completeOrder } from './packerAdminService'

const ORDER_SELECT = { id: true, trackingNumber: true, platform: true, delayLevel: true, status: true } as const
type OrderRow = { id: string; trackingNumber: string; platform: string; delayLevel: number; status: string }
const TRACKING_RE = /^[A-Z0-9]{6,40}$/i

export async function getMyOrders(packerId: string, tenantId: string) {
  const assignments = await prisma.packerAssignment.findMany({
    where: {
      packerId,
      completedAt: null,
      order: { tenantId, archivedAt: null, status: OrderStatus.PACKER_ASSIGNED },
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

export async function findOrderForPacking(tn: string, tenantId: string, packerId: string, rawBarcode?: string) {
  const candidates = buildCandidates(tn, rawBarcode)

  // 1. Exact case-insensitive match for each candidate — must be PACKER_ASSIGNED
  //    AND owned by the calling packer (active assignment).
  for (const c of candidates) {
    const exact = await prisma.order.findFirst({
      where: {
        trackingNumber: { equals: c, mode: 'insensitive' },
        tenantId,
        archivedAt: null,
        status: OrderStatus.PACKER_ASSIGNED,
        packerAssignments: { some: { packerId, completedAt: null } },
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
      SELECT o.id, o.tracking_number AS "trackingNumber", o.platform, o.delay_level AS "delayLevel", o.status::text
      FROM orders o
      JOIN packer_assignments pa ON pa.order_id = o.id AND pa.packer_id = ${packerId} AND pa.completed_at IS NULL
      WHERE o.tenant_id = ${tenantId}
        AND o.status = 'PACKER_ASSIGNED'
        AND o.archived_at IS NULL
        AND (
          ${c} ILIKE '%' || o.tracking_number || '%'
          OR o.tracking_number ILIKE '%' || ${c} || '%'
        )
      LIMIT 1
    `
    if (rows[0]) return rows[0]
  }

  return null
}

export async function diagnoseTracking(tn: string, tenantId: string, packerId: string, rawBarcode?: string) {
  const candidates = buildCandidates(tn, rawBarcode)

  for (const c of candidates) {
    const exact = await prisma.order.findFirst({
      where: { trackingNumber: { equals: c, mode: 'insensitive' }, tenantId, archivedAt: null },
      include: {
        packerAssignments: {
          where: { completedAt: null },
          take: 1,
          select: { packerId: true, packer: { select: { username: true } } },
        },
      },
    })
    if (exact) {
      const active = exact.packerAssignments[0]
      const assignedToMe = active?.packerId === packerId
      const assignedToOther = active && !assignedToMe ? active.packer.username : null
      return { status: exact.status, archivedAt: exact.archivedAt, assignedToMe, assignedToOther }
    }
  }

  return null
}

export async function completeByTracking(
  trackingNumber: string,
  packerId: string,
  tenantId: string,
) {
  // Active, non-archived, packer-assigned row only. Partial unique index allows
  // archived duplicates with the same trackingNumber in the same tenant —
  // without archivedAt: null, findFirst can pick an archived row and misreport state.
  const order = await prisma.order.findFirst({
    where: {
      trackingNumber: { equals: trackingNumber, mode: 'insensitive' },
      tenantId,
      archivedAt: null,
      status: OrderStatus.PACKER_ASSIGNED,
    },
    include: {
      packerAssignments: {
        where: { completedAt: null },
        take: 1,
        select: { packerId: true },
      },
    },
  })

  if (!order) throw new Error('Order not found')

  // Ownership check — only the assigned packer can complete the order.
  const activeAssignment = order.packerAssignments[0]
  if (!activeAssignment || activeAssignment.packerId !== packerId) {
    throw new Error('Order not assigned to you')
  }

  return completeOrder(order.id, packerId, packerId, tenantId)
}
