import { Prisma, StockUnit } from '@prisma/client'
import { prisma } from '../lib/prisma'

export interface ProductInput {
  categoryId: string
  productCode?: string
  name: string
  defaultUnit: StockUnit
  reservedThreshold: number
}

// ─── Product code auto-generation ──────────────────────────────────────────
// Format: {CAT3}-{NNN} where CAT3 is up to 3 ASCII-alpha chars from the
// category name (uppercase) and NNN is the zero-padded next sequence number
// for that prefix within the tenant. e.g. Nuts → NUT-001, NUT-002.

function categoryPrefix(name: string): string {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, '')
  const slice = letters.slice(0, 3)
  return slice.length >= 2 ? slice.padEnd(3, 'X') : 'PRD'
}

async function nextProductCode(tenantId: string, categoryName: string): Promise<string> {
  const prefix = categoryPrefix(categoryName)
  const existing = await prisma.product.findMany({
    where: { tenantId, productCode: { startsWith: `${prefix}-` } },
    select: { productCode: true },
  })
  const maxSeq = existing.reduce((max, row) => {
    const m = row.productCode.match(/^[A-Z]{3}-(\d+)$/)
    if (!m) return max
    const n = parseInt(m[1], 10)
    return n > max ? n : max
  }, 0)
  const next = (maxSeq + 1).toString().padStart(3, '0')
  return `${prefix}-${next}`
}

export interface CategoryInput {
  name: string
}

// ─── Categories ────────────────────────────────────────────────────────────

export async function listCategories(tenantId: string) {
  return prisma.productCategory.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
  })
}

export async function createCategory(tenantId: string, input: CategoryInput) {
  const name = input.name.trim()
  if (!name) throw new Error('Category name is required')
  try {
    return await prisma.productCategory.create({ data: { tenantId, name } })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new Error('Category with this name already exists')
    }
    throw err
  }
}

export async function deleteCategory(tenantId: string, id: string) {
  const existing = await prisma.productCategory.findFirst({
    where: { id, tenantId },
    select: { id: true },
  })
  if (!existing) throw new Error('Category not found')
  try {
    await prisma.productCategory.delete({ where: { id: existing.id } })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      throw new Error('Cannot delete category — it is referenced by one or more products')
    }
    throw err
  }
  return { id: existing.id }
}

// ─── Products ──────────────────────────────────────────────────────────────

export async function listProducts(tenantId: string, filters?: { categoryId?: string }) {
  return prisma.product.findMany({
    where: {
      tenantId,
      ...(filters?.categoryId ? { categoryId: filters.categoryId } : {}),
    },
    include: { category: { select: { id: true, name: true } } },
    orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
  })
}

export async function getProduct(tenantId: string, id: string) {
  return prisma.product.findFirst({
    where: { id, tenantId },
    include: { category: { select: { id: true, name: true } } },
  })
}

function validateProductInput(input: Partial<ProductInput>) {
  const name = input.name?.trim()
  const reserved = input.reservedThreshold

  if (input.categoryId !== undefined && !input.categoryId) throw new Error('Category is required')
  if (name !== undefined && !name) throw new Error('Product name is required')
  if (reserved !== undefined && (reserved < 0 || !Number.isFinite(reserved))) {
    throw new Error('Reserved must be a non-negative number')
  }
  if (input.defaultUnit !== undefined && input.defaultUnit !== 'KG' && input.defaultUnit !== 'PCS') {
    throw new Error('Unit must be KG or PCS')
  }
}

export async function createProduct(tenantId: string, input: ProductInput) {
  validateProductInput(input)

  const category = await prisma.productCategory.findFirst({
    where: { id: input.categoryId, tenantId },
    select: { id: true, name: true },
  })
  if (!category) throw new Error('Category not found')

  // Retry loop guards against race conditions when two creates collide on the
  // same auto-generated productCode (P2002 unique violation on tenantId+code).
  const MAX_RETRIES = 5
  let lastErr: unknown = null
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const productCode = input.productCode?.trim() || await nextProductCode(tenantId, category.name)
    try {
      return await prisma.product.create({
        data: {
          tenantId,
          categoryId: input.categoryId,
          productCode,
          name: input.name.trim(),
          defaultUnit: input.defaultUnit,
          reservedThreshold: input.reservedThreshold,
        },
        include: { category: { select: { id: true, name: true } } },
      })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // If the user provided a code explicitly, surface the collision.
        if (input.productCode?.trim()) {
          throw new Error('A product with this Product ID already exists')
        }
        lastErr = err
        continue // try a fresh sequence
      }
      throw err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Could not generate a unique Product ID — please retry')
}

export async function updateProduct(
  tenantId: string,
  id: string,
  input: Partial<ProductInput>,
) {
  validateProductInput(input)

  const existing = await prisma.product.findFirst({
    where: { id, tenantId },
    select: { id: true },
  })
  if (!existing) throw new Error('Product not found')

  if (input.categoryId) {
    const category = await prisma.productCategory.findFirst({
      where: { id: input.categoryId, tenantId },
      select: { id: true },
    })
    if (!category) throw new Error('Category not found')
  }

  try {
    return await prisma.product.update({
      where: { id: existing.id },
      data: {
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.productCode !== undefined ? { productCode: input.productCode.trim() } : {}),
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.defaultUnit !== undefined ? { defaultUnit: input.defaultUnit } : {}),
        ...(input.reservedThreshold !== undefined ? { reservedThreshold: input.reservedThreshold } : {}),
      },
      include: { category: { select: { id: true, name: true } } },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new Error('A product with this Product ID already exists')
    }
    throw err
  }
}

// Delete is blocked whenever the product still has IN_STOCK boxes (the
// operator must Stock Out / Adjust those first). PENDING labels and historical
// OUT_OF_STOCK rows do NOT block deletion — they're swept inside the same
// transaction so the FK Restrict on StockItem.product doesn't trip. Movement
// rows cascade via StockMovement.stockItem onDelete: Cascade.
export async function deleteProduct(tenantId: string, id: string) {
  const existing = await prisma.product.findFirst({
    where: { id, tenantId },
    select: { id: true },
  })
  if (!existing) throw new Error('Product not found')

  const inStockCount = await prisma.stockItem.count({
    where: { tenantId, productId: existing.id, status: 'IN_STOCK' },
  })
  if (inStockCount > 0) {
    throw new Error(
      `Cannot delete — ${inStockCount} box(es) still in stock. Stock Out or Remove them first.`,
    )
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.stockItem.deleteMany({ where: { tenantId, productId: existing.id } })
      await tx.product.delete({ where: { id: existing.id } })
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      throw new Error('Cannot delete product — it is still referenced elsewhere')
    }
    throw err
  }
  return { id: existing.id }
}
