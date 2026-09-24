// ════════════════════════════════════════════════════════════════════════════
// MARKETING REPORT — monthly sales agent targets (v2.94.0). See MARKETING_TARGETS.md.
// ════════════════════════════════════════════════════════════════════════════

export enum SalesTargetMetric {
  SALES_AMOUNT = 'SALES_AMOUNT',
  ORDERS = 'ORDERS',
  LIVE_HOURS = 'LIVE_HOURS',
  VIDEOS = 'VIDEOS',
  POSTS = 'POSTS',
  INQUIRIES = 'INQUIRIES',
}

export const SALES_TARGET_METRICS: SalesTargetMetric[] = [
  SalesTargetMetric.SALES_AMOUNT,
  SalesTargetMetric.ORDERS,
  SalesTargetMetric.LIVE_HOURS,
  SalesTargetMetric.VIDEOS,
  SalesTargetMetric.POSTS,
  SalesTargetMetric.INQUIRIES,
]

export const SALES_TARGET_INFO: Record<SalesTargetMetric, { label: string; short: string; unit: 'php' | 'count' | 'hours'; measures: string }> = {
  [SalesTargetMetric.SALES_AMOUNT]: { label: 'Sales', short: 'Sales', unit: 'php', measures: 'Direct order totals' },
  [SalesTargetMetric.ORDERS]: { label: 'Online orders', short: 'Orders', unit: 'count', measures: 'Direct orders + live selling orders' },
  [SalesTargetMetric.LIVE_HOURS]: { label: 'Live hours', short: 'Live', unit: 'hours', measures: 'Live selling hours' },
  [SalesTargetMetric.VIDEOS]: { label: 'Video posts', short: 'Videos', unit: 'count', measures: 'Completed Video + Reel posts' },
  [SalesTargetMetric.POSTS]: { label: 'Content posts', short: 'Posts', unit: 'count', measures: 'Completed photo posts' },
  [SalesTargetMetric.INQUIRIES]: { label: 'New inquiries', short: 'Inquiries', unit: 'count', measures: 'Marketplace inquiries' },
}

/** Monthly targets per sales agent until an ADMIN changes them (Settings live in `sales_targets`). */
export const DEFAULT_SALES_TARGETS: Record<SalesTargetMetric, number> = {
  [SalesTargetMetric.SALES_AMOUNT]: 300_000,
  [SalesTargetMetric.ORDERS]: 150,
  [SalesTargetMetric.LIVE_HOURS]: 52,
  [SalesTargetMetric.VIDEOS]: 30,
  [SalesTargetMetric.POSTS]: 60,
  [SalesTargetMetric.INQUIRIES]: 100,
}

export type TargetStatus = 'MET' | 'ON_TRACK' | 'BEHIND' | 'MISSED' | 'UPCOMING'

export interface TargetProgress {
  metric: SalesTargetMetric
  /** null = this metric is switched off for the agent */
  target: number | null
  actual: number
  /** actual ÷ target (uncapped); null when switched off */
  pct: number | null
  /** current month only: target × elapsed days ÷ days in month */
  expected: number | null
  /** current month only: actual ÷ elapsed days × days in month */
  projected: number | null
  status: TargetStatus | null
}

export interface AgentTargetRow {
  agentId: string
  username: string
  /** average of the enabled metrics' % each capped at 100 %; null when no metric is enabled */
  overall: number | null
  /** true when the agent has at least one override */
  custom: boolean
  metrics: TargetProgress[]
}

export interface MarketingTargetsResponse {
  month: string // YYYY-MM
  from: string
  to: string
  daysInMonth: number
  /** days of the month that have passed including today (0 for a future month, all for a past one) */
  elapsedDays: number
  phase: 'past' | 'current' | 'future'
  agents: AgentTargetRow[]
  /** team = sum over agents with the metric enabled */
  team: TargetProgress[]
  history: { months: string[]; rows: { agentId: string; overall: (number | null)[] }[] }
}

export interface TargetSetting {
  value: number
  enabled: boolean
}

export interface TargetOverride {
  /** null = use the default value */
  value: number | null
  enabled: boolean
}

export interface TargetSettingsResponse {
  defaults: Record<SalesTargetMetric, TargetSetting>
  agents: { agentId: string; username: string; overrides: Partial<Record<SalesTargetMetric, TargetOverride>> }[]
}
