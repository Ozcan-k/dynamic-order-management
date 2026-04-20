import { z } from 'zod'
import { UserRole } from '@dom/shared'
import { prisma } from '../lib/prisma'

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')

export const RangeQuerySchema = z.object({
  from: DateString,
  to: DateString,
})

export type RangeQuery = z.infer<typeof RangeQuerySchema>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`)
}

/** Inclusive end → exclusive end Date (next day). */
function exclusiveEnd(dateStr: string): Date {
  const d = toDateOnly(dateStr)
  return new Date(d.getTime() + 24 * 60 * 60 * 1000)
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function listAgents(tenantId: string) {
  const agents = await prisma.user.findMany({
    where: { tenantId, role: UserRole.SALES_AGENT, isActive: true },
    select: { id: true, username: true, createdAt: true },
    orderBy: { username: 'asc' },
  })
  return agents.map((a) => ({
    id: a.id,
    username: a.username,
    createdAt: a.createdAt.toISOString(),
  }))
}

export interface AgentMetrics {
  agentId: string
  username: string
  posts: number          // completed content posts
  liveHours: number
  directSales: number    // PHP
  inquiries: number
  ordersCount: number
}

/**
 * Per-agent aggregated totals over a date range. Used for the Compare All
 * Agents leaderboard + 4 stat cards.
 */
export async function getLeaderboard(tenantId: string, from: string, to: string): Promise<AgentMetrics[]> {
  const start = toDateOnly(from)
  const end = exclusiveEnd(to)

  const [agents, activities, orders] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId, role: UserRole.SALES_AGENT, isActive: true },
      select: { id: true, username: true },
      orderBy: { username: 'asc' },
    }),
    prisma.salesDailyActivity.findMany({
      where: { tenantId, reportDate: { gte: start, lt: end } },
      include: {
        contentPosts: { where: { completed: true }, select: { id: true } },
        liveSellingMetrics: { select: { hours: true } },
        marketplaceReport: { select: { inquiries: true } },
      },
    }),
    prisma.salesDirectOrder.findMany({
      where: { tenantId, orderDate: { gte: start, lt: end } },
      select: { agentId: true, totalAmount: true },
    }),
  ])

  // Initialize zero rows for every active agent so the leaderboard is stable
  const byAgent = new Map<string, AgentMetrics>()
  for (const a of agents) {
    byAgent.set(a.id, {
      agentId: a.id,
      username: a.username,
      posts: 0,
      liveHours: 0,
      directSales: 0,
      inquiries: 0,
      ordersCount: 0,
    })
  }

  for (const act of activities) {
    const row = byAgent.get(act.agentId)
    if (!row) continue
    row.posts += act.contentPosts.length
    row.liveHours += act.liveSellingMetrics.reduce((s, m) => s + Number(m.hours), 0)
    if (act.marketplaceReport) row.inquiries += act.marketplaceReport.inquiries
  }

  for (const o of orders) {
    const row = byAgent.get(o.agentId)
    if (!row) continue
    row.directSales += Number(o.totalAmount)
    row.ordersCount += 1
  }

  return Array.from(byAgent.values())
}

export interface DailyPoint {
  date: string
  posts: number
  liveHours: number
  directSales: number
  inquiries: number
}

export interface AgentTrend {
  agentId: string
  username: string
  daily: DailyPoint[]
}

/**
 * Per-agent daily breakdown for the trend line chart. Returns one series
 * per agent with one point per calendar day in the range.
 */
export async function getComparison(tenantId: string, from: string, to: string): Promise<AgentTrend[]> {
  const start = toDateOnly(from)
  const end = exclusiveEnd(to)

  const [agents, activities, orders] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId, role: UserRole.SALES_AGENT, isActive: true },
      select: { id: true, username: true },
      orderBy: { username: 'asc' },
    }),
    prisma.salesDailyActivity.findMany({
      where: { tenantId, reportDate: { gte: start, lt: end } },
      include: {
        contentPosts: { where: { completed: true }, select: { id: true } },
        liveSellingMetrics: { select: { hours: true } },
        marketplaceReport: { select: { inquiries: true } },
      },
    }),
    prisma.salesDirectOrder.findMany({
      where: { tenantId, orderDate: { gte: start, lt: end } },
      select: { agentId: true, orderDate: true, totalAmount: true },
    }),
  ])

  // Build all dates in range
  const dates: string[] = []
  for (let t = start.getTime(); t < end.getTime(); t += 24 * 60 * 60 * 1000) {
    dates.push(new Date(t).toISOString().slice(0, 10))
  }

  const trends = new Map<string, AgentTrend>()
  for (const a of agents) {
    trends.set(a.id, {
      agentId: a.id,
      username: a.username,
      daily: dates.map((d) => ({ date: d, posts: 0, liveHours: 0, directSales: 0, inquiries: 0 })),
    })
  }

  function findPoint(agentId: string, dateKey: string): DailyPoint | undefined {
    const t = trends.get(agentId)
    if (!t) return undefined
    return t.daily.find((p) => p.date === dateKey)
  }

  for (const act of activities) {
    const dateKey = act.reportDate.toISOString().slice(0, 10)
    const point = findPoint(act.agentId, dateKey)
    if (!point) continue
    point.posts += act.contentPosts.length
    point.liveHours += act.liveSellingMetrics.reduce((s, m) => s + Number(m.hours), 0)
    if (act.marketplaceReport) point.inquiries += act.marketplaceReport.inquiries
  }

  for (const o of orders) {
    const dateKey = o.orderDate.toISOString().slice(0, 10)
    const point = findPoint(o.agentId, dateKey)
    if (!point) continue
    point.directSales += Number(o.totalAmount)
  }

  return Array.from(trends.values())
}

/**
 * Verify the given agent belongs to this tenant and has SALES_AGENT role.
 * Throws if not — used as a guard before delegating to per-agent reads.
 */
export async function assertAgentInTenant(tenantId: string, agentId: string): Promise<void> {
  const agent = await prisma.user.findFirst({
    where: { id: agentId, tenantId, role: UserRole.SALES_AGENT },
    select: { id: true },
  })
  if (!agent) {
    const err: Error & { statusCode?: number } = new Error('Agent not found')
    err.statusCode = 404
    throw err
  }
}
