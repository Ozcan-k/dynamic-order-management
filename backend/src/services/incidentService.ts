import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { Prisma, IncidentType, Platform } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { INCIDENTS_DIR, extFromMime, ensureUploadDirs } from '../lib/uploads'
import {
  requiresParcelContext,
  requiresCostContext,
  IncidentType as IncidentTypeEnum,
  INCIDENT_TYPE_LABELS,
  INCIDENT_TYPE_CATEGORY,
  IncidentCategory,
  DisciplinaryAction,
  isWarningAction,
  suggestNextAction,
} from '@dom/shared'
import { getTenantOccurrences, highestAction, loadPeople } from './incidentInsights'

function num(v: unknown): number {
  if (v === null || v === undefined) return 0
  return v instanceof Prisma.Decimal ? v.toNumber() : Number(v)
}
const r2 = (n: number) => Math.round(n * 100) / 100

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
  costAmount?: number
  costQuantity?: number
  shippingCost?: number
  /** v2.91.0 — null / omitted = not recorded */
  disciplinaryAction?: DisciplinaryAction | null
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
    disciplinaryAction: input.disciplinaryAction ?? null,
  }

  if (requiresParcelContext(input.incidentType as IncidentTypeEnum)) {
    data.trackingNumber = input.trackingNumber ?? null
    data.platform = input.platform ?? null
    data.shopName = input.shopName ?? null
  }

  if (requiresCostContext(input.incidentType as IncidentTypeEnum)) {
    data.costAmount = input.costAmount ?? null
    data.costQuantity = input.costQuantity ?? null
    data.shippingCost = input.shippingCost ?? null
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
  costAmount?: number
  costQuantity?: number
  shippingCost?: number
  /**
   * v2.91.0 — undefined = leave untouched (older clients never send it, so an
   * edit can't silently wipe a recorded warning); null = clear; value = set.
   */
  disciplinaryAction?: DisciplinaryAction | null
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
  if (input.disciplinaryAction !== undefined) data.disciplinaryAction = input.disciplinaryAction

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

  // Cost/quantity are only kept for cost-context incident types; otherwise cleared
  // so a type change away from a cost type doesn't leave a stale figure behind.
  if (requiresCostContext(input.incidentType as IncidentTypeEnum)) {
    data.costAmount = input.costAmount ?? null
    data.costQuantity = input.costQuantity ?? null
    data.shippingCost = input.shippingCost ?? null
  } else {
    data.costAmount = null
    data.costQuantity = null
    data.shippingCost = null
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
  /** v2.91.0 — a disciplinary action, or NOT_RECORDED for incidents without one */
  action?: DisciplinaryAction | 'NOT_RECORDED'
  category?: IncidentCategory
  /** v2.91.0 — every login of the person behind this user id (linked Employee) */
  samePersonAs?: string
}

export async function listIncidents(tenantId: string, q: ListIncidentsQuery) {
  const where: Prisma.IncidentWhereInput = { tenantId }
  if (q.type) where.incidentType = q.type
  else if (q.category) {
    where.incidentType = { in: (Object.keys(INCIDENT_TYPE_CATEGORY) as IncidentTypeEnum[]).filter((t) => INCIDENT_TYPE_CATEGORY[t] === q.category) as IncidentType[] }
  }
  if (q.action) where.disciplinaryAction = q.action === 'NOT_RECORDED' ? null : q.action
  if (q.employeeUserId) where.employeeUserId = q.employeeUserId
  if (q.samePersonAs) {
    const { keyOf, people } = await loadPeople(tenantId)
    where.employeeUserId = { in: people.get(keyOf(q.samePersonAs))?.userIds ?? [q.samePersonAs] }
  }
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

  const [total, rows, occ] = await Promise.all([
    prisma.incident.count({ where }),
    prisma.incident.findMany({
      where,
      // createdAt as tie-breaker so the genuinely most-recent entry sits on top
      // when several incidents share the same incidentDate.
      orderBy: [{ incidentDate: 'desc' }, { createdAt: 'desc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { _count: { select: { documents: true } } },
    }),
    getTenantOccurrences(tenantId),
  ])

  // v2.91.0: occurrence numbers are computed over ALL of the person's incidents,
  // not just this page / filter, so "#4" means the 4th incident ever.
  return {
    total,
    page: q.page,
    pageSize: q.pageSize,
    // hasSignedCopy (v2.91.0): documents live in incident_documents since v2.65 — the
    // legacy signedFilePath alone under-reported signed copies in the table.
    rows: rows.map(({ _count, ...r }) => ({
      ...r,
      documentCount: _count.documents,
      hasSignedCopy: _count.documents > 0 || !!r.signedFilePath,
      occurrence: occ.occurrences.get(r.id) ?? null,
    })),
  }
}

/** v2.91.0 — occurrence numbers for one incident (detail view). */
export async function getIncidentOccurrence(tenantId: string, id: string) {
  const occ = await getTenantOccurrences(tenantId)
  return occ.occurrences.get(id) ?? null
}

/**
 * v2.91.0 — everything on record for the person behind a login (all their
 * linked logins), newest first, with the disciplinary ladder summary and the
 * advisory next step. Used by the create form hint and the employee profile.
 */
export async function getPersonHistory(tenantId: string, userId: string) {
  const occ = await getTenantOccurrences(tenantId)
  const personKey = occ.keyOf(userId)
  const person = occ.people.get(personKey)
  const userIds = person?.userIds ?? [userId]

  const incidents = await prisma.incident.findMany({
    where: { tenantId, employeeUserId: { in: userIds } },
    orderBy: [{ incidentDate: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true, incidentType: true, incidentDate: true, createdAt: true, employeeUserId: true, employeeFullName: true,
      disciplinaryAction: true, costAmount: true, shippingCost: true, reportedByFullName: true,
      signedFilePath: true, _count: { select: { documents: true } },
    },
  })

  const actions = incidents.map((i) => i.disciplinaryAction as DisciplinaryAction | null)
  const highest = highestAction(actions)
  const warnings = incidents.filter((i) => isWarningAction(i.disciplinaryAction as DisciplinaryAction | null))
  const lastWarning = warnings[0] ?? null
  const yearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000
  const byType = new Map<string, number>()
  for (const i of incidents) byType.set(i.incidentType, (byType.get(i.incidentType) ?? 0) + 1)

  return {
    personKey,
    name: person?.name ?? incidents[0]?.employeeFullName ?? null,
    userIds,
    total: incidents.length,
    last12Months: incidents.filter((i) => i.incidentDate.getTime() > yearAgo).length,
    warningCount: warnings.length,
    notRecorded: actions.filter((a) => a === null).length,
    highestAction: highest,
    lastWarning: lastWarning ? { action: lastWarning.disciplinaryAction as DisciplinaryAction, date: lastWarning.incidentDate.toISOString().slice(0, 10) } : null,
    suggestedNext: suggestNextAction(highest),
    totalCost: r2(incidents.reduce((sum, i) => sum + num(i.costAmount) + num(i.shippingCost), 0)),
    byType: [...byType.entries()]
      .map(([type, count]) => ({ type, label: INCIDENT_TYPE_LABELS[type as IncidentTypeEnum] ?? type, count }))
      .sort((a, b) => b.count - a.count),
    incidents: incidents.map((i) => ({
      id: i.id,
      incidentType: i.incidentType,
      incidentDate: i.incidentDate,
      employeeUserId: i.employeeUserId,
      disciplinaryAction: i.disciplinaryAction,
      cost: r2(num(i.costAmount) + num(i.shippingCost)),
      reportedByFullName: i.reportedByFullName,
      hasSignedCopy: i._count.documents > 0 || !!i.signedFilePath,
      occurrence: occ.occurrences.get(i.id) ?? null,
    })),
  }
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
 * cols = incident types, cells = count. Optional [from,to] (YYYY-MM-DD,
 * inclusive) narrows to a date range — omitted means all-time (unchanged
 * default behavior for existing callers).
 */
export async function getIncidentPivot(tenantId: string, range?: { from?: string; to?: string }) {
  const where: Prisma.IncidentWhereInput = { tenantId }
  if (range?.from || range?.to) {
    where.incidentDate = {}
    if (range.from) where.incidentDate.gte = new Date(`${range.from}T00:00:00.000Z`)
    if (range.to)   where.incidentDate.lte = new Date(`${range.to}T23:59:59.999Z`)
  }

  const grouped = await prisma.incident.groupBy({
    by: ['employeeUserId', 'employeeFullName', 'incidentType'],
    where,
    _count: { _all: true },
    _sum: { costAmount: true },
  })

  // employees: aggregate by userId, keep most-recent fullName
  const employees = new Map<string, { userId: string; fullName: string; total: number; totalCost: number; counts: Record<string, number> }>()
  for (const row of grouped) {
    const key = row.employeeUserId
    const cost = num(row._sum.costAmount)
    const existing = employees.get(key)
    if (!existing) {
      employees.set(key, {
        userId: row.employeeUserId,
        fullName: row.employeeFullName,
        total: row._count._all,
        totalCost: r2(cost),
        counts: { [row.incidentType]: row._count._all },
      })
    } else {
      existing.total += row._count._all
      existing.totalCost = r2(existing.totalCost + cost)
      existing.counts[row.incidentType] = (existing.counts[row.incidentType] ?? 0) + row._count._all
    }
  }

  const rows = Array.from(employees.values()).sort((a, b) => b.total - a.total)
  return { rows }
}

// ─── Report dashboard (page 1: trend + type breakdown over a date range) ────
// Mirrors accountingService.getSalesReport's resolveRange/buildBuckets pattern
// (daily buckets ≤92 day span, else monthly; year suffix if range crosses a
// year boundary) — replicated locally rather than cross-imported so the
// Incident module doesn't reach into the Accounting module's internals.
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_MS = 24 * 60 * 60 * 1000

function resolveIncidentRange(from: string | undefined, to: string | undefined, dates: Date[]): { start: Date; end: Date } | null {
  let start = from ? new Date(from + 'T00:00:00.000Z') : undefined
  let end = to ? new Date(to + 'T23:59:59.999Z') : undefined
  if (!start || !end) {
    if (dates.length === 0) {
      if (start) return { start, end: start }
      if (end) return { start: end, end }
      return null
    }
    const times = dates.map((d) => d.getTime())
    if (!start) start = new Date(Math.min(...times))
    if (!end) end = new Date(Math.max(...times))
  }
  return { start, end }
}

function buildIncidentBuckets(start: Date, end: Date) {
  const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
  const spanDays = Math.floor((endDay - startDay) / DAY_MS) + 1
  const daily = spanDays <= 92
  const multiYear = start.getUTCFullYear() !== end.getUTCFullYear()
  const labels: string[] = []
  const index = new Map<string, number>()
  if (daily) {
    for (let cur = startDay; cur <= endDay; cur += DAY_MS) {
      const d = new Date(cur)
      index.set(`${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`, labels.length)
      labels.push(multiYear ? `${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCDate()}` : `${d.getUTCMonth() + 1}/${d.getUTCDate()}`)
    }
  } else {
    let y = start.getUTCFullYear(), m = start.getUTCMonth()
    const ey = end.getUTCFullYear(), em = end.getUTCMonth()
    while (y < ey || (y === ey && m <= em)) {
      index.set(`${y}-${m}`, labels.length)
      labels.push(multiYear ? `${MONTH_ABBR[m]} '${String(y).slice(2)}` : MONTH_ABBR[m])
      m++; if (m > 11) { m = 0; y++ }
    }
  }
  const keyOf = (d: Date) => daily
    ? `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
    : `${d.getUTCFullYear()}-${d.getUTCMonth()}`
  const trend = labels.map((label) => ({ label, count: 0, cost: 0, byCategory: {} as Record<string, number> }))
  const add = (d: Date, cost: number, category?: string) => {
    const i = index.get(keyOf(d))
    if (i !== undefined) {
      trend[i].count += 1
      trend[i].cost += cost
      if (category) trend[i].byCategory[category] = (trend[i].byCategory[category] ?? 0) + 1
    }
  }
  return { trend, add }
}

/** Same-length window immediately before [from, to] (YYYY-MM-DD, inclusive). */
function previousWindow(from: string, to: string): { from: string; to: string } {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  const days = Math.round((end - start) / DAY_MS) + 1
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
  return { from: iso(start - days * DAY_MS), to: iso(start - DAY_MS) }
}

export async function getIncidentReport(tenantId: string, opts: { from?: string; to?: string }) {
  const rangeWhere = (from?: string, to?: string): Prisma.IncidentWhereInput => {
    const where: Prisma.IncidentWhereInput = { tenantId }
    const dw: Prisma.DateTimeFilter = {}
    if (from) dw.gte = new Date(`${from}T00:00:00.000Z`)
    if (to)   dw.lte = new Date(`${to}T23:59:59.999Z`)
    if (from || to) where.incidentDate = dw
    return where
  }
  const prevRange = opts.from && opts.to ? previousWindow(opts.from, opts.to) : null

  const [incidents, prevIncidents, occ] = await Promise.all([
    prisma.incident.findMany({
      where: rangeWhere(opts.from, opts.to),
      select: {
        id: true, incidentDate: true, incidentType: true, costAmount: true, shippingCost: true,
        employeeUserId: true, employeeFullName: true, disciplinaryAction: true, signedFilePath: true,
        _count: { select: { documents: true } },
      },
    }),
    prevRange
      ? prisma.incident.findMany({
          where: rangeWhere(prevRange.from, prevRange.to),
          select: { employeeUserId: true, costAmount: true, shippingCost: true, disciplinaryAction: true },
        })
      : Promise.resolve([]),
    getTenantOccurrences(tenantId),
  ])

  const range = resolveIncidentRange(opts.from, opts.to, incidents.map((i) => i.incidentDate))
  const totalCost = r2(incidents.reduce((sum, i) => sum + num(i.costAmount) + num(i.shippingCost), 0))

  if (!range) {
    return {
      trend: [], byType: [], byEmployeeCost: [], total: 0, totalCost: 0,
      employeesInvolved: 0, repeatOffenders: 0, warningsIssued: 0, unsignedCount: 0,
      byAction: [], byCategory: [], repeatList: [], previous: null,
    }
  }

  const { trend, add } = buildIncidentBuckets(range.start, range.end)
  const byTypeMap = new Map<string, number>()
  const empCostMap = new Map<string, { fullName: string; cost: number }>()
  const byActionMap = new Map<string, number>()
  const byCategoryMap = new Map<string, { count: number; cost: number }>()
  const personMap = new Map<string, { name: string; userIds: Set<string>; count: number; cost: number; actions: (DisciplinaryAction | null)[]; lastDate: Date; types: Map<string, number> }>()
  let unsignedCount = 0

  for (const inc of incidents) {
    const cost = num(inc.costAmount) + num(inc.shippingCost)
    const category = INCIDENT_TYPE_CATEGORY[inc.incidentType as IncidentTypeEnum]
    add(inc.incidentDate, cost, category)
    byTypeMap.set(inc.incidentType, (byTypeMap.get(inc.incidentType) ?? 0) + 1)
    if (cost > 0) {
      const e = empCostMap.get(inc.employeeUserId) ?? { fullName: inc.employeeFullName, cost: 0 }
      e.cost += cost
      empCostMap.set(inc.employeeUserId, e)
    }
    const actionKey = inc.disciplinaryAction ?? 'NOT_RECORDED'
    byActionMap.set(actionKey, (byActionMap.get(actionKey) ?? 0) + 1)
    const c = byCategoryMap.get(category) ?? { count: 0, cost: 0 }
    c.count += 1
    c.cost += cost
    byCategoryMap.set(category, c)
    if (inc._count.documents === 0 && !inc.signedFilePath) unsignedCount += 1

    const key = occ.keyOf(inc.employeeUserId)
    const p = personMap.get(key) ?? {
      name: occ.people.get(key)?.name ?? inc.employeeFullName,
      userIds: new Set<string>(), count: 0, cost: 0, actions: [], lastDate: inc.incidentDate, types: new Map<string, number>(),
    }
    p.userIds.add(inc.employeeUserId)
    p.count += 1
    p.cost += cost
    p.actions.push(inc.disciplinaryAction as DisciplinaryAction | null)
    if (inc.incidentDate > p.lastDate) p.lastDate = inc.incidentDate
    p.types.set(inc.incidentType, (p.types.get(inc.incidentType) ?? 0) + 1)
    personMap.set(key, p)
  }
  trend.forEach((t) => { t.cost = r2(t.cost) })

  const byType = [...byTypeMap.entries()]
    .map(([type, count]) => ({ type, label: INCIDENT_TYPE_LABELS[type as IncidentTypeEnum] ?? type, count }))
    .sort((a, b) => b.count - a.count)

  // Only employees who actually incurred cost in this range appear — no
  // full-roster join, so someone with zero cost incidents just isn't listed.
  const byEmployeeCost = [...empCostMap.entries()]
    .map(([employeeUserId, v]) => ({ employeeUserId, employeeFullName: v.fullName, cost: r2(v.cost) }))
    .sort((a, b) => b.cost - a.cost)

  // All-time totals per person, so the repeat list can show "3 this period · 7 ever"
  const allTime = new Map<string, number>()
  for (const r of occ.rows) {
    const k = occ.keyOf(r.employeeUserId)
    allTime.set(k, (allTime.get(k) ?? 0) + 1)
  }
  const repeatList = [...personMap.entries()]
    .filter(([, p]) => p.count >= 2)
    .map(([personKey, p]) => {
      const topType = [...p.types.entries()].sort((a, b) => b[1] - a[1])[0]
      return {
        personKey,
        name: p.name,
        userId: [...p.userIds][0],
        count: p.count,
        allTime: allTime.get(personKey) ?? p.count,
        warnings: p.actions.filter((a) => isWarningAction(a)).length,
        notRecorded: p.actions.filter((a) => a === null).length,
        highestAction: highestAction(p.actions),
        lastDate: p.lastDate.toISOString().slice(0, 10),
        cost: r2(p.cost),
        topType: topType ? { type: topType[0], label: INCIDENT_TYPE_LABELS[topType[0] as IncidentTypeEnum] ?? topType[0], count: topType[1] } : null,
      }
    })
    .sort((a, b) => b.count - a.count || b.allTime - a.allTime)

  const persons = (rows: { employeeUserId: string }[]) => new Set(rows.map((r) => occ.keyOf(r.employeeUserId))).size

  return {
    trend,
    byType,
    byEmployeeCost,
    total: incidents.length,
    totalCost,
    // v2.91.0 additions
    employeesInvolved: personMap.size,
    repeatOffenders: repeatList.length,
    warningsIssued: incidents.filter((i) => isWarningAction(i.disciplinaryAction as DisciplinaryAction | null)).length,
    unsignedCount,
    byAction: [...byActionMap.entries()].map(([action, count]) => ({ action, count })),
    byCategory: [...byCategoryMap.entries()]
      .map(([category, v]) => ({ category, count: v.count, cost: r2(v.cost) }))
      .sort((a, b) => b.count - a.count),
    repeatList,
    previous: prevRange
      ? {
          ...prevRange,
          total: prevIncidents.length,
          employeesInvolved: persons(prevIncidents),
          totalCost: r2(prevIncidents.reduce((sum, i) => sum + num(i.costAmount) + num(i.shippingCost), 0)),
          warningsIssued: prevIncidents.filter((i) => isWarningAction(i.disciplinaryAction as DisciplinaryAction | null)).length,
        }
      : null,
  }
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
