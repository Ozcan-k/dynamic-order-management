import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { SaleChannel, SALES_STORES } from '@dom/shared'

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
const StoreName = z.enum(SALES_STORES as readonly [string, ...string[]])

export const DirectOrderItemInput = z.object({
  productName: z.string().trim().min(1).max(120),
  price: z.number().min(0),
  quantity: z.number().int().min(1),
})

export const CreateDirectOrderSchema = z.object({
  date: DateString,
  store: StoreName,
  saleChannel: z.nativeEnum(SaleChannel),
  companyName: z.string().trim().min(1).max(120),
  customerName: z.string().trim().min(1).max(120),
  deliveryCost: z.number().min(0).default(0),
  items: z.array(DirectOrderItemInput).min(1, 'At least one item required'),
})

// Full-replace update (same shape as create — simplest semantics for a small form)
export const UpdateDirectOrderSchema = CreateDirectOrderSchema

export const ListDirectOrderQuerySchema = z.object({
  date: DateString.optional(),
  from: DateString.optional(),
  to: DateString.optional(),
  store: StoreName.optional(),
  channel: z.nativeEnum(SaleChannel).optional(),
})

export const SuggestQuerySchema = z.object({
  q: z.string().trim().min(1).max(60),
})

export type CreateDirectOrderInput = z.infer<typeof CreateDirectOrderSchema>
export type ListDirectOrderQuery = z.infer<typeof ListDirectOrderQuerySchema>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`)
}

/** Items total — server-side computed so the client can't lie about totalAmount. */
function itemsTotal(items: { price: number; quantity: number }[], deliveryCost: number): number {
  const sub = items.reduce((acc, it) => acc + it.price * it.quantity, 0)
  return Math.round((sub + deliveryCost) * 100) / 100
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function createDirectOrder(tenantId: string, agentId: string, input: CreateDirectOrderInput) {
  const orderDate = toDateOnly(input.date)
  const totalAmount = itemsTotal(input.items, input.deliveryCost)

  const created = await prisma.salesDirectOrder.create({
    data: {
      tenantId,
      agentId,
      orderDate,
      storeName: input.store,
      saleChannel: input.saleChannel,
      companyName: input.companyName,
      customerName: input.customerName,
      deliveryCost: new Prisma.Decimal(input.deliveryCost),
      totalAmount: new Prisma.Decimal(totalAmount),
      items: {
        create: input.items.map((it) => ({
          productName: it.productName,
          price: new Prisma.Decimal(it.price),
          quantity: it.quantity,
        })),
      },
    },
    include: { items: true },
  })

  return serializeOrder(created)
}

/**
 * Fetch a single order by id. If `agentId` is provided, it must match — used
 * for agent-scoped access. Pass `null` for admin access (tenant-scoped only).
 */
export async function getDirectOrderById(id: string, tenantId: string, agentId: string | null) {
  const where: Prisma.SalesDirectOrderWhereInput = { id, tenantId }
  if (agentId) where.agentId = agentId
  const order = await prisma.salesDirectOrder.findFirst({ where, include: { items: true } })
  return order ? serializeOrder(order) : null
}

/**
 * Full-replace update: deletes existing items and recreates from the input,
 * all in one transaction. Ownership scope mirrors getDirectOrderById.
 * Returns the serialized updated order, or null if not found / not owned.
 */
export async function updateDirectOrder(
  id: string,
  tenantId: string,
  agentId: string | null,
  input: CreateDirectOrderInput,
) {
  const where: Prisma.SalesDirectOrderWhereInput = { id, tenantId }
  if (agentId) where.agentId = agentId

  const existing = await prisma.salesDirectOrder.findFirst({ where, select: { id: true } })
  if (!existing) return null

  const orderDate = toDateOnly(input.date)
  const totalAmount = itemsTotal(input.items, input.deliveryCost)

  const updated = await prisma.$transaction(async (tx) => {
    await tx.salesDirectOrderItem.deleteMany({ where: { directOrderId: id } })
    return tx.salesDirectOrder.update({
      where: { id },
      data: {
        orderDate,
        storeName: input.store,
        saleChannel: input.saleChannel,
        companyName: input.companyName,
        customerName: input.customerName,
        deliveryCost: new Prisma.Decimal(input.deliveryCost),
        totalAmount: new Prisma.Decimal(totalAmount),
        items: {
          create: input.items.map((it) => ({
            productName: it.productName,
            price: new Prisma.Decimal(it.price),
            quantity: it.quantity,
          })),
        },
      },
      include: { items: true },
    })
  })

  return serializeOrder(updated)
}

/**
 * Deletes an order (items cascade). Returns true if deleted, false if not
 * found / not owned.
 */
export async function deleteDirectOrder(id: string, tenantId: string, agentId: string | null): Promise<boolean> {
  const where: Prisma.SalesDirectOrderWhereInput = { id, tenantId }
  if (agentId) where.agentId = agentId

  const existing = await prisma.salesDirectOrder.findFirst({ where, select: { id: true } })
  if (!existing) return false
  await prisma.salesDirectOrder.delete({ where: { id } })
  return true
}

export async function listOwnDirectOrders(tenantId: string, agentId: string, query: ListDirectOrderQuery) {
  const where: Prisma.SalesDirectOrderWhereInput = { tenantId, agentId }

  if (query.date) {
    where.orderDate = toDateOnly(query.date)
  } else if (query.from || query.to) {
    where.orderDate = {}
    if (query.from) (where.orderDate as { gte?: Date; lte?: Date }).gte = toDateOnly(query.from)
    if (query.to) (where.orderDate as { gte?: Date; lte?: Date }).lte = toDateOnly(query.to)
  }
  if (query.store) where.storeName = query.store
  if (query.channel) where.saleChannel = query.channel

  const orders = await prisma.salesDirectOrder.findMany({
    where,
    include: { items: true },
    orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  })

  return orders.map(serializeOrder)
}

/**
 * Suggest distinct values from this agent's own past entries. Falls back to
 * tenant-wide history if the agent has none yet (so first-day agents still
 * get useful suggestions). Case-insensitive prefix match, max 8 results.
 */
export async function suggestCompanies(tenantId: string, agentId: string, q: string): Promise<string[]> {
  return suggestField(tenantId, agentId, 'companyName', q)
}

export async function suggestCustomers(tenantId: string, agentId: string, q: string): Promise<string[]> {
  return suggestField(tenantId, agentId, 'customerName', q)
}

export async function suggestProducts(tenantId: string, agentId: string, q: string): Promise<string[]> {
  // Products live on items — needs join filter on the parent order
  const own = await prisma.salesDirectOrderItem.findMany({
    where: {
      productName: { startsWith: q, mode: 'insensitive' },
      directOrder: { tenantId, agentId },
    },
    select: { productName: true },
    distinct: ['productName'],
    take: 8,
    orderBy: { productName: 'asc' },
  })
  if (own.length > 0) return own.map((r) => r.productName)

  const tenant = await prisma.salesDirectOrderItem.findMany({
    where: {
      productName: { startsWith: q, mode: 'insensitive' },
      directOrder: { tenantId },
    },
    select: { productName: true },
    distinct: ['productName'],
    take: 8,
    orderBy: { productName: 'asc' },
  })
  return tenant.map((r) => r.productName)
}

async function suggestField(
  tenantId: string,
  agentId: string,
  field: 'companyName' | 'customerName',
  q: string,
): Promise<string[]> {
  const own = await prisma.salesDirectOrder.findMany({
    where: { tenantId, agentId, [field]: { startsWith: q, mode: 'insensitive' } },
    select: { [field]: true },
    distinct: [field],
    take: 8,
    orderBy: { [field]: 'asc' },
  })
  if (own.length > 0) return own.map((r) => (r as unknown as Record<string, string>)[field])

  const tenant = await prisma.salesDirectOrder.findMany({
    where: { tenantId, [field]: { startsWith: q, mode: 'insensitive' } },
    select: { [field]: true },
    distinct: [field],
    take: 8,
    orderBy: { [field]: 'asc' },
  })
  return tenant.map((r) => (r as unknown as Record<string, string>)[field])
}

// ─── Serialization ────────────────────────────────────────────────────────────

type OrderWithItems = Prisma.SalesDirectOrderGetPayload<{ include: { items: true } }>

function serializeOrder(o: OrderWithItems) {
  return {
    id: o.id,
    date: o.orderDate.toISOString().slice(0, 10),
    store: o.storeName,
    saleChannel: o.saleChannel,
    companyName: o.companyName,
    customerName: o.customerName,
    deliveryCost: Number(o.deliveryCost),
    totalAmount: Number(o.totalAmount),
    createdAt: o.createdAt.toISOString(),
    items: o.items.map((it) => ({
      id: it.id,
      productName: it.productName,
      price: Number(it.price),
      quantity: it.quantity,
    })),
  }
}

export type SerializedDirectOrder = ReturnType<typeof serializeOrder>
