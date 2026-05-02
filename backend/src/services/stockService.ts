import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { StockStatus, MovementDirection } from '@prisma/client'
import { prisma } from '../lib/prisma'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateBulkItemsInput {
  productType: string
  category: string
  weightKg: number
  quantity: number
}

export interface ScanResult {
  item: {
    id: string
    productType: string
    category: string
    weightKg: number
    status: StockStatus
  }
  direction: MovementDirection
  message: string
}

// ─── Avery L7173 / J8173 sticker layout (A4, 2×5 = 10 stickers/sheet) ────────
// 1 mm = 2.83465 pt
const PT_PER_MM = 2.83465
const A4_W_PT = 210 * PT_PER_MM
const STICKER_W_PT = 99.1 * PT_PER_MM
const STICKER_H_PT = 57 * PT_PER_MM
const MARGIN_LEFT_PT = 4.5 * PT_PER_MM
const MARGIN_TOP_PT = 13.5 * PT_PER_MM
const GAP_X_PT = (A4_W_PT - 2 * MARGIN_LEFT_PT - 2 * STICKER_W_PT) // = 2.5mm * 2.83
const QR_SIZE_PT = 40 * PT_PER_MM
const PADDING_PT = 4 * PT_PER_MM

// ─── PDF Helper ───────────────────────────────────────────────────────────────

async function buildStickerPdf(
  items: { id: string; productType: string; category: string; weightKg: number }[],
): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 0 })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))

  // Pre-render all QR PNGs (high resolution for crisp print)
  const qrPngs = await Promise.all(
    items.map((it) => QRCode.toBuffer(it.id, { type: 'png', width: 600, margin: 1 })),
  )

  for (let i = 0; i < items.length; i++) {
    const onPageIdx = i % 10
    if (i > 0 && onPageIdx === 0) doc.addPage()

    const col = onPageIdx % 2
    const row = Math.floor(onPageIdx / 2)
    const x = MARGIN_LEFT_PT + col * (STICKER_W_PT + GAP_X_PT)
    const y = MARGIN_TOP_PT + row * STICKER_H_PT

    // QR code on the left, vertically centered
    const qrY = y + (STICKER_H_PT - QR_SIZE_PT) / 2
    doc.image(qrPngs[i], x + PADDING_PT, qrY, { width: QR_SIZE_PT, height: QR_SIZE_PT })

    // Text on the right
    const textX = x + PADDING_PT + QR_SIZE_PT + PADDING_PT
    const textW = STICKER_W_PT - PADDING_PT - QR_SIZE_PT - PADDING_PT - PADDING_PT
    const textTop = y + PADDING_PT + 6 // small top offset for nicer alignment

    const it = items[i]
    doc.fontSize(11).font('Helvetica-Bold')
       .text(it.productType, textX, textTop, { width: textW, ellipsis: true })
    doc.fontSize(9).font('Helvetica')
       .text(it.category, textX, textTop + 18, { width: textW, ellipsis: true })
    doc.fontSize(9)
       .text(`${it.weightKg} kg`, textX, textTop + 34, { width: textW })
    doc.fontSize(7).font('Courier')
       .text(it.id.slice(0, 8), textX, textTop + 50, { width: textW })
  }

  doc.end()
  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })
}

// ─── Service Functions ────────────────────────────────────────────────────────

export async function createBulkItems(
  tenantId: string,
  input: CreateBulkItemsInput,
): Promise<{ count: number; pdf: Buffer }> {
  const productType = input.productType.trim()
  const category = input.category.trim()
  const weightKg = input.weightKg
  const quantity = input.quantity

  if (!productType || !category) throw new Error('Product type and category are required')
  if (weightKg <= 0) throw new Error('Weight must be greater than 0')
  if (quantity < 1 || quantity > 500) throw new Error('Quantity must be between 1 and 500')

  // Bulk insert — Prisma generates UUIDs automatically via @default(uuid())
  const created = await prisma.$transaction(
    Array.from({ length: quantity }).map(() =>
      prisma.stockItem.create({
        data: { tenantId, productType, category, weightKg },
        select: { id: true, productType: true, category: true, weightKg: true },
      }),
    ),
  )

  const pdf = await buildStickerPdf(created)
  return { count: created.length, pdf }
}

export async function listItems(
  tenantId: string,
  filters?: { status?: StockStatus; productType?: string; category?: string },
) {
  return prisma.stockItem.findMany({
    where: {
      tenantId,
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.productType ? { productType: { contains: filters.productType, mode: 'insensitive' } } : {}),
      ...(filters?.category ? { category: { contains: filters.category, mode: 'insensitive' } } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: 500,
  })
}

export async function scanItem(
  tenantId: string,
  scannedById: string,
  stockItemId: string,
): Promise<ScanResult> {
  // Find the item and verify tenant ownership
  const existing = await prisma.stockItem.findFirst({
    where: { id: stockItemId, tenantId },
  })
  if (!existing) throw new Error('Stock item not found')

  // Toggle status — IN_STOCK becomes OUT (item leaves), OUT_OF_STOCK becomes IN (item returns)
  const newStatus: StockStatus = existing.status === 'IN_STOCK' ? 'OUT_OF_STOCK' : 'IN_STOCK'
  const direction: MovementDirection = existing.status === 'IN_STOCK' ? 'OUT' : 'IN'

  const [updated] = await prisma.$transaction([
    prisma.stockItem.update({
      where: { id: stockItemId },
      data: { status: newStatus },
      select: { id: true, productType: true, category: true, weightKg: true, status: true },
    }),
    prisma.stockMovement.create({
      data: { stockItemId, direction, scannedById },
    }),
  ])

  const message = direction === 'IN'
    ? `Checked IN — ${updated.productType} · ${updated.category} · ${updated.weightKg}kg`
    : `Checked OUT — ${updated.productType} · ${updated.category} · ${updated.weightKg}kg`

  return { item: updated, direction, message }
}

export async function listMovements(
  tenantId: string,
  options?: { limit?: number; offset?: number },
) {
  const limit = Math.min(options?.limit ?? 100, 500)
  const offset = options?.offset ?? 0

  // Movements joined with stock items for the tenant — no FK to user, lookup separately
  const movements = await prisma.stockMovement.findMany({
    where: { stockItem: { tenantId } },
    include: {
      stockItem: {
        select: { id: true, productType: true, category: true, weightKg: true, status: true },
      },
    },
    orderBy: { scannedAt: 'desc' },
    take: limit,
    skip: offset,
  })

  // Resolve scannedBy usernames in one batch
  const userIds = Array.from(new Set(movements.map((m) => m.scannedById)))
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds }, tenantId },
        select: { id: true, username: true },
      })
    : []
  const userMap = new Map(users.map((u) => [u.id, u.username]))

  return movements.map((m) => ({
    id: m.id,
    direction: m.direction,
    scannedAt: m.scannedAt,
    scannedBy: userMap.get(m.scannedById) ?? '(unknown)',
    item: m.stockItem,
  }))
}

export async function getStats(tenantId: string) {
  const [totalInStock, totalOutOfStock, byCategoryRaw] = await Promise.all([
    prisma.stockItem.count({ where: { tenantId, status: 'IN_STOCK' } }),
    prisma.stockItem.count({ where: { tenantId, status: 'OUT_OF_STOCK' } }),
    prisma.stockItem.groupBy({
      by: ['category', 'status'],
      where: { tenantId },
      _count: { _all: true },
    }),
  ])

  // Reshape groupBy into per-category { in, out }
  const map = new Map<string, { category: string; in: number; out: number }>()
  for (const row of byCategoryRaw) {
    const entry = map.get(row.category) ?? { category: row.category, in: 0, out: 0 }
    if (row.status === 'IN_STOCK') entry.in = row._count._all
    else entry.out = row._count._all
    map.set(row.category, entry)
  }
  const byCategory = Array.from(map.values()).sort((a, b) => a.category.localeCompare(b.category))

  return {
    totalInStock,
    totalOutOfStock,
    totalItems: totalInStock + totalOutOfStock,
    categoriesCount: map.size,
    byCategory,
  }
}
