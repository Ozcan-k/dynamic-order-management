import { z } from 'zod'
import { UserRole } from '@dom/shared'
import { prisma } from '../lib/prisma'
import {
  type AgentRef,
  type MarketingKpis,
  type RawActivity,
  type RawOrder,
  computeActivityGrid,
  computeAgents,
  computeBreakdowns,
  computeDaily,
  computeKpis,
  dayCount,
  previousRange,
  shiftDate,
  streaks,
} from './marketingAnalytics'

// Read-only analytics for the Marketing Report (v2.89). Never writes; the legacy
// /marketing/leaderboard + /comparison endpoints stay untouched alongside it.

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
const MAX_RANGE_DAYS = 366
const STREAK_LOOKBACK_DAYS = 365

/** Comma-separated list → string[] (empty / missing → undefined = no filter). */
const CsvList = z
  .string()
  .max(4000)
  .optional()
  .transform((v) => {
    const list = (v ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    return list.length > 0 ? list : undefined
  })

export const AnalyticsQuerySchema = z
  .object({
    from: DateString,
    to: DateString,
    agentIds: CsvList,
    stores: CsvList,
  })
  .refine((q) => q.from <= q.to, { message: '`from` must be on or before `to`' })
  .refine((q) => dayCount(q.from, q.to) <= MAX_RANGE_DAYS, { message: `Range is limited to ${MAX_RANGE_DAYS} days` })

export type AnalyticsQuery = z.infer<typeof AnalyticsQuerySchema>

// ─── Loaders ──────────────────────────────────────────────────────────────────

function toDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`)
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10)

async function loadAgents(tenantId: string, agentIds?: string[]): Promise<AgentRef[]> {
  return prisma.user.findMany({
    where: { tenantId, role: UserRole.SALES_AGENT, isActive: true, ...(agentIds ? { id: { in: agentIds } } : {}) },
    select: { id: true, username: true },
    orderBy: { username: 'asc' },
  })
}

async function loadRange(
  tenantId: string,
  agentIds: string[],
  from: string,
  to: string,
  stores?: string[],
): Promise<{ activities: RawActivity[]; orders: RawOrder[] }> {
  const start = toDateOnly(from)
  const end = toDateOnly(shiftDate(to, 1))
  const storeFilter = stores ? { storeName: { in: stores } } : {}

  const [activities, orders] = await Promise.all([
    prisma.salesDailyActivity.findMany({
      where: { tenantId, agentId: { in: agentIds }, reportDate: { gte: start, lt: end }, ...storeFilter },
      select: {
        agentId: true,
        reportDate: true,
        storeName: true,
        contentPosts: { select: { platform: true, postType: true, completed: true } },
        liveSellingMetrics: {
          select: { platform: true, hours: true, followers: true, likes: true, views: true, shares: true, comments: true, orders: true },
        },
        marketplaceReport: { select: { inquiries: true, listingsCreated: true } },
      },
    }),
    prisma.salesDirectOrder.findMany({
      where: { tenantId, agentId: { in: agentIds }, orderDate: { gte: start, lt: end }, ...storeFilter },
      select: {
        id: true,
        agentId: true,
        orderDate: true,
        storeName: true,
        saleChannel: true,
        companyName: true,
        customerName: true,
        totalAmount: true,
        items: { select: { productName: true, price: true, quantity: true } },
      },
    }),
  ])

  return {
    activities: activities.map((a) => ({
      agentId: a.agentId,
      date: isoDate(a.reportDate),
      store: a.storeName,
      posts: a.contentPosts,
      live: a.liveSellingMetrics.map((l) => ({ ...l, hours: Number(l.hours) })),
      marketplace: a.marketplaceReport
        ? { inquiries: a.marketplaceReport.inquiries, listings: a.marketplaceReport.listingsCreated }
        : null,
    })),
    orders: orders.map((o) => ({
      id: o.id,
      agentId: o.agentId,
      date: isoDate(o.orderDate),
      store: o.storeName,
      channel: o.saleChannel,
      companyName: o.companyName,
      customerName: o.customerName,
      total: Number(o.totalAmount),
      items: o.items.map((it) => ({ productName: it.productName, price: Number(it.price), quantity: it.quantity })),
    })),
  }
}

/** Every date each agent was active (activity row or direct order) in the lookback window. */
async function loadActiveDates(tenantId: string, agentIds: string[], to: string): Promise<Map<string, Set<string>>> {
  const start = toDateOnly(shiftDate(to, -STREAK_LOOKBACK_DAYS))
  const end = toDateOnly(shiftDate(to, 1))
  const [acts, ords] = await Promise.all([
    prisma.salesDailyActivity.groupBy({
      by: ['agentId', 'reportDate'],
      where: { tenantId, agentId: { in: agentIds }, reportDate: { gte: start, lt: end } },
    }),
    prisma.salesDirectOrder.groupBy({
      by: ['agentId', 'orderDate'],
      where: { tenantId, agentId: { in: agentIds }, orderDate: { gte: start, lt: end } },
    }),
  ])
  const out = new Map<string, Set<string>>()
  const add = (agentId: string, d: Date) => {
    let s = out.get(agentId)
    if (!s) out.set(agentId, (s = new Set()))
    s.add(isoDate(d))
  }
  for (const a of acts) add(a.agentId, a.reportDate)
  for (const o of ords) add(o.agentId, o.orderDate)
  return out
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** GET /marketing/analytics/overview — KPIs (with previous period), daily series, per-agent rows, breakdowns. */
export async function getOverview(tenantId: string, q: AnalyticsQuery) {
  const agents = await loadAgents(tenantId, q.agentIds)
  const ids = agents.map((a) => a.id)
  const prev = previousRange(q.from, q.to)

  const [cur, old] = await Promise.all([
    loadRange(tenantId, ids, q.from, q.to, q.stores),
    loadRange(tenantId, ids, prev.from, prev.to, q.stores),
  ])

  const previousByAgent = new Map(
    computeAgents(agents, old.activities, old.orders, prev.from, prev.to).map((r) => [r.agentId, r]),
  )

  return {
    from: q.from,
    to: q.to,
    previous: prev,
    kpis: {
      current: computeKpis(cur.activities, cur.orders),
      previous: computeKpis(old.activities, old.orders),
    },
    daily: computeDaily(cur.activities, cur.orders, q.from, q.to),
    previousDaily: computeDaily(old.activities, old.orders, prev.from, prev.to),
    agents: computeAgents(agents, cur.activities, cur.orders, q.from, q.to).map((r) => {
      const p = previousByAgent.get(r.agentId)
      return {
        ...r,
        previous: { directSales: p?.directSales ?? 0, posts: p?.posts ?? 0, liveHours: p?.liveHours ?? 0, score: p?.score ?? 0 },
      }
    }),
    ...computeBreakdowns(cur.activities, cur.orders),
  }
}

/** GET /marketing/analytics/activity-grid — agent × day consistency grid + streaks. */
export async function getActivityGrid(tenantId: string, q: AnalyticsQuery) {
  const agents = await loadAgents(tenantId, q.agentIds)
  const ids = agents.map((a) => a.id)
  const [cur, activeDates] = await Promise.all([
    loadRange(tenantId, ids, q.from, q.to, q.stores),
    loadActiveDates(tenantId, ids, q.to),
  ])
  return {
    from: q.from,
    to: q.to,
    agents: computeActivityGrid(agents, cur.activities, cur.orders, q.from, q.to, activeDates),
  }
}

/**
 * GET /marketing/agents/:id/summary — one agent vs the team: KPIs (+ previous
 * period), team average over agents active in the range, score rank, daily
 * series, breakdowns, streak and the latest orders.
 * `agentIds` is ignored here: the team comparison always uses every active agent.
 */
export async function getAgentSummary(tenantId: string, agentId: string, q: AnalyticsQuery) {
  const agents = await loadAgents(tenantId)
  const ids = agents.map((a) => a.id)
  const prev = previousRange(q.from, q.to)

  const [cur, old, activeDates] = await Promise.all([
    loadRange(tenantId, ids, q.from, q.to, q.stores),
    loadRange(tenantId, [agentId], prev.from, prev.to, q.stores),
    loadActiveDates(tenantId, [agentId], q.to),
  ])

  const team = computeAgents(agents, cur.activities, cur.orders, q.from, q.to)
  const ranked = [...team].sort((a, b) => b.score - a.score)
  const activeTeam = team.filter((r) => r.activeDays > 0)

  const mine = {
    activities: cur.activities.filter((a) => a.agentId === agentId),
    orders: cur.orders.filter((o) => o.agentId === agentId),
  }

  const recentOrders = [...mine.orders]
    .sort((a, b) => (a.date === b.date ? b.total - a.total : b.date.localeCompare(a.date)))
    .slice(0, 10)
    .map((o) => ({
      id: o.id,
      date: o.date,
      store: o.store,
      channel: o.channel,
      companyName: o.companyName,
      customerName: o.customerName,
      total: o.total,
      itemCount: o.items.reduce((s, it) => s + it.quantity, 0),
    }))

  return {
    from: q.from,
    to: q.to,
    previous: prev,
    agentId,
    // No rank when the agent scored nothing — "#1 of 5" in an empty range would be misleading
    rank: (ranked.find((r) => r.agentId === agentId)?.score ?? 0) > 0
      ? ranked.findIndex((r) => r.agentId === agentId) + 1
      : null,
    teamSize: team.length,
    kpis: {
      current: computeKpis(mine.activities, mine.orders),
      previous: computeKpis(old.activities, old.orders),
      teamAverage: averageKpis(activeTeam),
    },
    daily: computeDaily(mine.activities, mine.orders, q.from, q.to),
    previousDaily: computeDaily(old.activities, old.orders, prev.from, prev.to),
    ...computeBreakdowns(mine.activities, mine.orders),
    ...streaks(activeDates.get(agentId) ?? new Set(), q.to),
    recentOrders,
  }
}

function averageKpis(rows: MarketingKpis[]): MarketingKpis | null {
  if (rows.length === 0) return null
  const keys = Object.keys(rows[0]) as (keyof MarketingKpis)[]
  const out = {} as MarketingKpis
  for (const k of keys) {
    if (typeof rows[0][k] !== 'number') continue
    out[k] = rows.reduce((s, r) => s + r[k], 0) / rows.length
  }
  return out
}
