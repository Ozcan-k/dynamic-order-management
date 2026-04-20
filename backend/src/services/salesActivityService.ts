import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import {
  CONTENT_POST_MATRIX,
  ContentPostType,
  LIVE_SELLING_PLATFORMS,
  SalesPlatform,
  SALES_STORES,
  type SalesDayMetrics,
} from '@dom/shared'

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
const MonthString = z.string().regex(/^\d{4}-\d{2}$/, 'Month must be YYYY-MM')
const StoreName = z.enum(SALES_STORES as readonly [string, ...string[]])

export const ContentPostInput = z.object({
  platform: z.nativeEnum(SalesPlatform),
  postType: z.nativeEnum(ContentPostType),
  completed: z.boolean(),
  note: z.string().max(500).nullish(),
})

export const LiveSellingInput = z.object({
  platform: z.nativeEnum(SalesPlatform),
  hours: z.number().min(0).max(24),
  followers: z.number().int().min(0),
  likes: z.number().int().min(0),
  views: z.number().int().min(0),
  shares: z.number().int().min(0),
  comments: z.number().int().min(0),
  orders: z.number().int().min(0),
})

export const MarketplaceInput = z.object({
  inquiries: z.number().int().min(0),
  listingsCreated: z.number().int().min(0),
})

export const UpsertActivitySchema = z.object({
  date: DateString,
  store: StoreName,
  contentPosts: z.array(ContentPostInput),
  liveSelling: z.array(LiveSellingInput),
  marketplace: MarketplaceInput,
})

export const GetActivityQuerySchema = z.object({
  date: DateString,
  store: StoreName,
})

export const CalendarQuerySchema = z.object({
  month: MonthString,
})

export const DayDetailQuerySchema = z.object({
  date: DateString,
})

export type UpsertActivityInput = z.infer<typeof UpsertActivitySchema>

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert YYYY-MM-DD to UTC midnight Date for Prisma @db.Date storage. */
function toDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`)
}

/** Default empty content-post skeleton based on the platform/post-type matrix. */
function defaultContentPosts() {
  const out: { platform: SalesPlatform; postType: ContentPostType; completed: boolean; note: string | null }[] = []
  for (const platform of Object.keys(CONTENT_POST_MATRIX) as SalesPlatform[]) {
    for (const postType of CONTENT_POST_MATRIX[platform]) {
      out.push({ platform, postType, completed: false, note: null })
    }
  }
  return out
}

function defaultLiveSelling() {
  return LIVE_SELLING_PLATFORMS.map((platform) => ({
    platform,
    hours: 0,
    followers: 0,
    likes: 0,
    views: 0,
    shares: 0,
    comments: 0,
    orders: 0,
  }))
}

function defaultMarketplace() {
  return { inquiries: 0, listingsCreated: 0 }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get one day + one store activity. Returns a fully-populated skeleton when no
 * record exists yet — frontend can render the form without null checks.
 */
export async function getActivity(tenantId: string, agentId: string, date: string, store: string) {
  const reportDate = toDateOnly(date)

  const activity = await prisma.salesDailyActivity.findUnique({
    where: { agentId_reportDate_storeName: { agentId, reportDate, storeName: store } },
    include: {
      contentPosts: true,
      liveSellingMetrics: true,
      marketplaceReport: true,
    },
  })

  if (!activity || activity.tenantId !== tenantId) {
    return {
      date,
      store,
      contentPosts: defaultContentPosts(),
      liveSelling: defaultLiveSelling(),
      marketplace: defaultMarketplace(),
    }
  }

  // Merge stored values onto the skeleton so removed/added platform-postType combos stay consistent
  const skeleton = defaultContentPosts()
  const contentPosts = skeleton.map((slot) => {
    const found = activity.contentPosts.find((p) => p.platform === slot.platform && p.postType === slot.postType)
    return found
      ? { platform: found.platform as SalesPlatform, postType: found.postType as ContentPostType, completed: found.completed, note: found.note }
      : slot
  })

  const liveSkeleton = defaultLiveSelling()
  const liveSelling = liveSkeleton.map((slot) => {
    const found = activity.liveSellingMetrics.find((l) => l.platform === slot.platform)
    if (!found) return slot
    return {
      platform: found.platform as SalesPlatform,
      hours: Number(found.hours),
      followers: found.followers,
      likes: found.likes,
      views: found.views,
      shares: found.shares,
      comments: found.comments,
      orders: found.orders,
    }
  })

  const marketplace = activity.marketplaceReport
    ? { inquiries: activity.marketplaceReport.inquiries, listingsCreated: activity.marketplaceReport.listingsCreated }
    : defaultMarketplace()

  return { date, store, contentPosts, liveSelling, marketplace }
}

/**
 * Upsert a single day+store activity. Idempotent — safe for auto-save.
 * Replaces children atomically inside a transaction to avoid stale rows.
 */
export async function upsertActivity(tenantId: string, agentId: string, input: UpsertActivityInput) {
  const reportDate = toDateOnly(input.date)

  return prisma.$transaction(async (tx) => {
    const activity = await tx.salesDailyActivity.upsert({
      where: { agentId_reportDate_storeName: { agentId, reportDate, storeName: input.store } },
      create: { tenantId, agentId, reportDate, storeName: input.store },
      update: {},
    })

    // Replace children — simpler and safer than per-row diff for ≤20 rows total
    await tx.salesContentPost.deleteMany({ where: { activityId: activity.id } })
    if (input.contentPosts.length > 0) {
      await tx.salesContentPost.createMany({
        data: input.contentPosts.map((p) => ({
          activityId: activity.id,
          platform: p.platform,
          postType: p.postType,
          completed: p.completed,
          note: p.note ?? null,
        })),
      })
    }

    await tx.salesLiveSellingMetric.deleteMany({ where: { activityId: activity.id } })
    if (input.liveSelling.length > 0) {
      await tx.salesLiveSellingMetric.createMany({
        data: input.liveSelling.map((l) => ({
          activityId: activity.id,
          platform: l.platform,
          hours: new Prisma.Decimal(l.hours),
          followers: l.followers,
          likes: l.likes,
          views: l.views,
          shares: l.shares,
          comments: l.comments,
          orders: l.orders,
        })),
      })
    }

    await tx.salesMarketplaceReport.upsert({
      where: { activityId: activity.id },
      create: {
        activityId: activity.id,
        inquiries: input.marketplace.inquiries,
        listingsCreated: input.marketplace.listingsCreated,
      },
      update: {
        inquiries: input.marketplace.inquiries,
        listingsCreated: input.marketplace.listingsCreated,
      },
    })

    return { activityId: activity.id }
  })
}

/**
 * Per-day rollup for an agent's selected month. Used by the calendar view.
 * directSalesAmount comes from SalesDirectOrder (independent table); 0 if no orders.
 */
export async function getCalendar(tenantId: string, agentId: string, month: string): Promise<SalesDayMetrics[]> {
  const [yearStr, monthStr] = month.split('-')
  const year = Number(yearStr)
  const monthNum = Number(monthStr)
  const start = new Date(Date.UTC(year, monthNum - 1, 1))
  const end = new Date(Date.UTC(year, monthNum, 1))

  const [activities, directOrders] = await Promise.all([
    prisma.salesDailyActivity.findMany({
      where: { tenantId, agentId, reportDate: { gte: start, lt: end } },
      include: {
        contentPosts: { where: { completed: true } },
        liveSellingMetrics: true,
        marketplaceReport: true,
      },
    }),
    prisma.salesDirectOrder.findMany({
      where: { tenantId, agentId, orderDate: { gte: start, lt: end } },
      select: { orderDate: true, totalAmount: true },
    }),
  ])

  // Aggregate per day across all stores
  const byDay = new Map<string, SalesDayMetrics>()

  function ensure(dateKey: string): SalesDayMetrics {
    let entry = byDay.get(dateKey)
    if (!entry) {
      entry = { date: dateKey, contentPostsCount: 0, liveSellingHours: 0, directSalesAmount: 0, marketplaceInquiries: 0 }
      byDay.set(dateKey, entry)
    }
    return entry
  }

  for (const activity of activities) {
    const dateKey = activity.reportDate.toISOString().slice(0, 10)
    const entry = ensure(dateKey)
    entry.contentPostsCount += activity.contentPosts.length
    entry.liveSellingHours += activity.liveSellingMetrics.reduce((sum, m) => sum + Number(m.hours), 0)
    if (activity.marketplaceReport) entry.marketplaceInquiries += activity.marketplaceReport.inquiries
  }

  for (const order of directOrders) {
    const dateKey = order.orderDate.toISOString().slice(0, 10)
    const entry = ensure(dateKey)
    entry.directSalesAmount += Number(order.totalAmount)
  }

  return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Per-day breakdown for the calendar popup. Returns per-store rollups +
 * full direct order list for the day. Used by the SalesDashboard modal.
 */
export async function getDayDetail(tenantId: string, agentId: string, date: string) {
  const reportDate = toDateOnly(date)

  const [activities, directOrders] = await Promise.all([
    prisma.salesDailyActivity.findMany({
      where: { tenantId, agentId, reportDate },
      include: {
        contentPosts: { where: { completed: true } },
        liveSellingMetrics: true,
        marketplaceReport: true,
      },
    }),
    prisma.salesDirectOrder.findMany({
      where: { tenantId, agentId, orderDate: reportDate },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const stores = activities
    .map((a) => ({
      store: a.storeName,
      contentPostsCount: a.contentPosts.length,
      liveSellingHours: a.liveSellingMetrics.reduce((sum, m) => sum + Number(m.hours), 0),
      marketplaceInquiries: a.marketplaceReport?.inquiries ?? 0,
    }))
    .filter((s) => s.contentPostsCount > 0 || s.liveSellingHours > 0 || s.marketplaceInquiries > 0)
    .sort((a, b) => a.store.localeCompare(b.store))

  return {
    date,
    stores,
    directOrders: directOrders.map((o) => ({
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
    })),
  }
}
