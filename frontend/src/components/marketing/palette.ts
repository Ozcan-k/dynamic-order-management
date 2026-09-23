// Marketing Report colour system — vivid-charts house palette (validated for
// WCAG contrast + colour-blind separation on white). Rules:
//   • categorical hues are assigned in this fixed order, never cycled;
//     a 9th+ entity folds into OTHER (slate)
//   • an entity keeps the same colour on every chart (agent colour follows the
//     agent's position in the full, unfiltered agent list — not its rank)
//   • status colours are reserved for good / warning / bad and never used as series

export const CATEGORICAL = [
  '#3B82F6', // blue
  '#C2410C', // orange
  '#16A34A', // green
  '#DB2777', // pink
  '#4C1D95', // purple
  '#0E7490', // teal
  '#CA8A04', // gold (use GOLD_INK for thin lines / text)
] as const

export const OTHER = '#64748B'
export const GOLD_INK = '#A16207'

export const STATUS = {
  good: '#16A34A',
  warning: '#F59E0B',
  bad: '#DC2626',
  neutral: '#64748B',
} as const

// One fixed hue per metric so a metric looks the same in its KPI tile and every chart
export const METRIC_COLOR = {
  directSales: '#16A34A',
  orders: '#3B82F6',
  liveHours: '#DB2777',
  liveOrders: '#C2410C',
  content: '#4C1D95',
  inquiries: '#0E7490',
} as const

export const PLATFORM_COLOR: Record<string, string> = {
  FACEBOOK: '#3B82F6',
  TIKTOK: '#DB2777',
  INSTAGRAM: '#C2410C',
  SHOPEE_VIDEO: '#0E7490',
}

export const CHANNEL_COLOR: Record<string, string> = {
  FACEBOOK: '#3B82F6',
  TIKTOK: '#DB2777',
  INSTAGRAM: '#C2410C',
  MARKETPLACE: '#16A34A',
  OTHERS: OTHER,
}

// Sequential ramps (one hue, light → dark) for heat grids
export const CONTENT_RAMP = ['#EDE9FE', '#C4B5FD', '#A78BFA', '#7C3AED', '#4C1D95'] as const   // completion 0–20…80–100%
export const ACTIVITY_RAMP = ['#CCFBF1', '#5EEAD4', '#14B8A6', '#0F766E'] as const             // 1, 2, 3, 4+ stores reported

export const CONTENT_TARGET = 0.8

export function completionLevel(rate: number): number {
  return Math.min(CONTENT_RAMP.length - 1, Math.floor(rate * CONTENT_RAMP.length))
}

/** Stable agent → colour map built from the full agent list (sorted by username). */
export function buildAgentColors(agents: { id: string; username: string }[]): Map<string, string> {
  const sorted = [...agents].sort((a, b) => a.username.localeCompare(b.username))
  return new Map(sorted.map((a, i) => [a.id, i < CATEGORICAL.length ? CATEGORICAL[i] : OTHER]))
}

/** Content completion → status colour. */
export function completionStatus(rate: number): { color: string; label: 'On track' | 'Behind' | 'Off track' } {
  if (rate >= CONTENT_TARGET) return { color: STATUS.good, label: 'On track' }
  if (rate >= 0.5) return { color: STATUS.warning, label: 'Behind' }
  return { color: STATUS.bad, label: 'Off track' }
}
