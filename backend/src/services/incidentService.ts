import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { Prisma, IncidentType, Platform } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { INCIDENTS_DIR, extFromMime, ensureUploadDirs } from '../lib/uploads'
import { requiresParcelContext, IncidentType as IncidentTypeEnum } from '@dom/shared'

export interface CreateIncidentInput {
  tenantId: string
  createdById: string
  incidentType: IncidentType
  incidentDate: Date
  employeeUserId: string
  employeeFullName: string
  employeeEmail: string
  recipientEmail: string
  reportedByUserId: string
  reportedByFullName: string
  reportedByRole: string
  adminDescription: string
  trackingNumber?: string
  platform?: Platform
  shopName?: string
  witnessName?: string
  witnessPosition?: string
}

export async function createIncident(input: CreateIncidentInput) {
  const data: Prisma.IncidentUncheckedCreateInput = {
    tenantId: input.tenantId,
    createdById: input.createdById,
    incidentType: input.incidentType,
    incidentDate: input.incidentDate,
    employeeUserId: input.employeeUserId,
    employeeFullName: input.employeeFullName,
    employeeEmail: input.employeeEmail,
    recipientEmail: input.recipientEmail,
    reportedByUserId: input.reportedByUserId,
    reportedByFullName: input.reportedByFullName,
    reportedByRole: input.reportedByRole,
    adminDescription: input.adminDescription,
    witnessName: input.witnessName?.trim() || null,
    witnessPosition: input.witnessPosition?.trim() || null,
  }

  if (requiresParcelContext(input.incidentType as IncidentTypeEnum)) {
    data.trackingNumber = input.trackingNumber ?? null
    data.platform = input.platform ?? null
    data.shopName = input.shopName ?? null
  }

  return prisma.incident.create({ data })
}

export interface UpdateIncidentInput {
  incidentType: IncidentType
  incidentDate: Date
  employeeUserId: string
  employeeFullName: string
  employeeEmail: string
  recipientEmail: string
  reportedByUserId: string
  reportedByFullName: string
  reportedByRole: string
  adminDescription: string
  trackingNumber?: string
  platform?: Platform
  shopName?: string
  witnessName?: string
  witnessPosition?: string
}

export async function updateIncident(tenantId: string, id: string, input: UpdateIncidentInput) {
  const existing = await prisma.incident.findFirst({ where: { id, tenantId }, select: { id: true } })
  if (!existing) return null

  const data: Prisma.IncidentUncheckedUpdateInput = {
    incidentType: input.incidentType,
    incidentDate: input.incidentDate,
    employeeUserId: input.employeeUserId,
    employeeFullName: input.employeeFullName,
    employeeEmail: input.employeeEmail,
    recipientEmail: input.recipientEmail,
    reportedByUserId: input.reportedByUserId,
    reportedByFullName: input.reportedByFullName,
    reportedByRole: input.reportedByRole,
    adminDescription: input.adminDescription,
    witnessName: input.witnessName?.trim() || null,
    witnessPosition: input.witnessPosition?.trim() || null,
  }

  // Parcel context fields are only kept for parcel-type incidents; otherwise cleared
  // so a type change away from a parcel type doesn't leave stale TN/platform/shop.
  if (requiresParcelContext(input.incidentType as IncidentTypeEnum)) {
    data.trackingNumber = input.trackingNumber ?? null
    data.platform = input.platform ?? null
    data.shopName = input.shopName ?? null
  } else {
    data.trackingNumber = null
    data.platform = null
    data.shopName = null
  }

  return prisma.incident.update({ where: { id }, data })
}

/** Permanently deletes an incident (and its signed file, if any). Returns null if not found. */
export async function deleteIncident(tenantId: string, id: string): Promise<{ id: string } | null> {
  const existing = await prisma.incident.findFirst({
    where: { id, tenantId },
    select: { id: true, signedFilePath: true, documents: { select: { filePath: true } } },
  })
  if (!existing) return null
  // Unlink the legacy single file + every uploaded document (rows cascade-delete).
  const paths = [existing.signedFilePath, ...existing.documents.map((d) => d.filePath)].filter(Boolean) as string[]
  for (const p of paths) {
    try { await fs.unlink(p) } catch { /* ignore */ }
  }
  await prisma.incident.delete({ where: { id: existing.id } })
  return { id: existing.id }
}

export interface ListIncidentsQuery {
  page: number
  pageSize: number
  search?: string
  type?: IncidentType
  employeeUserId?: string
  /** Inclusive date range on incidentDate, as YYYY-MM-DD strings. */
  from?: string
  to?: string
}

export async function listIncidents(tenantId: string, q: ListIncidentsQuery) {
  const where: Prisma.IncidentWhereInput = { tenantId }
  if (q.type) where.incidentType = q.type
  if (q.employeeUserId) where.employeeUserId = q.employeeUserId
  if (q.from || q.to) {
    where.incidentDate = {}
    if (q.from) where.incidentDate.gte = new Date(`${q.from}T00:00:00.000Z`)
    if (q.to)   where.incidentDate.lte = new Date(`${q.to}T23:59:59.999Z`)
  }
  if (q.search) {
    where.OR = [
      { employeeFullName: { contains: q.search, mode: 'insensitive' } },
      { trackingNumber:   { contains: q.search, mode: 'insensitive' } },
      { recipientEmail:   { contains: q.search, mode: 'insensitive' } },
      { employeeEmail:    { contains: q.search, mode: 'insensitive' } },
    ]
  }

  const [total, rows] = await Promise.all([
    prisma.incident.count({ where }),
    prisma.incident.findMany({
      where,
      // createdAt as tie-breaker so the genuinely most-recent entry sits on top
      // when several incidents share the same incidentDate.
      orderBy: [{ incidentDate: 'desc' }, { createdAt: 'desc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ])

  return { total, page: q.page, pageSize: q.pageSize, rows }
}

export async function getIncidentById(tenantId: string, id: string) {
  const row = await prisma.incident.findFirst({ where: { id, tenantId } })
  return row
}

export async function getIncidentStats(tenantId: string) {
  const now = new Date()
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

  const [total, thisMonth, byType] = await Promise.all([
    prisma.incident.count({ where: { tenantId } }),
    prisma.incident.count({ where: { tenantId, incidentDate: { gte: startOfMonth } } }),
    prisma.incident.groupBy({
      by: ['incidentType'],
      where: { tenantId },
      _count: { _all: true },
      orderBy: { _count: { incidentType: 'desc' } },
      take: 1,
    }),
  ])

  const topType = byType[0] ?? null
  return {
    total,
    thisMonth,
    topType: topType ? { type: topType.incidentType, count: topType._count._all } : null,
  }
}

/**
 * Pivot matrix: rows = employees that have at least one incident,
 * cols = incident types, cells = count.
 */
export async function getIncidentPivot(tenantId: string) {
  const grouped = await prisma.incident.groupBy({
    by: ['employeeUserId', 'employeeFullName', 'incidentType'],
    where: { tenantId },
    _count: { _all: true },
  })

  // employees: aggregate by userId, keep most-recent fullName
  const employees = new Map<string, { userId: string; fullName: string; total: number; counts: Record<string, number> }>()
  for (const row of grouped) {
    const key = row.employeeUserId
    const existing = employees.get(key)
    if (!existing) {
      employees.set(key, {
        userId: row.employeeUserId,
        fullName: row.employeeFullName,
        total: row._count._all,
        counts: { [row.incidentType]: row._count._all },
      })
    } else {
      existing.total += row._count._all
      existing.counts[row.incidentType] = (existing.counts[row.incidentType] ?? 0) + row._count._all
    }
  }

  const rows = Array.from(employees.values()).sort((a, b) => b.total - a.total)
  return { rows }
}

export async function lookupOrderByTrackingNumber(tenantId: string, trackingNumber: string) {
  const order = await prisma.order.findFirst({
    where: { tenantId, trackingNumber },
    select: { trackingNumber: true, platform: true, shopName: true },
    orderBy: { createdAt: 'desc' },
  })
  return order
}

export async function saveSignedFile(
  tenantId: string,
  incidentId: string,
  buffer: Buffer,
  mime: string,
) {
  await ensureUploadDirs()
  const ext = extFromMime(mime) || '.bin'
  const filename = `${incidentId}-signed${ext}`
  const fullPath = path.join(INCIDENTS_DIR, filename)

  // Delete previous file if different extension
  const existing = await prisma.incident.findFirst({ where: { id: incidentId, tenantId }, select: { signedFilePath: true } })
  if (existing?.signedFilePath && existing.signedFilePath !== fullPath) {
    try { await fs.unlink(existing.signedFilePath) } catch { /* ignore */ }
  }

  await fs.writeFile(fullPath, buffer)

  const updated = await prisma.incident.update({
    where: { id: incidentId },
    data: { signedFilePath: fullPath, signedFileMime: mime, signedUploadedAt: new Date() },
  })
  return updated
}

export async function readSignedFile(tenantId: string, incidentId: string) {
  const row = await prisma.incident.findFirst({
    where: { id: incidentId, tenantId },
    select: { signedFilePath: true, signedFileMime: true },
  })
  if (!row?.signedFilePath || !row.signedFileMime) return null
  try {
    const buffer = await fs.readFile(row.signedFilePath)
    return { buffer, mime: row.signedFileMime }
  } catch {
    return null
  }
}

// ─── Multiple signed documents per incident ─────────────────────────────────

/** Thrown when an identical document (same name + same type) is re-uploaded. */
export class DuplicateDocumentError extends Error {
  constructor() {
    super('DUPLICATE_DOCUMENT')
    this.name = 'DuplicateDocumentError'
  }
}

function serDoc(d: { id: string; mime: string; originalName: string | null; uploadedAt: Date }) {
  return { id: d.id, mime: d.mime, originalName: d.originalName, uploadedAt: d.uploadedAt.toISOString() }
}

// One-time lazy migration: fold a legacy single signed_file_* into the documents
// table so old uploads still appear in the list. Idempotent — runs only while the
// legacy column is still populated.
async function migrateLegacySignedFile(incident: { id: string; signedFilePath: string | null; signedFileMime: string | null; signedUploadedAt: Date | null }) {
  if (!incident.signedFilePath) return
  const already = await prisma.incidentDocument.findFirst({ where: { incidentId: incident.id, filePath: incident.signedFilePath }, select: { id: true } })
  if (!already) {
    await prisma.incidentDocument.create({
      data: {
        incidentId: incident.id,
        filePath: incident.signedFilePath,
        mime: incident.signedFileMime ?? 'application/octet-stream',
        originalName: `signed${extFromMime(incident.signedFileMime ?? '') || ''}`,
        uploadedAt: incident.signedUploadedAt ?? new Date(),
      },
    })
  }
  await prisma.incident.update({ where: { id: incident.id }, data: { signedFilePath: null, signedFileMime: null, signedUploadedAt: null } })
}

export async function listIncidentDocuments(tenantId: string, incidentId: string) {
  const incident = await prisma.incident.findFirst({
    where: { id: incidentId, tenantId },
    select: { id: true, signedFilePath: true, signedFileMime: true, signedUploadedAt: true },
  })
  if (!incident) return null
  await migrateLegacySignedFile(incident)
  const docs = await prisma.incidentDocument.findMany({
    where: { incidentId },
    orderBy: { uploadedAt: 'asc' },
    select: { id: true, mime: true, originalName: true, uploadedAt: true },
  })
  return docs.map(serDoc)
}

export async function addIncidentDocument(
  tenantId: string,
  incidentId: string,
  buffer: Buffer,
  mime: string,
  originalName: string | null,
) {
  const incident = await prisma.incident.findFirst({ where: { id: incidentId, tenantId }, select: { id: true } })
  if (!incident) return null

  // Reject an identical re-upload: same (case-insensitive) name AND same type.
  const name = (originalName ?? '').trim()
  if (name) {
    const dup = await prisma.incidentDocument.findFirst({
      where: { incidentId, mime, originalName: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    })
    if (dup) throw new DuplicateDocumentError()
  }

  await ensureUploadDirs()
  const ext = extFromMime(mime) || '.bin'
  const fullPath = path.join(INCIDENTS_DIR, `${incidentId}-${randomUUID()}${ext}`)
  await fs.writeFile(fullPath, buffer)

  const doc = await prisma.incidentDocument.create({
    data: { incidentId, filePath: fullPath, mime, originalName: name || null },
    select: { id: true, mime: true, originalName: true, uploadedAt: true },
  })
  return serDoc(doc)
}

export async function readIncidentDocument(tenantId: string, incidentId: string, docId: string) {
  const doc = await prisma.incidentDocument.findFirst({
    where: { id: docId, incidentId, incident: { tenantId } },
    select: { filePath: true, mime: true, originalName: true },
  })
  if (!doc) return null
  try {
    const buffer = await fs.readFile(doc.filePath)
    return { buffer, mime: doc.mime, originalName: doc.originalName }
  } catch {
    return null
  }
}

export async function deleteIncidentDocument(tenantId: string, incidentId: string, docId: string) {
  const doc = await prisma.incidentDocument.findFirst({
    where: { id: docId, incidentId, incident: { tenantId } },
    select: { id: true, filePath: true },
  })
  if (!doc) return false
  try { await fs.unlink(doc.filePath) } catch { /* ignore */ }
  await prisma.incidentDocument.delete({ where: { id: doc.id } })
  return true
}

export async function markEmailSent(tenantId: string, incidentId: string, sentTo: string) {
  return prisma.incident.updateMany({
    where: { id: incidentId, tenantId },
    data: { emailSentAt: new Date(), emailSentTo: sentTo },
  })
}

/** Active users that admin can pick as the "employee" or "reported by" in an incident. */
export async function listSelectableUsers(tenantId: string) {
  return prisma.user.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, username: true, email: true, role: true },
    orderBy: [{ role: 'asc' }, { username: 'asc' }],
  })
}

/** Look up most-recent saved "full name" for a given user, so the modal can suggest it. */
export async function getRememberedFullName(tenantId: string, userId: string): Promise<string | null> {
  const lastAsEmployee = await prisma.incident.findFirst({
    where: { tenantId, employeeUserId: userId },
    orderBy: { createdAt: 'desc' },
    select: { employeeFullName: true },
  })
  if (lastAsEmployee?.employeeFullName) return lastAsEmployee.employeeFullName
  const lastAsReporter = await prisma.incident.findFirst({
    where: { tenantId, reportedByUserId: userId },
    orderBy: { createdAt: 'desc' },
    select: { reportedByFullName: true },
  })
  return lastAsReporter?.reportedByFullName ?? null
}
