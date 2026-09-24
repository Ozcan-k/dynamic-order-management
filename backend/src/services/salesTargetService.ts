import { Prisma } from '@prisma/client'
import {
  DEFAULT_SALES_TARGETS,
  SALES_TARGET_METRICS,
  SalesTargetMetric,
  UserRole,
  type AgentTargetRow,
  type MarketingTargetsResponse,
  type TargetOverride,
  type TargetProgress,
  type TargetSetting,
  type TargetSettingsResponse,
  type TargetStatus,
} from '@dom/shared'
import { prisma } from '../lib/prisma'

// Monthly sales agent targets (v2.94.0) — read-only against the data agents already enter;
// the only table written is `sales_targets` (settings). See MARKETING_TARGETS.md.

const DEFAULT_SCOPE = 'DEFAULT'
const HISTORY_MONTHS = 6

export class TargetInputError extends Error {
  statusCode = 400
}

type Actuals = Record<SalesTargetMetric, number>
const zeroActuals = (): Actuals => ({ SALES_AMOUNT: 0, ORDERS: 0, LIVE_HOURS: 0, VIDEOS: 0, POSTS: 0, INQUIRIES: 0 })

// ─── months (Manila) ─────────────────────────────────────────────────────────
function manilaToday(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)
}
function monthBounds(month: string): { from: string; to: string; days: number } {
  const [y, m] = month.split('-').map(Number)
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(days).padStart(2, '0')}`, days }
}
function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}

// ─── settings ────────────────────────────────────────────────────────────────
async function loadAgents(tenantId: string, agentId?: string) {
  return prisma.user.findMany({
    where: { tenantId, role: UserRole.SALES_AGENT, isActive: true, ...(agentId ? { id: agentId } : {}) },
    select: { id: true, username: true },
    orderBy: { username: 'asc' },
  })
}

async function loadSettings(tenantId: string) {
  const rows = await prisma.salesTarget.findMany({ where: { tenantId } })
  const defaults = {} as Record<SalesTargetMetric, TargetSetting>
  for (const m of SALES_TARGET_METRICS) {
    const r = rows.find((x) => x.scope === DEFAULT_SCOPE && x.metric === m)
    defaults[m] = { value: r?.value ?? DEFAULT_SALES_TARGETS[m], enabled: r ? r.enabled : true }
  }
  const overrides = new Map<string, Partial<Record<SalesTargetMetric, TargetOverride>>>()
  for (const r of rows) {
    if (r.scope === DEFAULT_SCOPE || !SALES_TARGET_METRICS.includes(r.metric as SalesTargetMetric)) continue
    const o = overrides.get(r.scope) ?? {}
    o[r.metric as SalesTargetMetric] = { value: r.value, enabled: r.enabled }
    overrides.set(r.scope, o)
  }
  return { defaults, overrides }
}

/** Effective target per metric for one agent: null = switched off. */
function resolve(defaults: Record<SalesTargetMetric, TargetSetting>, o: Partial<Record<SalesTargetMetric, TargetOverride>> | undefined) {
  const out = {} as Record<SalesTargetMetric, number | null>
  for (const m of SALES_TARGET_METRICS) {
    const ov = o?.[m]
    const enabled = ov ? ov.enabled : defaults[m].enabled
    const value = ov?.value ?? defaults[m].value
    out[m] = enabled && value > 0 ? value : null
  }
  return out
}

export async function getTargetSettings(tenantId: string): Promise<TargetSettingsResponse> {
  const [agents, { defaults, overrides }] = await Promise.all([loadAgents(tenantId), loadSettings(tenantId)])
  return {
    defaults,
    agents: agents.map((a) => ({ agentId: a.id, username: a.username, overrides: overrides.get(a.id) ?? {} })),
  }
}

export interface SaveTargetsInput {
  scope: string
  metrics: { metric: SalesTargetMetric; value: number | null; enabled: boolean }[]
}

export async function saveTargetSettings(tenantId: string, userId: string, input: SaveTargetsInput): Promise<TargetSettingsResponse> {
  const isDefault = input.scope === DEFAULT_SCOPE
  if (!isDefault) {
    const agent = await prisma.user.findFirst({ where: { id: input.scope, tenantId, role: UserRole.SALES_AGENT }, select: { id: true } })
    if (!agent) throw new TargetInputError('Unknown sales agent')
  }
  for (const m of input.metrics) {
    if (m.value !== null && (!Number.isFinite(m.value) || m.value <= 0 || m.value > 1e9)) throw new TargetInputError(`Enter a positive target for ${m.metric}`)
    if (isDefault && m.value === null) throw new TargetInputError('Default targets need a value')
  }
  await prisma.$transaction(async (tx) => {
    for (const m of input.metrics) {
      const key = { tenantId_scope_metric: { tenantId, scope: input.scope, metric: m.metric } }
      // An agent row that just mirrors the default is removed so the agent keeps following it
      if (!isDefault && m.value === null && m.enabled) {
        await tx.salesTarget.deleteMany({ where: { tenantId, scope: input.scope, metric: m.metric } })
        continue
      }
      await tx.salesTarget.upsert({
        where: key,
        create: { tenantId, scope: input.scope, metric: m.metric, value: m.value, enabled: m.enabled, updatedBy: userId },
        update: { value: m.value, enabled: m.enabled, updatedBy: userId },
      })
    }
  })
  return getTargetSettings(tenantId)
}

// ─── actuals (read-only) ─────────────────────────────────────────────────────
/** agentId → month (YYYY-MM) → actuals, for [from, to]. */
async function loadActuals(tenantId: string, agentIds: string[], from: string, to: string): Promise<Map<string, Map<string, Actuals>>> {
  const out = new Map<string, Map<string, Actuals>>()
  if (agentIds.length === 0) return out
  const get = (agent: string, month: string) => {
    if (!out.has(agent)) out.set(agent, new Map())
    const m = out.get(agent)!
    if (!m.has(month)) m.set(month, zeroActuals())
    return m.get(month)!
  }
  const ids = Prisma.join(agentIds)
  const fromD = new Date(`${from}T00:00:00.000Z`)
  const toD = new Date(`${to}T00:00:00.000Z`)

  const [orders, live, posts, inquiries] = await Promise.all([
    prisma.$queryRaw<{ agent_id: string; month: string; n: bigint; amount: Prisma.Decimal | null }[]>`
      SELECT agent_id, to_char(order_date, 'YYYY-MM') AS month, count(*) AS n, sum(total_amount) AS amount
      FROM sales_direct_order
      WHERE tenant_id = ${tenantId} AND agent_id IN (${ids}) AND order_date BETWEEN ${fromD} AND ${toD}
      GROUP BY 1, 2`,
    prisma.$queryRaw<{ agent_id: string; month: string; hours: Prisma.Decimal | null; orders: bigint | null }[]>`
      SELECT a.agent_id, to_char(a.report_date, 'YYYY-MM') AS month, sum(l.hours) AS hours, sum(l.orders) AS orders
      FROM sales_daily_activity a JOIN sales_live_selling_metric l ON l.activity_id = a.id
      WHERE a.tenant_id = ${tenantId} AND a.agent_id IN (${ids}) AND a.report_date BETWEEN ${fromD} AND ${toD}
      GROUP BY 1, 2`,
    prisma.$queryRaw<{ agent_id: string; month: string; videos: bigint; posts: bigint }[]>`
      SELECT a.agent_id, to_char(a.report_date, 'YYYY-MM') AS month,
        count(*) FILTER (WHERE p.post_type IN ('VIDEO', 'REEL')) AS videos,
        count(*) FILTER (WHERE p.post_type = 'POST') AS posts
      FROM sales_daily_activity a JOIN sales_content_post p ON p.activity_id = a.id
      WHERE a.tenant_id = ${tenantId} AND a.agent_id IN (${ids}) AND a.report_date BETWEEN ${fromD} AND ${toD} AND p.completed
      GROUP BY 1, 2`,
    prisma.$queryRaw<{ agent_id: string; month: string; inquiries: bigint | null }[]>`
      SELECT a.agent_id, to_char(a.report_date, 'YYYY-MM') AS month, sum(r.inquiries) AS inquiries
      FROM sales_daily_activity a JOIN sales_marketplace_report r ON r.activity_id = a.id
      WHERE a.tenant_id = ${tenantId} AND a.agent_id IN (${ids}) AND a.report_date BETWEEN ${fromD} AND ${toD}
      GROUP BY 1, 2`,
  ])
  for (const r of orders) {
    const x = get(r.agent_id, r.month)
    x.SALES_AMOUNT += Number(r.amount ?? 0)
    x.ORDERS += Number(r.n)
  }
  for (const r of live) {
    const x = get(r.agent_id, r.month)
    x.LIVE_HOURS += Number(r.hours ?? 0)
    x.ORDERS += Number(r.orders ?? 0)
  }
  for (const r of posts) {
    const x = get(r.agent_id, r.month)
    x.VIDEOS += Number(r.videos)
    x.POSTS += Number(r.posts)
  }
  for (const r of inquiries) get(r.agent_id, r.month).INQUIRIES += Number(r.inquiries ?? 0)
  return out
}

// ─── progress ────────────────────────────────────────────────────────────────
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d

function progress(metric: SalesTargetMetric, target: number | null, actual: number, phase: MarketingTargetsResponse['phase'], elapsed: number, days: number): TargetProgress {
  if (target === null) return { metric, target: null, actual: round(actual), pct: null, expected: null, projected: null, status: null }
  const pct = actual / target
  let expected: number | null = null
  let projected: number | null = null
  let status: TargetStatus
  if (phase === 'future') status = 'UPCOMING'
  else if (actual >= target) status = 'MET'
  else if (phase === 'past') status = 'MISSED'
  else {
    expected = (target * elapsed) / days
    status = actual >= expected ? 'ON_TRACK' : 'BEHIND'
  }
  if (phase === 'current') {
    expected = round((target * elapsed) / days)
    projected = elapsed > 0 ? round((actual / elapsed) * days) : 0
  }
  return { metric, target, actual: round(actual), pct: round(pct, 4), expected, projected, status }
}

function overallOf(list: TargetProgress[]): number | null {
  const on = list.filter((p) => p.pct !== null)
  if (on.length === 0) return null
  return round(on.reduce((s, p) => s + Math.min(1, p.pct!), 0) / on.length, 4)
}

export async function getMarketingTargets(tenantId: string, month: string, agentId?: string): Promise<MarketingTargetsResponse> {
  const today = manilaToday()
  const thisMonth = today.slice(0, 7)
  const { from, to, days } = monthBounds(month)
  const phase: MarketingTargetsResponse['phase'] = month < thisMonth ? 'past' : month > thisMonth ? 'future' : 'current'
  const elapsed = phase === 'past' ? days : phase === 'future' ? 0 : Number(today.slice(8, 10))

  const historyMonths = Array.from({ length: HISTORY_MONTHS }, (_, i) => shiftMonth(month, i - (HISTORY_MONTHS - 1)))
  const [agents, { defaults, overrides }] = await Promise.all([loadAgents(tenantId, agentId), loadSettings(tenantId)])
  const actuals = await loadActuals(tenantId, agents.map((a) => a.id), `${historyMonths[0]}-01`, to)

  const rows: AgentTargetRow[] = agents.map((a) => {
    const targets = resolve(defaults, overrides.get(a.id))
    const act = actuals.get(a.id)?.get(month) ?? zeroActuals()
    const metrics = SALES_TARGET_METRICS.map((m) => progress(m, targets[m], act[m], phase, elapsed, days))
    return { agentId: a.id, username: a.username, overall: overallOf(metrics), custom: !!overrides.get(a.id), metrics }
  })

  const team = SALES_TARGET_METRICS.map((m, i) => {
    let target = 0, actual = 0, any = false
    for (const r of rows) {
      const p = r.metrics[i]
      if (p.target === null) continue
      any = true
      target += p.target
      actual += p.actual
    }
    return progress(m, any ? target : null, actual, phase, elapsed, days)
  })

  const history = {
    months: historyMonths,
    rows: agents.map((a) => {
      const targets = resolve(defaults, overrides.get(a.id))
      return {
        agentId: a.id,
        overall: historyMonths.map((hm) => {
          if (hm > thisMonth) return null
          const act = actuals.get(a.id)?.get(hm) ?? zeroActuals()
          const hb = monthBounds(hm)
          const hp: MarketingTargetsResponse['phase'] = hm < thisMonth ? 'past' : 'current'
          const he = hp === 'past' ? hb.days : Number(today.slice(8, 10))
          return overallOf(SALES_TARGET_METRICS.map((m) => progress(m, targets[m], act[m], hp, he, hb.days)))
        }),
      }
    }),
  }

  return { month, from, to, daysInMonth: days, elapsedDays: elapsed, phase, agents: rows, team, history }
}
