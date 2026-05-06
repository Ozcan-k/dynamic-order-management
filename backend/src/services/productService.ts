import { Prisma, StockUnit } from '@prisma/client'
import { prisma } from '../lib/prisma'

export interface ProductInput {
  categoryId: string
  productCode: string
  name: string
  defaultUnit: StockUnit
  reservedThreshold: number
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
  const productCode = input.productCode?.trim()
  const name = input.name?.trim()
  const reserved = input.reservedThreshold

  if (input.categoryId !== undefined && !input.categoryId) throw new Error('Category is required')
  if (productCode !== undefined && !productCode) throw new Error('Product ID is required')
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
    select: { id: true },
  })
  if (!category) throw new Error('Category not found')

  try {
    return await prisma.product.create({
      data: {
        tenantId,
        categoryId: input.categoryId,
        productCode: input.productCode.trim(),
        name: input.name.trim(),
        defaultUnit: input.defaultUnit,
        reservedThreshold: input.reservedThreshold,
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

export async function deleteProduct(tenantId: string, id: string) {
  const existing = await prisma.product.findFirst({
    where: { id, tenantId },
    select: { id: true },
  })
  if (!existing) throw new Error('Product not found')
  try {
    await prisma.product.delete({ where: { id: existing.id } })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      throw new Error('Cannot delete product — it has stock items associated with it')
    }
    throw err
  }
  return { id: existing.id }
}
