import { ContentPostType, SaleChannel, SalesDayMetrics, SalesPlatform } from '@dom/shared'
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

export interface DayDetailStore {
  store: string
  contentPostsCount: number
  liveSellingHours: number
  marketplaceInquiries: number
}

export interface DayDetailResponse {
  date: string
  stores: DayDetailStore[]
  directOrders: DirectOrder[]
}

export async function fetchDayDetail(date: string): Promise<DayDetailResponse> {
  const { data } = await api.get<DayDetailResponse>('/sales/day-detail', { params: { date } })
  return data
}

// ─── Direct Orders ───────────────────────────────────────────────────────────

export interface DirectOrderItem {
  id?: string
  productName: string
  price: number
  quantity: number
}

export interface DirectOrder {
  id: string
  date: string
  store: string
  saleChannel: SaleChannel
  companyName: string
  customerName: string
  deliveryCost: number
  totalAmount: number
  createdAt: string
  items: Required<DirectOrderItem>[]
}

export interface CreateDirectOrderPayload {
  date: string
  store: string
  saleChannel: SaleChannel
  companyName: string
  customerName: string
  deliveryCost: number
  items: DirectOrderItem[]
}

export interface ListOrdersQuery {
  date?: string
  from?: string
  to?: string
  store?: string
  channel?: SaleChannel
}

export async function createDirectOrder(payload: CreateDirectOrderPayload): Promise<DirectOrder> {
  const { data } = await api.post<{ order: DirectOrder }>('/sales/orders', payload)
  return data.order
}

export async function fetchOwnDirectOrders(query: ListOrdersQuery): Promise<DirectOrder[]> {
  const { data } = await api.get<{ orders: DirectOrder[] }>('/sales/orders', { params: query })
  return data.orders
}

export type SuggestField = 'companies' | 'customers' | 'products'

export async function fetchSuggestions(field: SuggestField, q: string): Promise<string[]> {
  if (!q.trim()) return []
  const { data } = await api.get<{ suggestions: string[] }>(`/sales/suggest/${field}`, { params: { q } })
  return data.suggestions
}
