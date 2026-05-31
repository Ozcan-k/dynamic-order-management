import { Prisma } from '@prisma/client'
import { ReturnCancelType, Platform, Carrier } from '@dom/shared'
import { prisma } from '../lib/prisma'

const RETENTION_DAYS = 180 // 6 months — stored then hard-deleted by the nightly job

const returnCancelSelect = {
  id: true,
  trackingNumber: true,
  type: true,
  storeName: true,
  platform: true,
  carrier: true,
  createdAt: true,
  createdBy: { select: { username: true } },
} satisfies Prisma.ReturnCancelParcelSelect

export interface CreateReturnCancelInput {
  tenantId: string
  createdById: string
  trackingNumber: string
  type: ReturnCancelType
  storeName: string
  platform: Platform
  carrier: Carrier
}

export async function createReturnCancel(input: CreateReturnCancelInput) {
  return prisma.returnCancelParcel.create({
    data: {
      tenantId: input.tenantId,
      createdById: input.createdById,
      trackingNumber: input.trackingNumber,
      type: input.type,
      storeName: input.storeName,
      platform: input.platform,
      carrier: input.carrier,
    },
    select: returnCancelSelect,
  })
}

export interface ListReturnCancelParams {
  page?: number
  pageSize?: number
  search?: string
  type?: ReturnCancelType
  from?: string // Manila-local YYYY-MM-DD
  to?: string   // Manila-local YYYY-MM-DD
}

export async function listReturnCancel(tenantId: string, params: ListReturnCancelParams) {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25))
  const skip = (page - 1) * pageSize

  // from/to are Manila-local YYYY-MM-DD; interpret as Manila midnight (UTC+8).
  const createdAtFilter: Prisma.DateTimeFilter = {
    ...(params.from ? { gte: new Date(params.from + 'T00:00:00+08:00') } : {}),
    ...(params.to ? { lte: new Date(params.to + 'T23:59:59+08:00') } : {}),
  }
  const hasDate = Boolean(params.from || params.to)

  // Base filter (date + search) — drives the summary cards regardless of the type toggle.
  const whereBase: Prisma.ReturnCancelParcelWhereInput = {
    tenantId,
    ...(hasDate ? { createdAt: createdAtFilter } : {}),
    ...(params.search ? { trackingNumber: { contains: params.search.trim().toUpperCase() } } : {}),
  }

  // Table filter adds the optional type toggle.
  const where: Prisma.ReturnCancelParcelWhereInput = {
    ...whereBase,
    ...(params.type ? { type: params.type } : {}),
  }

  const [rows, total, returns, cancels] = await Promise.all([
    prisma.returnCancelParcel.findMany({
      where,
      select: returnCancelSelect,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.returnCancelParcel.count({ where }),
    prisma.returnCancelParcel.count({ where: { ...whereBase, type: ReturnCancelType.RETURN } }),
    prisma.returnCancelParcel.count({ where: { ...whereBase, type: ReturnCancelType.CANCEL } }),
  ])

  return {
    rows,
    total,
    page,
    pageSize,
    stats: { total: returns + cancels, returns, cancels },
  }
}

export async function deleteReturnCancel(tenantId: string, id: string): Promise<{ id: string } | null> {
  const found = await prisma.returnCancelParcel.findFirst({ where: { id, tenantId }, select: { id: true } })
  if (!found) return null
  await prisma.returnCancelParcel.delete({ where: { id } })
  return { id }
}

function retentionCutoff(): Date {
  const d = new Date()
  d.setDate(d.getDate() - RETENTION_DAYS)
  return d
}

export async function hardDeleteExpiredReturnCancel(tenantId: string): Promise<{ deleted: number }> {
  const result = await prisma.returnCancelParcel.deleteMany({
    where: { tenantId, createdAt: { lte: retentionCutoff() } },
  })
  return { deleted: result.count }
}
