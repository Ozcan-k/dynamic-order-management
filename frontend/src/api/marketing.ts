import { api } from './client'
import type { MarketingTargetsResponse, SalesTargetMetric, TargetSettingsResponse } from '@dom/shared'
import type {
  ActivityResponse,
  CalendarResponse,
  CreateDirectOrderPayload,
  DayDetailResponse,
  DirectOrder,
} from './sales'

export interface MarketingAgent {
  id: string
  username: string
  createdAt: string
}

export async function fetchMarketingAgents(): Promise<MarketingAgent[]> {
  const { data } = await api.get<{ agents: MarketingAgent[] }>('/marketing/agents')
  return data.agents
}

export async function fetchAgentCalendar(agentId: string, month: string): Promise<CalendarResponse> {
  const { data } = await api.get<CalendarResponse>(`/marketing/agents/${agentId}/calendar`, { params: { month } })
  return data
}

export async function fetchAgentDayDetail(agentId: string, date: string): Promise<DayDetailResponse> {
  const { data } = await api.get<DayDetailResponse>(`/marketing/agents/${agentId}/day-detail`, { params: { date } })
  return data
}

export async function fetchAgentActivity(agentId: string, date: string, store: string): Promise<ActivityResponse> {
  const { data } = await api.get<ActivityResponse>(`/marketing/agents/${agentId}/activity`, { params: { date, store } })
  return data
}

// ─── Admin: direct order edit / delete (any agent in tenant, audit-logged) ──

export async function fetchAgentDirectOrder(id: string): Promise<DirectOrder> {
  const { data } = await api.get<{ order: DirectOrder }>(`/marketing/direct-orders/${id}`)
  return data.order
}

export async function updateAgentDirectOrder(id: string, payload: CreateDirectOrderPayload): Promise<DirectOrder> {
  const { data } = await api.put<{ order: DirectOrder }>(`/marketing/direct-orders/${id}`, payload)
  return data.order
}

export async function deleteAgentDirectOrder(id: string): Promise<void> {
  await api.delete(`/marketing/direct-orders/${id}`)
}

// ─── Analytics (v2.89, read-only) ────────────────────────────────────────────

export interface AnalyticsFilter {
  from: string
  to: string
  agentIds?: string[]
  stores?: string[]
}

export interface MarketingKpis {
  directSales: number
  orders: number
  aov: number
  liveHours: number
  liveOrders: number
  ordersPerLiveHour: number
  posts: number
  requiredPosts: number
  completionRate: number
  inquiries: number
  listings: number
  views: number
  engagement: number
  followers: number
  storeDays: number
  activeDays: number
  score: number
}

export interface AnalyticsDailyRow {
  date: string
  directSales: number
  orders: number
  liveHours: number
  liveOrders: number
  posts: number
  requiredPosts: number
  inquiries: number
}

export interface AnalyticsAgentRow extends MarketingKpis {
  agentId: string
  username: string
  daily: { date: string; directSales: number; posts: number; liveHours: number }[]
  previous: { directSales: number; posts: number; liveHours: number; score: number }
}

export interface AnalyticsBreakdowns {
  byChannel: { channel: string; directSales: number; orders: number }[]
  byStore: { store: string; directSales: number; orders: number; posts: number; requiredPosts: number; liveHours: number; liveOrders: number }[]
  byPlatform: { platform: string; posts: number; requiredPosts: number; liveHours: number; liveOrders: number; views: number; likes: number; comments: number; shares: number; followers: number }[]
  contentMatrix: { platform: string; postType: string; completed: number; required: number }[]
  topCompanies: { name: string; directSales: number; orders: number }[]
  topProducts: { name: string; quantity: number; revenue: number }[]
}

export interface AnalyticsOverview extends AnalyticsBreakdowns {
  from: string
  to: string
  previous: { from: string; to: string }
  kpis: { current: MarketingKpis; previous: MarketingKpis }
  daily: AnalyticsDailyRow[]
  previousDaily: AnalyticsDailyRow[]
  agents: AnalyticsAgentRow[]
}

export interface ActivityCell {
  date: string
  stores: number
  posts: number
  requiredPosts: number
  directSales: number
  orders: number
}

export interface AgentActivity {
  agentId: string
  username: string
  cells: ActivityCell[]
  activeDays: number
  missedDays: number
  currentStreak: number
  longestStreak: number
  lastActiveDate: string | null
}

export interface ActivityGridResponse {
  from: string
  to: string
  agents: AgentActivity[]
}

export interface AgentSummary extends AnalyticsBreakdowns {
  from: string
  to: string
  previous: { from: string; to: string }
  agentId: string
  rank: number | null
  teamSize: number
  kpis: { current: MarketingKpis; previous: MarketingKpis; teamAverage: MarketingKpis | null }
  daily: AnalyticsDailyRow[]
  previousDaily: AnalyticsDailyRow[]
  currentStreak: number
  longestStreak: number
  lastActiveDate: string | null
  recentOrders: {
    id: string
    date: string
    store: string
    channel: string
    companyName: string
    customerName: string
    total: number
    itemCount: number
  }[]
}

function analyticsParams(f: AnalyticsFilter) {
  return {
    from: f.from,
    to: f.to,
    ...(f.agentIds?.length ? { agentIds: f.agentIds.join(',') } : {}),
    ...(f.stores?.length ? { stores: f.stores.join(',') } : {}),
  }
}

export async function fetchAnalyticsOverview(f: AnalyticsFilter): Promise<AnalyticsOverview> {
  const { data } = await api.get<AnalyticsOverview>('/marketing/analytics/overview', { params: analyticsParams(f) })
  return data
}

export async function fetchActivityGrid(f: AnalyticsFilter): Promise<ActivityGridResponse> {
  const { data } = await api.get<ActivityGridResponse>('/marketing/analytics/activity-grid', { params: analyticsParams(f) })
  return data
}

export async function fetchAgentSummary(agentId: string, f: AnalyticsFilter): Promise<AgentSummary> {
  const { data } = await api.get<AgentSummary>(`/marketing/agents/${agentId}/summary`, { params: analyticsParams(f) })
  return data
}

// ─── Monthly targets (v2.94.0) ──────────────────────────────────────────────

export async function fetchMarketingTargets(month: string, agentId?: string): Promise<MarketingTargetsResponse> {
  const { data } = await api.get<MarketingTargetsResponse>('/marketing/targets', { params: { month, ...(agentId ? { agentId } : {}) } })
  return data
}

export async function fetchTargetSettings(): Promise<TargetSettingsResponse> {
  const { data } = await api.get<TargetSettingsResponse>('/marketing/targets/settings')
  return data
}

export interface SaveTargetsPayload {
  scope: string // 'DEFAULT' or a sales agent id
  metrics: { metric: SalesTargetMetric; value: number | null; enabled: boolean }[]
}

export async function saveTargetSettings(payload: SaveTargetsPayload): Promise<TargetSettingsResponse> {
  const { data } = await api.put<TargetSettingsResponse>('/marketing/targets/settings', payload)
  return data
}
