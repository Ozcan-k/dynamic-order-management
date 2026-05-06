import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { StockStatus, StockUnit, MovementType } from '@prisma/client'
import { prisma } from '../lib/prisma'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GenerateLabelsInput {
  productId: string
  warehouseId: string
  unit: StockUnit
  quantity: number
  count: number
}

export interface ScanPayload {
  id: string
}

export type ScanResultType = 'IN' | 'USED' | 'TRANSFER'

export interface ScanResult {
  item: {
    id: string
    productName: string
    productCode: string
    unit: StockUnit
    quantity: number
    batchNumber: string
    status: StockStatus
    warehouseId: string
    warehouseName: string
  }
  type: ScanResultType
  fromWarehouse?: string
  toWarehouse?: string
  message: string
}

// ─── Avery L7173 / J8173 sticker layout (A4, 2×5 = 10 stickers/sheet) ────────
const PT_PER_MM = 2.83465
const A4_W_PT = 210 * PT_PER_MM
const STICKER_W_PT = 99.1 * PT_PER_MM
const STICKER_H_PT = 57 * PT_PER_MM
const MARGIN_LEFT_PT = 4.5 * PT_PER_MM
const MARGIN_TOP_PT = 13.5 * PT_PER_MM
const GAP_X_PT = (A4_W_PT - 2 * MARGIN_LEFT_PT - 2 * STICKER_W_PT)
const QR_SIZE_PT = 40 * PT_PER_MM
const PADDING_PT = 4 * PT_PER_MM

interface LabelItem {
  id: string
  productName: string
  productCode: string
  warehouseName: string
  batchNumber: string
  unit: StockUnit
  quantity: number
}

async function buildStickerPdf(items: LabelItem[]): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 0 })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))

  const qrPngs = await Promise.all(
    items.map((it) => QRCode.toBuffer(
      JSON.stringify({ id: it.id }),
      { type: 'png', width: 600, margin: 1, errorCorrectionLevel: 'M' },
    )),
  )

  for (let i = 0; i < items.length; i++) {
    const onPageIdx = i % 10
    if (i > 0 && onPageIdx === 0) doc.addPage()

    const col = onPageIdx % 2
    const row = Math.floor(onPageIdx / 2)
    const x = MARGIN_LEFT_PT + col * (STICKER_W_PT + GAP_X_PT)
    const y = MARGIN_TOP_PT + row * STICKER_H_PT

    const qrY = y + (STICKER_H_PT - QR_SIZE_PT) / 2
    doc.image(qrPngs[i], x + PADDING_PT, qrY, { width: QR_SIZE_PT, height: QR_SIZE_PT })

    const textX = x + PADDING_PT + QR_SIZE_PT + PADDING_PT
    const textW = STICKER_W_PT - PADDING_PT - QR_SIZE_PT - PADDING_PT - PADDING_PT
    const textTop = y + PADDING_PT + 4

    const it = items[i]
    const qtyText = it.unit === 'KG' ? `${it.quantity} kg` : `${it.quantity} pcs`

    doc.fontSize(11).font('Helvetica-Bold')
       .text(it.productName, textX, textTop, { width: textW, ellipsis: true })
    doc.fontSize(8).font('Helvetica')
       .text(`#${it.productCode}`, textX, textTop + 16, { width: textW, ellipsis: true })
    doc.fontSize(9).font('Helvetica-Bold')
       .text(qtyText, textX, textTop + 30, { width: textW })
    doc.fontSize(8).font('Helvetica')
       .text(it.warehouseName, textX, textTop + 44, { width: textW, ellipsis: true })
    doc.fontSize(7).font('Courier')
       .text(`Batch ${it.batchNumber}`, textX, textTop + 58, { width: textW, ellipsis: true })
    doc.fontSize(6).font('Courier').fillColor('#888')
       .text(it.id.slice(0, 8), textX, textTop + 70, { width: textW })
    doc.fillColor('#000')
  }

  doc.end()
  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })
}

// ─── Batch number generator (YYYYMMDD-NNN) ───────────────────────────────────

function todayPrefix(): string {
  const d = new Date()
  const y = d.getFullYear().toString().padStart(4, '0')
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${y}${m}${day}`
}

async function nextBatchNumber(tenantId: string): Promise<string> {
  const prefix = todayPrefix()
  const todays = await prisma.stockItem.findMany({
    where: { tenantId, batchNumber: { startsWith: prefix } },
    select: { batchNumber: true },
    distinct: ['batchNumber'],
  })
  const seqs = todays
    .map((r) => parseInt(r.batchNumber.slice(prefix.length + 1), 10))
    .filter((n) => Number.isFinite(n))
  const next = (seqs.length ? Math.max(...seqs) : 0) + 1
  return `${prefix}-${next.toString().padStart(3, '0')}`
}

// ─── Service Functions ────────────────────────────────────────────────────────

export async function generateLabelsPdf(
  tenantId: string,
  input: GenerateLabelsInput,
): Promise<{ count: number; batchNumber: string; pdf: Buffer }> {
  if (!input.productId) throw new Error('Product is required')
  if (!input.warehouseId) throw new Error('Warehouse is required')
  if (input.unit !== 'KG' && input.unit !== 'PCS') throw new Error('Unit must be KG or PCS')
  if (!(input.quantity > 0)) throw new Error('Quantity must be greater than 0')
  if (input.count < 1 || input.count > 500) throw new Error('Label count must be between 1 and 500')

  const [product, warehouse] = await Promise.all([
    prisma.product.findFirst({
      where: { id: input.productId, tenantId },
      select: { id: true, productCode: true, name: true },
    }),
    prisma.warehouse.findFirst({
      where: { id: input.warehouseId, tenantId },
      select: { id: true, name: true },
    }),
  ])
  if (!product) throw new Error('Product not found')
  if (!warehouse) throw new Error('Warehouse not found')

  const batchNumber = await nextBatchNumber(tenantId)

  const created = await prisma.$transaction(async (tx) => {
    const rows = []
    for (let i = 0; i < input.count; i++) {
      const row = await tx.stockItem.create({
        data: {
          tenantId,
          productId: product.id,
          warehouseId: warehouse.id,
          unit: input.unit,
          quantity: input.quantity,
          batchNumber,
          status: 'IN_STOCK',
        },
        select: { id: true },
      })
      rows.push(row)
    }
    return rows
  })

  const labels: LabelItem[] = created.map((r) => ({
    id: r.id,
    productName: product.name,
    productCode: product.productCode,
    warehouseName: warehouse.name,
    batchNumber,
    unit: input.unit,
    quantity: input.quantity,
  }))

  const pdf = await buildStickerPdf(labels)
  return { count: labels.length, batchNumber, pdf }
}

export async function listItems(
  tenantId: string,
  filters?: { status?: StockStatus; productId?: string; warehouseId?: string },
) {
  return prisma.stockItem.findMany({
    where: {
      tenantId,
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.productId ? { productId: filters.productId } : {}),
      ...(filters?.warehouseId ? { warehouseId: filters.warehouseId } : {}),
    },
    include: {
      product: { include: { category: { select: { id: true, name: true } } } },
      warehouse: { select: { id: true, name: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 500,
  })
}

export async function scanItem(
  tenantId: string,
  scannedById: string,
  warehouseId: string,
  payload: ScanPayload,
): Promise<ScanResult> {
  if (!payload.id) throw new Error('Invalid QR payload — missing id')
  if (!warehouseId) throw new Error('Warehouse must be selected before scanning')

  const scanWarehouse = await prisma.warehouse.findFirst({
    where: { id: warehouseId, tenantId },
    select: { id: true, name: true },
  })
  if (!scanWarehouse) throw new Error('Selected warehouse not found')

  const existing = await prisma.stockItem.findFirst({
    where: { id: payload.id, tenantId },
    include: {
      product: { select: { id: true, name: true, productCode: true } },
      warehouse: { select: { id: true, name: true } },
    },
  })

  if (!existing) throw new Error('Unknown label — no stock record found for this QR code')

  const sameWarehouse = existing.warehouseId === scanWarehouse.id

  // Case A: out → re-IN at scanned warehouse
  if (existing.status === 'OUT_OF_STOCK') {
    const [updated] = await prisma.$transaction([
      prisma.stockItem.update({
        where: { id: existing.id },
        data: { status: 'IN_STOCK', warehouseId: scanWarehouse.id },
        include: {
          product: { select: { id: true, name: true, productCode: true } },
          warehouse: { select: { id: true, name: true } },
        },
      }),
      prisma.stockMovement.create({
        data: {
          stockItemId: existing.id,
          type: 'IN',
          toWarehouseId: scanWarehouse.id,
          scannedById,
        },
      }),
    ])
    return {
      item: shapeItem(updated),
      type: 'IN',
      toWarehouse: scanWarehouse.name,
      message: `Stocked at ${scanWarehouse.name} — ${updated.product.name}`,
    }
  }

  // Case B: in stock + same warehouse → USED (out)
  if (sameWarehouse) {
    const [updated] = await prisma.$transaction([
      prisma.stockItem.update({
        where: { id: existing.id },
        data: { status: 'OUT_OF_STOCK' },
        include: {
          product: { select: { id: true, name: true, productCode: true } },
          warehouse: { select: { id: true, name: true } },
        },
      }),
      prisma.stockMovement.create({
        data: {
          stockItemId: existing.id,
          type: 'USED',
          fromWarehouseId: scanWarehouse.id,
          scannedById,
        },
      }),
    ])
    return {
      item: shapeItem(updated),
      type: 'USED',
      fromWarehouse: scanWarehouse.name,
      message: `Used / out — ${updated.product.name}`,
    }
  }

  // Case C: in stock + different warehouse → TRANSFER
  const fromName = existing.warehouse.name
  const [updated] = await prisma.$transaction([
    prisma.stockItem.update({
      where: { id: existing.id },
      data: { warehouseId: scanWarehouse.id },
      include: {
        product: { select: { id: true, name: true, productCode: true } },
        warehouse: { select: { id: true, name: true } },
      },
    }),
    prisma.stockMovement.create({
      data: {
        stockItemId: existing.id,
        type: 'TRANSFER',
        fromWarehouseId: existing.warehouseId,
        toWarehouseId: scanWarehouse.id,
        scannedById,
      },
    }),
  ])
  return {
    item: shapeItem(updated),
    type: 'TRANSFER',
    fromWarehouse: fromName,
    toWarehouse: scanWarehouse.name,
    message: `Transferred ${fromName} → ${scanWarehouse.name}`,
  }
}

function shapeItem(row: {
  id: string
  unit: StockUnit
  quantity: number
  batchNumber: string
  status: StockStatus
  warehouseId: string
  product: { name: string; productCode: string }
  warehouse: { name: string }
}): ScanResult['item'] {
  return {
    id: row.id,
    productName: row.product.name,
    productCode: row.product.productCode,
    unit: row.unit,
    quantity: row.quantity,
    batchNumber: row.batchNumber,
    status: row.status,
    warehouseId: row.warehouseId,
    warehouseName: row.warehouse.name,
  }
}

export async function deleteItem(tenantId: string, itemId: string): Promise<{ id: string }> {
  const existing = await prisma.stockItem.findFirst({
    where: { id: itemId, tenantId },
    select: { id: true },
  })
  if (!existing) throw new Error('Stock item not found')
  await prisma.stockItem.delete({ where: { id: existing.id } })
  return { id: existing.id }
}

export async function listMovements(
  tenantId: string,
  options?: { limit?: number; offset?: number },
) {
  const limit = Math.min(options?.limit ?? 100, 500)
  const offset = options?.offset ?? 0

  const movements = await prisma.stockMovement.findMany({
    where: { stockItem: { tenantId } },
    include: {
      stockItem: {
        select: {
          id: true,
          unit: true,
          quantity: true,
          batchNumber: true,
          status: true,
          product: { select: { name: true, productCode: true } },
        },
      },
      fromWarehouse: { select: { id: true, name: true } },
      toWarehouse: { select: { id: true, name: true } },
    },
    orderBy: { scannedAt: 'desc' },
    take: limit,
    skip: offset,
  })

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
    type: m.type,
    scannedAt: m.scannedAt,
    scannedBy: userMap.get(m.scannedById) ?? '(unknown)',
    fromWarehouse: m.fromWarehouse,
    toWarehouse: m.toWarehouse,
    item: {
      id: m.stockItem.id,
      productName: m.stockItem.product.name,
      productCode: m.stockItem.product.productCode,
      unit: m.stockItem.unit,
      quantity: m.stockItem.quantity,
      batchNumber: m.stockItem.batchNumber,
      status: m.stockItem.status,
    },
  }))
}

// ─── Aggregates / Stats ──────────────────────────────────────────────────────

export async function getSummary(tenantId: string) {
  const products = await prisma.product.findMany({
    where: { tenantId },
    include: { category: { select: { id: true, name: true } } },
    orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
  })

  if (products.length === 0) return []

  const productIds = products.map((p) => p.id)
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [inStockCounts, transferCounts, usedCounts] = await Promise.all([
    prisma.stockItem.groupBy({
      by: ['productId'],
      where: { tenantId, productId: { in: productIds }, status: 'IN_STOCK' },
      _count: { _all: true },
    }),
    prisma.stockMovement.groupBy({
      by: ['stockItemId'],
      where: {
        stockItem: { tenantId, productId: { in: productIds } },
        type: 'TRANSFER',
        scannedAt: { gte: since },
      },
      _count: { _all: true },
    }),
    prisma.stockMovement.groupBy({
      by: ['stockItemId'],
      where: {
        stockItem: { tenantId, productId: { in: productIds } },
        type: 'USED',
        scannedAt: { gte: since },
      },
      _count: { _all: true },
    }),
  ])

  const inStockMap = new Map(inStockCounts.map((c) => [c.productId, c._count._all]))

  // Movement counts are by stockItemId; need to map back to productId
  const stockItems = await prisma.stockItem.findMany({
    where: { tenantId, productId: { in: productIds } },
    select: { id: true, productId: true },
  })
  const itemToProduct = new Map(stockItems.map((s) => [s.id, s.productId]))

  const transferByProduct = new Map<string, number>()
  for (const c of transferCounts) {
    const pid = itemToProduct.get(c.stockItemId)
    if (pid) transferByProduct.set(pid, (transferByProduct.get(pid) ?? 0) + c._count._all)
  }
  const usedByProduct = new Map<string, number>()
  for (const c of usedCounts) {
    const pid = itemToProduct.get(c.stockItemId)
    if (pid) usedByProduct.set(pid, (usedByProduct.get(pid) ?? 0) + c._count._all)
  }

  return products.map((p) => {
    const inStock = inStockMap.get(p.id) ?? 0
    return {
      productId: p.id,
      productCode: p.productCode,
      productName: p.name,
      categoryId: p.category.id,
      categoryName: p.category.name,
      defaultUnit: p.defaultUnit,
      reservedThreshold: p.reservedThreshold,
      inStockCount: inStock,
      transferCount: transferByProduct.get(p.id) ?? 0,
      usedCount: usedByProduct.get(p.id) ?? 0,
      lowStock: inStock < p.reservedThreshold,
    }
  })
}

export async function getStats(tenantId: string) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const [totalProducts, totalInStock, totalOut, lowStockProducts, movementsByType] = await Promise.all([
    prisma.product.count({ where: { tenantId } }),
    prisma.stockItem.count({ where: { tenantId, status: 'IN_STOCK' } }),
    prisma.stockItem.count({ where: { tenantId, status: 'OUT_OF_STOCK' } }),
    getSummary(tenantId).then((s) => s.filter((p) => p.lowStock).length),
    prisma.stockMovement.groupBy({
      by: ['type'],
      where: { stockItem: { tenantId }, scannedAt: { gte: since } },
      _count: { _all: true },
    }),
  ])

  const moveMap = new Map(movementsByType.map((m) => [m.type, m._count._all]))

  return {
    totalProducts,
    totalInStock,
    totalOut,
    lowStockProducts,
    transfers30d: moveMap.get('TRANSFER' as MovementType) ?? 0,
    used30d: moveMap.get('USED' as MovementType) ?? 0,
    in30d: moveMap.get('IN' as MovementType) ?? 0,
  }
}
