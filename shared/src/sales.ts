// ─── Sales Agent Module — shared constants & enums ──────────────────────────

export const SALES_STORES = [
  'Picky Farm',
  'Eco Tree',
  'Chef Mela',
  'Super Food',
  'Every Day Bite',
  'Nature Blend Shop',
  'ProActive Pantry',
  'Green Tree',
  'Nature Blend Online',
  'Nature Finest',
  'Super Essential',
  'Greenfuel',
  'Zozo Healthy',
  'Raven Wellness',
  'Master Chef',
  'Daily Nut Box',
  'Sport Snack',
] as const

// Seed list only (v2.92.0): live store names are managed in Settings → Stores (`stores`
// table), so a store name is any string from that table.
export type SalesStore = string

export enum SalesPlatform {
  FACEBOOK = 'FACEBOOK',
  TIKTOK = 'TIKTOK',
  INSTAGRAM = 'INSTAGRAM',
  SHOPEE_VIDEO = 'SHOPEE_VIDEO',
}

export const SALES_PLATFORM_LABELS: Record<SalesPlatform, string> = {
  [SalesPlatform.FACEBOOK]: 'Facebook',
  [SalesPlatform.TIKTOK]: 'TikTok',
  [SalesPlatform.INSTAGRAM]: 'Instagram',
  [SalesPlatform.SHOPEE_VIDEO]: 'Shopee Video',
}

export enum ContentPostType {
  POST = 'POST',
  VIDEO = 'VIDEO',
  REEL = 'REEL',
}

export const CONTENT_POST_TYPE_LABELS: Record<ContentPostType, string> = {
  [ContentPostType.POST]: 'Post',
  [ContentPostType.VIDEO]: 'Video',
  [ContentPostType.REEL]: 'Reel',
}

// Which post types each platform supports for the Content Posting (mandatory daily) section
export const CONTENT_POST_MATRIX: Record<SalesPlatform, ContentPostType[]> = {
  [SalesPlatform.FACEBOOK]:     [ContentPostType.POST, ContentPostType.VIDEO, ContentPostType.REEL],
  [SalesPlatform.TIKTOK]:       [ContentPostType.VIDEO],
  [SalesPlatform.INSTAGRAM]:    [ContentPostType.POST, ContentPostType.VIDEO, ContentPostType.REEL],
  [SalesPlatform.SHOPEE_VIDEO]: [ContentPostType.VIDEO, ContentPostType.POST],
}

// Platforms that can host live selling sessions
export const LIVE_SELLING_PLATFORMS: SalesPlatform[] = [
  SalesPlatform.FACEBOOK,
  SalesPlatform.TIKTOK,
  SalesPlatform.INSTAGRAM,
  SalesPlatform.SHOPEE_VIDEO,
]

export enum SaleChannel {
  FACEBOOK = 'FACEBOOK',
  TIKTOK = 'TIKTOK',
  INSTAGRAM = 'INSTAGRAM',
  MARKETPLACE = 'MARKETPLACE',
  OTHERS = 'OTHERS',
}

export const SALE_CHANNEL_LABELS: Record<SaleChannel, string> = {
  [SaleChannel.FACEBOOK]: 'Facebook',
  [SaleChannel.TIKTOK]: 'TikTok',
  [SaleChannel.INSTAGRAM]: 'Instagram',
  [SaleChannel.MARKETPLACE]: 'Marketplace',
  [SaleChannel.OTHERS]: 'Others',
}

// Mandatory content slots per store per day (FB 3 + TikTok 1 + IG 3 + Shopee 2 = 9).
// Content completion % = completed matrix slots / (store-days reported × this).
export const CONTENT_SLOTS_PER_STORE_DAY = Object.values(CONTENT_POST_MATRIX)
  .reduce((sum, types) => sum + types.length, 0)

// Marketing Report agent score — fixed weights, single source for backend + frontend.
export const MARKETING_SCORE_WEIGHTS = {
  posts: 1,
  liveHours: 2,
  directSalesPer1000: 1,
  inquiries: 1.5,
} as const

export function marketingScore(m: { posts: number; liveHours: number; directSales: number; inquiries: number }): number {
  const w = MARKETING_SCORE_WEIGHTS
  return m.posts * w.posts + m.liveHours * w.liveHours + (m.directSales / 1000) * w.directSalesPer1000 + m.inquiries * w.inquiries
}

export interface SalesDayMetrics {
  date: string                  // YYYY-MM-DD (Manila)
  contentPostsCount: number     // checked posts across all stores for the day
  liveSellingHours: number
  liveSellingOrderCount: number // sum of SalesLiveSellingMetric.orders for the day
  directSalesAmount: number     // PHP
  marketplaceInquiries: number
}
