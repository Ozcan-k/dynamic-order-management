import { prisma } from '../lib/prisma'
import { SALES_STORES } from '@dom/shared'

// Managed store list (v2.92.0). Before this the names lived only in the shared
// SALES_STORES constant; the table is seeded from it once per tenant (insert-only,
// never overwrites or deletes), so an empty table behaves exactly like the old list.
// Sales / return rows keep the store name as plain text — this table is the picker
// source and the write-time validation list, not a foreign key.

const seeded = new Set<string>()

export async function ensureStores(tenantId: string): Promise<void> {
  if (seeded.has(tenantId)) return
  const existing = await prisma.store.count({ where: { tenantId } })
  if (existing === 0) {
    await prisma.store.createMany({
      data: SALES_STORES.map((name, i) => ({ tenantId, name, sortOrder: i })),
      skipDuplicates: true,
    })
  }
  seeded.add(tenantId)
}

export interface StoreRow {
  id: string
  name: string
  isActive: boolean
  sortOrder: number
}

export async function listStores(tenantId: string, opts: { includeArchived?: boolean } = {}): Promise<StoreRow[]> {
  await ensureStores(tenantId)
  return prisma.store.findMany({
    where: { tenantId, ...(opts.includeArchived ? {} : { isActive: true }) },
    select: { id: true, name: true, isActive: true, sortOrder: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
}

export async function activeStoreNames(tenantId: string): Promise<string[]> {
  return (await listStores(tenantId)).map((s) => s.name)
}

export class UnknownStoreError extends Error {
  statusCode = 400
  constructor(name: string) {
    super(`Unknown store "${name}"`)
  }
}

// Write-time check for sales activity / direct orders. Archived stores stay valid so
// an existing record that uses one can still be edited; pickers only offer active ones.
export async function assertKnownStore(tenantId: string, name: string): Promise<void> {
  await ensureStores(tenantId)
  const hit = await prisma.store.findUnique({ where: { tenantId_name: { tenantId, name } }, select: { id: true } })
  if (!hit) throw new UnknownStoreError(name)
}

// ─── Management (Settings → Stores, ADMIN) ────────────────────────────────────
// Store names are copied as plain text onto three operational tables. A rename
// rewrites all of them in one transaction; archive only hides the store from new
// entries; a hard delete is allowed only while no record uses the name.
// `acc_sales` / `acc_stores` belong to Accounting's own store list and are untouched.

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
type Db = typeof prisma | Tx

export class StoreConflictError extends Error {
  statusCode = 409
}

export interface StoreUsage {
  activity: number
  directOrders: number
  returns: number
  total: number
  lastUsed: string | null
}

export interface Actor {
  userId: string
  username: string | null
}

export function cleanStoreName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

async function usageOf(db: Db, tenantId: string, name: string): Promise<StoreUsage> {
  const [a, d, r] = await Promise.all([
    db.salesDailyActivity.aggregate({ where: { tenantId, storeName: name }, _count: true, _max: { reportDate: true } }),
    db.salesDirectOrder.aggregate({ where: { tenantId, storeName: name }, _count: true, _max: { orderDate: true } }),
    db.returnCancelParcel.aggregate({ where: { tenantId, storeName: name }, _count: true, _max: { createdAt: true } }),
  ])
  const dates = [a._max.reportDate, d._max.orderDate, r._max.createdAt].filter((x): x is Date => !!x)
  const last = dates.length ? new Date(Math.max(...dates.map((x) => x.getTime()))) : null
  return {
    activity: a._count,
    directOrders: d._count,
    returns: r._count,
    total: a._count + d._count + r._count,
    lastUsed: last ? last.toISOString() : null,
  }
}

async function audit(db: Db, tenantId: string, actor: Actor, entry: {
  storeId: string | null
  action: 'CREATE' | 'RENAME' | 'ARCHIVE' | 'RESTORE' | 'DELETE'
  fromName?: string | null
  toName?: string | null
  details?: Record<string, number>
}) {
  await db.storeAudit.create({
    data: {
      tenantId,
      storeId: entry.storeId,
      action: entry.action,
      fromName: entry.fromName ?? null,
      toName: entry.toName ?? null,
      details: entry.details,
      userId: actor.userId,
      username: actor.username,
    },
  })
}

export async function listStoresForAdmin(tenantId: string) {
  const stores = await listStores(tenantId, { includeArchived: true })
  const [a, d, r] = await Promise.all([
    prisma.salesDailyActivity.groupBy({ by: ['storeName'], where: { tenantId }, _count: { _all: true }, _max: { reportDate: true } }),
    prisma.salesDirectOrder.groupBy({ by: ['storeName'], where: { tenantId }, _count: { _all: true }, _max: { orderDate: true } }),
    prisma.returnCancelParcel.groupBy({ by: ['storeName'], where: { tenantId }, _count: { _all: true }, _max: { createdAt: true } }),
  ])
  const usage = new Map<string, StoreUsage>()
  const bump = (name: string, key: 'activity' | 'directOrders' | 'returns', n: number, at: Date | null) => {
    const u = usage.get(name) ?? { activity: 0, directOrders: 0, returns: 0, total: 0, lastUsed: null }
    u[key] += n
    u.total += n
    if (at && (!u.lastUsed || at.toISOString() > u.lastUsed)) u.lastUsed = at.toISOString()
    usage.set(name, u)
  }
  a.forEach((g) => bump(g.storeName, 'activity', g._count._all, g._max.reportDate))
  d.forEach((g) => bump(g.storeName, 'directOrders', g._count._all, g._max.orderDate))
  r.forEach((g) => bump(g.storeName, 'returns', g._count._all, g._max.createdAt))

  const empty: StoreUsage = { activity: 0, directOrders: 0, returns: 0, total: 0, lastUsed: null }
  const known = new Set(stores.map((s) => s.name))
  // Names on records that are not in the list (Return/Cancel accepts free text) —
  // shown read-only so nothing is hidden.
  const unlisted = [...usage.entries()]
    .filter(([name]) => !known.has(name))
    .map(([name, u]) => ({ name, usage: u }))
    .sort((x, y) => y.usage.total - x.usage.total)

  const history = await prisma.storeAudit.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { id: true, action: true, fromName: true, toName: true, details: true, username: true, createdAt: true },
  })

  return {
    stores: stores.map((s) => ({ ...s, usage: usage.get(s.name) ?? empty })),
    unlisted,
    history,
  }
}

async function findNameClash(db: Db, tenantId: string, name: string, exceptId?: string) {
  const rows = await db.store.findMany({
    where: { tenantId, name: { equals: name, mode: 'insensitive' } },
    select: { id: true, name: true, isActive: true },
  })
  return rows.find((r) => r.id !== exceptId) ?? null
}

export async function createStore(tenantId: string, rawName: string, actor: Actor) {
  const name = cleanStoreName(rawName)
  await ensureStores(tenantId)
  return prisma.$transaction(async (tx) => {
    const clash = await findNameClash(tx, tenantId, name)
    if (clash) {
      throw new StoreConflictError(clash.isActive
        ? `A store named "${clash.name}" already exists`
        : `"${clash.name}" already exists as an archived store — restore it instead`)
    }
    const max = await tx.store.aggregate({ where: { tenantId }, _max: { sortOrder: true } })
    const store = await tx.store.create({
      data: { tenantId, name, sortOrder: (max._max.sortOrder ?? -1) + 1 },
      select: { id: true, name: true, isActive: true, sortOrder: true },
    })
    await audit(tx, tenantId, actor, { storeId: store.id, action: 'CREATE', toName: name })
    return store
  })
}

class StoreNotFoundError extends Error {
  statusCode = 404
  constructor() {
    super('Store not found')
  }
}

async function getStoreOr404(db: Db, tenantId: string, id: string) {
  const store = await db.store.findFirst({ where: { id, tenantId } })
  if (!store) throw new StoreNotFoundError()
  return store
}

export interface RenamePreview {
  from: string
  to: string
  usage: StoreUsage
  blocked: string | null
}

async function renameCheck(db: Db, tenantId: string, id: string, rawName: string): Promise<RenamePreview> {
  const store = await getStoreOr404(db, tenantId, id)
  const to = cleanStoreName(rawName)
  const usage = await usageOf(db, tenantId, store.name)
  let blocked: string | null = null
  if (to === store.name) {
    blocked = 'The new name is the same as the current name'
  } else {
    const clash = await findNameClash(db, tenantId, to, store.id)
    if (clash) {
      blocked = `A store named "${clash.name}" already exists${clash.isActive ? '' : ' (archived)'} — renaming would merge two stores`
    } else {
      // Records may still carry the target name from before the list existed
      const onRecords = await usageOf(db, tenantId, to)
      if (onRecords.total > 0) blocked = `${onRecords.total} existing record(s) already use "${to}" — renaming would merge them`
    }
  }
  return { from: store.name, to, usage, blocked }
}

export function previewRename(tenantId: string, id: string, rawName: string): Promise<RenamePreview> {
  return renameCheck(prisma, tenantId, id, rawName)
}

export async function renameStore(tenantId: string, id: string, rawName: string, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    const check = await renameCheck(tx, tenantId, id, rawName)
    if (check.blocked) throw new StoreConflictError(check.blocked)
    const { from, to } = check
    const activity = await tx.salesDailyActivity.updateMany({ where: { tenantId, storeName: from }, data: { storeName: to } })
    const directOrders = await tx.salesDirectOrder.updateMany({ where: { tenantId, storeName: from }, data: { storeName: to } })
    const returns = await tx.returnCancelParcel.updateMany({ where: { tenantId, storeName: from }, data: { storeName: to } })
    await tx.store.update({ where: { id }, data: { name: to } })
    const details = { activity: activity.count, directOrders: directOrders.count, returns: returns.count }
    await audit(tx, tenantId, actor, { storeId: id, action: 'RENAME', fromName: from, toName: to, details })
    return { from, to, updated: details }
  }, { timeout: 60_000 })
}

export async function setStoreActive(tenantId: string, id: string, active: boolean, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    const store = await getStoreOr404(tx, tenantId, id)
    if (store.isActive === active) return store
    if (!active) {
      const remaining = await tx.store.count({ where: { tenantId, isActive: true } })
      if (remaining <= 1) throw new StoreConflictError('At least one store must stay active')
    }
    const updated = await tx.store.update({ where: { id }, data: { isActive: active } })
    await audit(tx, tenantId, actor, { storeId: id, action: active ? 'RESTORE' : 'ARCHIVE', fromName: store.name })
    return updated
  })
}

export async function deleteStore(tenantId: string, id: string, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    const store = await getStoreOr404(tx, tenantId, id)
    const usage = await usageOf(tx, tenantId, store.name)
    if (usage.total > 0) {
      throw new StoreConflictError(`"${store.name}" is used by ${usage.total} record(s) — archive it instead`)
    }
    if (store.isActive) {
      const remaining = await tx.store.count({ where: { tenantId, isActive: true } })
      if (remaining <= 1) throw new StoreConflictError('At least one store must stay active')
    }
    await tx.store.delete({ where: { id } })
    await audit(tx, tenantId, actor, { storeId: id, action: 'DELETE', fromName: store.name })
  })
}
