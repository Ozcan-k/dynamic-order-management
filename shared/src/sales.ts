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

export type SalesStore = typeof SALES_STORES[number]

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

export interface SalesDayMetrics {
  date: string                  // YYYY-MM-DD (Manila)
  contentPostsCount: number     // checked posts across all stores for the day
  liveSellingHours: number
  liveSellingOrderCount: number // sum of SalesLiveSellingMetric.orders for the day
  directSalesAmount: number     // PHP
  marketplaceInquiries: number
}
