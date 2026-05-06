import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'

export interface WarehouseInput {
  name: string
  address: string
}

function validate(input: Partial<WarehouseInput>) {
  if (input.name !== undefined && !input.name.trim()) throw new Error('Warehouse name is required')
  if (input.address !== undefined && !input.address.trim()) throw new Error('Warehouse address is required')
}

export async function listWarehouses(tenantId: string) {
  const warehouses = await prisma.warehouse.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
  })

  if (warehouses.length === 0) return []

  const counts = await prisma.stockItem.groupBy({
    by: ['warehouseId'],
    where: { tenantId, status: 'IN_STOCK' },
    _count: { _all: true },
  })
  const countMap = new Map(counts.map((c) => [c.warehouseId, c._count._all]))

  return warehouses.map((w) => ({ ...w, itemsCount: countMap.get(w.id) ?? 0 }))
}

export async function createWarehouse(tenantId: string, input: WarehouseInput) {
  validate(input)
  try {
    return await prisma.warehouse.create({
      data: {
        tenantId,
        name: input.name.trim(),
        address: input.address.trim(),
      },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new Error('A warehouse with this name already exists')
    }
    throw err
  }
}

export async function updateWarehouse(
  tenantId: string,
  id: string,
  input: Partial<WarehouseInput>,
) {
  validate(input)
  const existing = await prisma.warehouse.findFirst({
    where: { id, tenantId },
    select: { id: true },
  })
  if (!existing) throw new Error('Warehouse not found')

  try {
    return await prisma.warehouse.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.address !== undefined ? { address: input.address.trim() } : {}),
      },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new Error('A warehouse with this name already exists')
    }
    throw err
  }
}

export async function deleteWarehouse(tenantId: string, id: string) {
  const existing = await prisma.warehouse.findFirst({
    where: { id, tenantId },
    select: { id: true },
  })
  if (!existing) throw new Error('Warehouse not found')
  try {
    await prisma.warehouse.delete({ where: { id: existing.id } })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      throw new Error('Cannot delete warehouse — it has stock items associated with it')
    }
    throw err
  }
  return { id: existing.id }
}
