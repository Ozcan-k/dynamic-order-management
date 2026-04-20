import { ContentPostType, SalesDayMetrics, SalesPlatform } from '@dom/shared'
import { api } from './client'

export interface ContentPostState {
  platform: SalesPlatform
  postType: ContentPostType
  completed: boolean
  note: string | null
}

export interface LiveSellingState {
  platform: SalesPlatform
  hours: number
  followers: number
  likes: number
  views: number
  shares: number
  comments: number
  orders: number
}

export interface MarketplaceState {
  inquiries: number
  listingsCreated: number
}

export interface ActivityResponse {
  date: string
  store: string
  contentPosts: ContentPostState[]
  liveSelling: LiveSellingState[]
  marketplace: MarketplaceState
}

export interface CalendarResponse {
  month: string
  days: SalesDayMetrics[]
}

export async function fetchActivity(date: string, store: string): Promise<ActivityResponse> {
  const { data } = await api.get<ActivityResponse>('/sales/activity', { params: { date, store } })
  return data
}

export async function saveActivity(payload: ActivityResponse): Promise<void> {
  await api.put('/sales/activity', {
    date: payload.date,
    store: payload.store,
    contentPosts: payload.contentPosts,
    liveSelling: payload.liveSelling,
    marketplace: payload.marketplace,
  })
}

export async function fetchCalendar(month: string): Promise<CalendarResponse> {
  const { data } = await api.get<CalendarResponse>('/sales/calendar', { params: { month } })
  return data
}
