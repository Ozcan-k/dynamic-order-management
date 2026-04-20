import { api } from './client'
import type { ActivityResponse, CalendarResponse, DayDetailResponse } from './sales'

export interface MarketingAgent {
  id: string
  username: string
  createdAt: string
}

export interface LeaderboardRow {
  agentId: string
  username: string
  posts: number
  liveHours: number
  directSales: number
  inquiries: number
  ordersCount: number
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

export async function fetchMarketingAgents(): Promise<MarketingAgent[]> {
  const { data } = await api.get<{ agents: MarketingAgent[] }>('/marketing/agents')
  return data.agents
}

export async function fetchLeaderboard(from: string, to: string): Promise<LeaderboardRow[]> {
  const { data } = await api.get<{ rows: LeaderboardRow[] }>('/marketing/leaderboard', { params: { from, to } })
  return data.rows
}

export async function fetchComparison(from: string, to: string): Promise<AgentTrend[]> {
  const { data } = await api.get<{ trends: AgentTrend[] }>('/marketing/comparison', { params: { from, to } })
  return data.trends
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
