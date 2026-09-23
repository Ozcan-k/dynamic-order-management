// ─── Marketing analytics — pure aggregation (no DB access) ───────────────────
// marketingAnalyticsService loads raw rows from Prisma and hands them here, so
// every number on the Marketing Report can be verified without a database.

import {
  CONTENT_POST_MATRIX,
  CONTENT_SLOTS_PER_STORE_DAY,
  marketingScore,
} from '@dom/shared'

const DAY_MS = 24 * 60 * 60 * 1000

// ─── Raw input shapes ─────────────────────────────────────────────────────────

export interface RawActivity {
  agentId: string
  date: string            // YYYY-MM-DD
  store: string
  posts: { platform: string; postType: string; completed: boolean }[]
  live: {
    platform: string
    hours: number
    followers: number
    likes: number
    views: number
    shares: number
    comments: number
    orders: number
  }[]
  marketplace: { inquiries: number; listings: number } | null
}

export interface RawOrder {
  id: string
  agentId: string
  date: string            // YYYY-MM-DD
  store: string
  channel: string
  companyName: string
  customerName: string
  total: number
  items: { productName: string; price: number; quantity: number }[]
}

export interface AgentRef {
  id: string
  username: string
}

// ─── Output shapes ────────────────────────────────────────────────────────────

export interface MarketingKpis {
  directSales: number
  orders: number
  aov: number               // directSales / orders
  liveHours: number
  liveOrders: number
  ordersPerLiveHour: number
  posts: number             // completed mandatory content slots
  requiredPosts: number     // store-days × CONTENT_SLOTS_PER_STORE_DAY
  completionRate: number    // 0..1
  inquiries: number
  listings: number
  views: number
  engagement: number        // likes + comments + shares
  followers: number
  storeDays: number         // activity rows (agent × day × store)
  activeDays: number        // distinct agent-days with any activity or order
  score: number
}

export interface DailyRow {
  date: string
  directSales: number
  orders: number
  liveHours: number
  liveOrders: number
  posts: number
  requiredPosts: number
  inquiries: number
}

export interface AgentRow extends MarketingKpis {
  agentId: string
  username: string
  daily: { date: string; directSales: number; posts: number; liveHours: number }[]
}

export interface Breakdowns {
  byChannel: { channel: string; directSales: number; orders: number }[]
  byStore: { store: string; directSales: number; orders: number; posts: number; requiredPosts: number; liveHours: number; liveOrders: number }[]
  byPlatform: { platform: string; posts: number; requiredPosts: number; liveHours: number; liveOrders: number; views: number; likes: number; comments: number; shares: number; followers: number }[]
  contentMatrix: { platform: string; postType: string; completed: number; required: number }[]
  topCompanies: { name: string; directSales: number; orders: number }[]
  topProducts: { name: string; quantity: number; revenue: number }[]
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function shiftDate(dateStr: string, days: number): string {
  return new Date(new Date(`${dateStr}T00:00:00.000Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10)
}

/** Inclusive day count between two YYYY-MM-DD strings. */
export function dayCount(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00.000Z`).getTime() - new Date(`${from}T00:00:00.000Z`).getTime()) / DAY_MS) + 1
}

export function datesBetween(from: string, to: string): string[] {
  const n = dayCount(from, to)
  return Array.from({ length: Math.max(0, n) }, (_, i) => shiftDate(from, i))
}

/** Same-length window immediately before [from, to]. */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const n = dayCount(from, to)
  return { from: shiftDate(from, -n), to: shiftDate(from, -1) }
}

// ─── Core aggregation ─────────────────────────────────────────────────────────

const isMatrixSlot = (platform: string, postType: string) =>
  (CONTENT_POST_MATRIX as Record<string, string[]>)[platform]?.includes(postType) ?? false

function completedSlots(a: RawActivity): number {
  return a.posts.filter((p) => p.completed && isMatrixSlot(p.platform, p.postType)).length
}

function emptyKpis(): MarketingKpis {
  return {
    directSales: 0, orders: 0, aov: 0,
    liveHours: 0, liveOrders: 0, ordersPerLiveHour: 0,
    posts: 0, requiredPosts: 0, completionRate: 0,
    inquiries: 0, listings: 0,
    views: 0, engagement: 0, followers: 0,
    storeDays: 0, activeDays: 0, score: 0,
  }
}

function addActivity(k: MarketingKpis, a: RawActivity) {
  k.storeDays += 1
  k.posts += completedSlots(a)
  k.requiredPosts += CONTENT_SLOTS_PER_STORE_DAY
  for (const l of a.live) {
    k.liveHours += l.hours
    k.liveOrders += l.orders
    k.views += l.views
    k.engagement += l.likes + l.comments + l.shares
    k.followers += l.followers
  }
  if (a.marketplace) {
    k.inquiries += a.marketplace.inquiries
    k.listings += a.marketplace.listings
  }
}

function addOrder(k: MarketingKpis, o: RawOrder) {
  k.directSales += o.total
  k.orders += 1
}

function finalize(k: MarketingKpis, activeDays: number): MarketingKpis {
  k.activeDays = activeDays
  k.aov = k.orders > 0 ? k.directSales / k.orders : 0
  k.ordersPerLiveHour = k.liveHours > 0 ? k.liveOrders / k.liveHours : 0
  k.completionRate = k.requiredPosts > 0 ? k.posts / k.requiredPosts : 0
  k.score = marketingScore(k)
  return k
}

function activeAgentDays(activities: RawActivity[], orders: RawOrder[]): Set<string> {
  const s = new Set<string>()
  for (const a of activities) s.add(`${a.agentId}|${a.date}`)
  for (const o of orders) s.add(`${o.agentId}|${o.date}`)
  return s
}

export function computeKpis(activities: RawActivity[], orders: RawOrder[]): MarketingKpis {
  const k = emptyKpis()
  for (const a of activities) addActivity(k, a)
  for (const o of orders) addOrder(k, o)
  return finalize(k, activeAgentDays(activities, orders).size)
}

export function computeDaily(activities: RawActivity[], orders: RawOrder[], from: string, to: string): DailyRow[] {
  const rows = new Map<string, DailyRow>()
  for (const date of datesBetween(from, to)) {
    rows.set(date, { date, directSales: 0, orders: 0, liveHours: 0, liveOrders: 0, posts: 0, requiredPosts: 0, inquiries: 0 })
  }
  for (const a of activities) {
    const r = rows.get(a.date)
    if (!r) continue
    r.posts += completedSlots(a)
    r.requiredPosts += CONTENT_SLOTS_PER_STORE_DAY
    for (const l of a.live) { r.liveHours += l.hours; r.liveOrders += l.orders }
    if (a.marketplace) r.inquiries += a.marketplace.inquiries
  }
  for (const o of orders) {
    const r = rows.get(o.date)
    if (!r) continue
    r.directSales += o.total
    r.orders += 1
  }
  return Array.from(rows.values())
}

/** One row per agent (zero rows included so the leaderboard stays stable). */
export function computeAgents(
  agents: AgentRef[],
  activities: RawActivity[],
  orders: RawOrder[],
  from: string,
  to: string,
): AgentRow[] {
  const actBy = groupBy(activities, (a) => a.agentId)
  const ordBy = groupBy(orders, (o) => o.agentId)
  return agents.map((ag) => {
    const acts = actBy.get(ag.id) ?? []
    const ords = ordBy.get(ag.id) ?? []
    const daily = computeDaily(acts, ords, from, to).map((d) => ({
      date: d.date, directSales: d.directSales, posts: d.posts, liveHours: d.liveHours,
    }))
    return { agentId: ag.id, username: ag.username, ...computeKpis(acts, ords), daily }
  })
}

export function computeBreakdowns(activities: RawActivity[], orders: RawOrder[]): Breakdowns {
  const byChannel = new Map<string, Breakdowns['byChannel'][number]>()
  const byStore = new Map<string, Breakdowns['byStore'][number]>()
  const byPlatform = new Map<string, Breakdowns['byPlatform'][number]>()
  const matrix = new Map<string, Breakdowns['contentMatrix'][number]>()
  const companies = new Map<string, Breakdowns['topCompanies'][number]>()
  const products = new Map<string, Breakdowns['topProducts'][number]>()

  const store = (name: string) => getOrInit(byStore, name, () => ({
    store: name, directSales: 0, orders: 0, posts: 0, requiredPosts: 0, liveHours: 0, liveOrders: 0,
  }))
  const platform = (name: string) => getOrInit(byPlatform, name, () => ({
    platform: name, posts: 0, requiredPosts: 0, liveHours: 0, liveOrders: 0, views: 0, likes: 0, comments: 0, shares: 0, followers: 0,
  }))

  // Seed matrix + platforms in a fixed order so charts don't reshuffle between ranges
  for (const [p, types] of Object.entries(CONTENT_POST_MATRIX)) {
    platform(p)
    for (const t of types) matrix.set(`${p}|${t}`, { platform: p, postType: t, completed: 0, required: 0 })
  }

  for (const a of activities) {
    const s = store(a.store)
    const done = completedSlots(a)
    s.posts += done
    s.requiredPosts += CONTENT_SLOTS_PER_STORE_DAY

    for (const cell of matrix.values()) {
      cell.required += 1
      platform(cell.platform).requiredPosts += 1
    }
    for (const p of a.posts) {
      if (!p.completed || !isMatrixSlot(p.platform, p.postType)) continue
      matrix.get(`${p.platform}|${p.postType}`)!.completed += 1
      platform(p.platform).posts += 1
    }
    for (const l of a.live) {
      const pl = platform(l.platform)
      pl.liveHours += l.hours
      pl.liveOrders += l.orders
      pl.views += l.views
      pl.likes += l.likes
      pl.comments += l.comments
      pl.shares += l.shares
      pl.followers += l.followers
      s.liveHours += l.hours
      s.liveOrders += l.orders
    }
  }

  for (const o of orders) {
    const ch = getOrInit(byChannel, o.channel, () => ({ channel: o.channel, directSales: 0, orders: 0 }))
    ch.directSales += o.total
    ch.orders += 1
    const s = store(o.store)
    s.directSales += o.total
    s.orders += 1
    const companyName = o.companyName.trim() || '—'
    const co = getOrInit(companies, companyName.toLowerCase(), () => ({ name: companyName, directSales: 0, orders: 0 }))
    co.directSales += o.total
    co.orders += 1
    for (const it of o.items) {
      const productName = it.productName.trim()
      if (!productName) continue
      const pr = getOrInit(products, productName.toLowerCase(), () => ({ name: productName, quantity: 0, revenue: 0 }))
      pr.quantity += it.quantity
      pr.revenue += it.price * it.quantity
    }
  }

  return {
    byChannel: [...byChannel.values()].sort((a, b) => b.directSales - a.directSales),
    byStore: [...byStore.values()].sort((a, b) => b.directSales - a.directSales || b.posts - a.posts),
    byPlatform: [...byPlatform.values()],
    contentMatrix: [...matrix.values()],
    topCompanies: [...companies.values()].sort((a, b) => b.directSales - a.directSales).slice(0, 10),
    topProducts: [...products.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
  }
}

// ─── Activity / consistency ───────────────────────────────────────────────────

export interface ActivityCell {
  date: string
  stores: number            // store-days reported
  posts: number
  requiredPosts: number
  directSales: number
  orders: number
}

export interface AgentActivity {
  agentId: string
  username: string
  cells: ActivityCell[]     // one per date in range (zeros for missed days)
  activeDays: number
  missedDays: number
  currentStreak: number     // consecutive active days ending at `to` (or the day before, if `to` has nothing yet)
  longestStreak: number     // within the lookback window
  lastActiveDate: string | null
}

/**
 * @param activeDatesByAgent all active dates per agent in a lookback window ending at `to`
 *        (used for streaks + last-active, which must see beyond the selected range)
 */
export function computeActivityGrid(
  agents: AgentRef[],
  activities: RawActivity[],
  orders: RawOrder[],
  from: string,
  to: string,
  activeDatesByAgent: Map<string, Set<string>>,
): AgentActivity[] {
  const dates = datesBetween(from, to)
  return agents.map((ag) => {
    const cells = new Map<string, ActivityCell>(
      dates.map((date) => [date, { date, stores: 0, posts: 0, requiredPosts: 0, directSales: 0, orders: 0 }]),
    )
    for (const a of activities) {
      if (a.agentId !== ag.id) continue
      const c = cells.get(a.date)
      if (!c) continue
      c.stores += 1
      c.posts += completedSlots(a)
      c.requiredPosts += CONTENT_SLOTS_PER_STORE_DAY
    }
    for (const o of orders) {
      if (o.agentId !== ag.id) continue
      const c = cells.get(o.date)
      if (!c) continue
      c.directSales += o.total
      c.orders += 1
    }
    const list = [...cells.values()]
    const activeDays = list.filter((c) => c.stores > 0 || c.orders > 0).length
    const active = activeDatesByAgent.get(ag.id) ?? new Set<string>()
    return {
      agentId: ag.id,
      username: ag.username,
      cells: list,
      activeDays,
      missedDays: list.length - activeDays,
      ...streaks(active, to),
    }
  })
}

export function streaks(active: Set<string>, to: string): { currentStreak: number; longestStreak: number; lastActiveDate: string | null } {
  if (active.size === 0) return { currentStreak: 0, longestStreak: 0, lastActiveDate: null }
  const sorted = [...active].filter((d) => d <= to).sort()
  if (sorted.length === 0) return { currentStreak: 0, longestStreak: 0, lastActiveDate: null }

  let longest = 1
  let run = 1
  for (let i = 1; i < sorted.length; i++) {
    run = sorted[i] === shiftDate(sorted[i - 1], 1) ? run + 1 : 1
    longest = Math.max(longest, run)
  }

  // Today may not be reported yet — a streak ending yesterday is still "current"
  let cursor = active.has(to) ? to : shiftDate(to, -1)
  let current = 0
  while (active.has(cursor)) {
    current += 1
    cursor = shiftDate(cursor, -1)
  }
  return { currentStreak: current, longestStreak: longest, lastActiveDate: sorted[sorted.length - 1] }
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const it of items) {
    const k = key(it)
    const arr = m.get(k)
    if (arr) arr.push(it)
    else m.set(k, [it])
  }
  return m
}

function getOrInit<K, V>(m: Map<K, V>, k: K, init: () => V): V {
  let v = m.get(k)
  if (v === undefined) {
    v = init()
    m.set(k, v)
  }
  return v
}
