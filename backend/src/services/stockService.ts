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

export type ScanOperation = 'IN' | 'OUT' | 'TRANSFER'

export interface ScanInput {
  id: string
  operation: ScanOperation
  warehouseId: string
  toWarehouseId?: string
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
  noChange?: boolean
}

// ─── Thermal label roll layout (60 × 40 mm, 1 label / page) ──────────────────
const PT_PER_MM = 2.83465
const LABEL_W_PT = 60 * PT_PER_MM
const LABEL_H_PT = 40 * PT_PER_MM
const PADDING_PT = 2 * PT_PER_MM
const QR_SIZE_PT = 36 * PT_PER_MM

interface LabelItem {
  id: string
  productName: string
  productCode: string
  warehouseName: string
  batchNumber: string
  unit: StockUnit
  quantity: number
}

// PDFKit 0.18.0's `lineBreak: false` is unreliable when combined with an
// explicit (x, y) position — the LineWrapper still kicks in and wraps long
// product/warehouse names onto the next row. We truncate manually here.
function fitText(doc: PDFKit.PDFDocument, text: string, maxWidth: number): string {
  if (doc.widthOfString(text) <= maxWidth) return text
  let s = text
  while (s.length > 0 && doc.widthOfString(s + '…') > maxWidth) {
    s = s.slice(0, -1).trimEnd()
  }
  return s + '…'
}

async function buildStickerPdf(items: LabelItem[]): Promise<Buffer> {
  const pageOpts = { size: [LABEL_W_PT, LABEL_H_PT] as [number, number], margin: 0 }
  const doc = new PDFDocument(pageOpts)
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))

  const qrPngs = await Promise.all(
    items.map((it) => QRCode.toBuffer(
      it.id,
      { type: 'png', width: 600, margin: 4, errorCorrectionLevel: 'M' },
    )),
  )

  const lineY = (mm: number) => mm * PT_PER_MM

  for (let i = 0; i < items.length; i++) {
    if (i > 0) doc.addPage(pageOpts)

    const qrX = PADDING_PT
    const qrY = (LABEL_H_PT - QR_SIZE_PT) / 2
    doc.image(qrPngs[i], qrX, qrY, { width: QR_SIZE_PT, height: QR_SIZE_PT })

    const textX = qrX + QR_SIZE_PT + PADDING_PT
    const textW = LABEL_W_PT - textX - PADDING_PT

    const it = items[i]
    const qtyText = it.unit === 'KG' ? `${it.quantity} kg` : `${it.quantity} pcs`

    doc.fontSize(9).font('Helvetica-Bold')
    doc.text(fitText(doc, it.productName, textW), textX, lineY(4))

    doc.fontSize(10).font('Helvetica-Bold')
    doc.text(fitText(doc, qtyText, textW), textX, lineY(11))

    doc.fontSize(6).font('Helvetica')
    doc.text(fitText(doc, it.warehouseName, textW), textX, lineY(20))
    doc.text(fitText(doc, `#${it.productCode}`, textW), textX, lineY(26))

    doc.fontSize(6).font('Courier')
    doc.text(fitText(doc, it.batchNumber, textW), textX, lineY(32))
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

  // Labels are created in PENDING status. A Stock Keeper must scan each QR
  // with the "Stock In" operation to flip it to IN_STOCK; until then the
  // label does not count towards inventory totals.
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
          status: 'PENDING',
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
  input: ScanInput,
): Promise<ScanResult> {
  if (!input.id) throw new Error('Invalid QR payload — missing id')
  if (!input.warehouseId) throw new Error('Warehouse must be selected before scanning')

  const scanWarehouse = await prisma.warehouse.findFirst({
    where: { id: input.warehouseId, tenantId },
    select: { id: true, name: true },
  })
  if (!scanWarehouse) throw new Error('Selected warehouse not found')

  const existing = await prisma.stockItem.findFirst({
    where: { id: input.id, tenantId },
    include: {
      product: { select: { id: true, name: true, productCode: true } },
      warehouse: { select: { id: true, name: true } },
    },
  })
  if (!existing) throw new Error('Unknown label — no stock record found for this QR code')

  const includeBlock = {
    product: { select: { id: true, name: true, productCode: true } },
    warehouse: { select: { id: true, name: true } },
  }

  // ─── Stock In ─────────────────────────────────────────────────────────────
  if (input.operation === 'IN') {
    if (existing.status === 'IN_STOCK') {
      if (existing.warehouseId === scanWarehouse.id) {
        // Re-scan of an already-stocked label at the same warehouse — no-op.
        return {
          item: shapeItem(existing),
          type: 'IN',
          toWarehouse: scanWarehouse.name,
          message: `Already stocked at ${scanWarehouse.name} — no change`,
          noChange: true,
        }
      }
      throw new Error(
        `Item is at ${existing.warehouse.name}. Use Transfer to move it to ${scanWarehouse.name}.`,
      )
    }
    const [updated] = await prisma.$transaction([
      prisma.stockItem.update({
        where: { id: existing.id },
        data: { status: 'IN_STOCK', warehouseId: scanWarehouse.id },
        include: includeBlock,
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

  // ─── Stock Out ────────────────────────────────────────────────────────────
  if (input.operation === 'OUT') {
    if (existing.status === 'OUT_OF_STOCK') {
      return {
        item: shapeItem(existing),
        type: 'USED',
        fromWarehouse: existing.warehouse.name,
        message: 'Already used / out — no change',
        noChange: true,
      }
    }
    if (existing.status === 'PENDING') {
      throw new Error('This label has not been stocked in yet. Use Stock In first.')
    }
    const [updated] = await prisma.$transaction([
      prisma.stockItem.update({
        where: { id: existing.id },
        data: { status: 'OUT_OF_STOCK' },
        include: includeBlock,
      }),
      prisma.stockMovement.create({
        data: {
          stockItemId: existing.id,
          type: 'USED',
          fromWarehouseId: existing.warehouseId,
          scannedById,
        },
      }),
    ])
    return {
      item: shapeItem(updated),
      type: 'USED',
      fromWarehouse: existing.warehouse.name,
      message: `Used / out — ${updated.product.name}`,
    }
  }

  // ─── Stock Transfer ──────────────────────────────────────────────────────
  if (input.operation === 'TRANSFER') {
    if (!input.toWarehouseId) throw new Error('Destination warehouse is required for transfer')
    if (existing.status !== 'IN_STOCK') {
      throw new Error('Only in-stock items can be transferred')
    }
    const target = await prisma.warehouse.findFirst({
      where: { id: input.toWarehouseId, tenantId },
      select: { id: true, name: true },
    })
    if (!target) throw new Error('Destination warehouse not found')
    if (existing.warehouseId === target.id) {
      return {
        item: shapeItem(existing),
        type: 'TRANSFER',
        fromWarehouse: existing.warehouse.name,
        toWarehouse: target.name,
        message: `Already at ${target.name} — no change`,
        noChange: true,
      }
    }
    const fromName = existing.warehouse.name
    const [updated] = await prisma.$transaction([
      prisma.stockItem.update({
        where: { id: existing.id },
        data: { warehouseId: target.id },
        include: includeBlock,
      }),
      prisma.stockMovement.create({
        data: {
          stockItemId: existing.id,
          type: 'TRANSFER',
          fromWarehouseId: existing.warehouseId,
          toWarehouseId: target.id,
          scannedById,
        },
      }),
    ])
    return {
      item: shapeItem(updated),
      type: 'TRANSFER',
      fromWarehouse: fromName,
      toWarehouse: target.name,
      message: `Transferred ${fromName} → ${target.name}`,
    }
  }

  throw new Error('Unknown scan operation')
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

export interface WarehouseBreakdown {
  warehouseId: string
  warehouseName: string
  boxes: number
  quantity: number
}

export interface StockSummaryRow {
  productId: string
  productCode: string
  productName: string
  categoryId: string
  categoryName: string
  defaultUnit: StockUnit
  reservedThreshold: number
  inStockQuantity: number
  boxCount: number
  byWarehouse: WarehouseBreakdown[]
  lowStock: boolean
}

export async function getSummary(tenantId: string): Promise<StockSummaryRow[]> {
  const products = await prisma.product.findMany({
    where: { tenantId },
    include: { category: { select: { id: true, name: true } } },
    orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
  })
  if (products.length === 0) return []

  const items = await prisma.stockItem.findMany({
    where: { tenantId, status: 'IN_STOCK' },
    select: {
      productId: true,
      warehouseId: true,
      quantity: true,
      warehouse: { select: { name: true } },
    },
  })

  type Bucket = {
    quantity: number
    boxes: number
    byWh: Map<string, WarehouseBreakdown>
  }
  const byProduct = new Map<string, Bucket>()
  for (const it of items) {
    let bucket = byProduct.get(it.productId)
    if (!bucket) {
      bucket = { quantity: 0, boxes: 0, byWh: new Map() }
      byProduct.set(it.productId, bucket)
    }
    bucket.quantity += it.quantity
    bucket.boxes += 1
    const whBucket = bucket.byWh.get(it.warehouseId)
    if (whBucket) {
      whBucket.boxes += 1
      whBucket.quantity += it.quantity
    } else {
      bucket.byWh.set(it.warehouseId, {
        warehouseId: it.warehouseId,
        warehouseName: it.warehouse.name,
        boxes: 1,
        quantity: it.quantity,
      })
    }
  }

  return products.map((p) => {
    const bucket = byProduct.get(p.id)
    const inStockQuantity = bucket?.quantity ?? 0
    const boxCount = bucket?.boxes ?? 0
    const byWarehouse = bucket
      ? Array.from(bucket.byWh.values()).sort((a, b) => a.warehouseName.localeCompare(b.warehouseName))
      : []
    return {
      productId: p.id,
      productCode: p.productCode,
      productName: p.name,
      categoryId: p.category.id,
      categoryName: p.category.name,
      defaultUnit: p.defaultUnit,
      reservedThreshold: p.reservedThreshold,
      inStockQuantity,
      boxCount,
      byWarehouse,
      lowStock: inStockQuantity < p.reservedThreshold,
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
