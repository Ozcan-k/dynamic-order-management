// Incident Report palette + labels (v2.91.0) — kept apart from the components so
// React fast refresh stays happy.

import {
  DISCIPLINARY_ACTION_LABELS,
  DisciplinaryAction,
  INCIDENT_CATEGORY_LABELS,
  IncidentCategory,
} from '@dom/shared'

export const CATEGORY_COLOR: Record<IncidentCategory, string> = {
  [IncidentCategory.ORDER_HANDLING]: '#3B82F6',
  [IncidentCategory.INVENTORY]: '#C2410C',
  [IncidentCategory.ATTENDANCE]: '#0E7490',
  [IncidentCategory.CONDUCT_SAFETY]: '#DB2777',
  [IncidentCategory.SALES_REPORTING]: '#4C1D95',
}

export const CATEGORY_ORDER: IncidentCategory[] = [
  IncidentCategory.ORDER_HANDLING,
  IncidentCategory.INVENTORY,
  IncidentCategory.ATTENDANCE,
  IncidentCategory.CONDUCT_SAFETY,
  IncidentCategory.SALES_REPORTING,
]

export const categoryLabel = (c: IncidentCategory) => INCIDENT_CATEGORY_LABELS[c]

/** Ladder ramp — fill + readable ink for each level. */
export const ACTION_STYLE: Record<DisciplinaryAction | 'NOT_RECORDED', { fill: string; ink: string; bg: string }> = {
  NOT_RECORDED: { fill: '#CBD5E1', ink: '#475569', bg: '#F1F5F9' },
  [DisciplinaryAction.NO_ACTION]: { fill: '#94A3B8', ink: '#334155', bg: '#F1F5F9' },
  [DisciplinaryAction.COACHING]: { fill: '#FCD34D', ink: '#854D0E', bg: '#FEF9C3' },
  [DisciplinaryAction.VERBAL_WARNING]: { fill: '#FBBF24', ink: '#92400E', bg: '#FEF3C7' },
  [DisciplinaryAction.WRITTEN_WARNING]: { fill: '#F97316', ink: '#9A3412', bg: '#FFEDD5' },
  [DisciplinaryAction.FINAL_WARNING]: { fill: '#DC2626', ink: '#991B1B', bg: '#FEE2E2' },
  [DisciplinaryAction.SUSPENSION]: { fill: '#991B1B', ink: '#FFFFFF', bg: '#991B1B' },
  [DisciplinaryAction.TERMINATION]: { fill: '#450A0A', ink: '#FFFFFF', bg: '#450A0A' },
}

export const ACTION_ORDER: (DisciplinaryAction | 'NOT_RECORDED')[] = [
  DisciplinaryAction.NO_ACTION,
  DisciplinaryAction.COACHING,
  DisciplinaryAction.VERBAL_WARNING,
  DisciplinaryAction.WRITTEN_WARNING,
  DisciplinaryAction.FINAL_WARNING,
  DisciplinaryAction.SUSPENSION,
  DisciplinaryAction.TERMINATION,
  'NOT_RECORDED',
]

export function actionLabel(a: DisciplinaryAction | 'NOT_RECORDED' | null | undefined): string {
  if (!a || a === 'NOT_RECORDED') return 'Not recorded'
  return DISCIPLINARY_ACTION_LABELS[a]
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}
