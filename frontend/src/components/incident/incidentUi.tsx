// Incident Report visual components (v2.91.0): action pill, occurrence badge and
// ladder dots. Colour always ships with a text label — the ladder is a single warm
// ramp (light → dark = more severe). Palette + labels live in incidentPalette.ts.

import {
  DISCIPLINARY_ACTION_LABELS,
  DISCIPLINARY_LEVEL,
  DisciplinaryAction,
  type IncidentOccurrence,
} from '@dom/shared'
import { ACTION_ORDER, ACTION_STYLE, actionLabel, ordinal } from './incidentPalette'

/** "Written Warning · 2nd" pill (or a muted "Not recorded"). */
export function ActionPill({ action, warningNo, compact }: { action: DisciplinaryAction | null | undefined; warningNo?: number | null; compact?: boolean }) {
  const key = action ?? 'NOT_RECORDED'
  const st = ACTION_STYLE[key]
  return (
    <span
      className={`inc-pill${action ? '' : ' inc-pill--none'}`}
      style={{ background: st.bg, color: st.ink, borderColor: action ? st.fill : undefined }}
      title={warningNo ? `${actionLabel(action)} — ${ordinal(warningNo)} warning for this person` : actionLabel(action)}
    >
      {action && <i style={{ background: st.fill }} />}
      {compact && action ? shortAction(action) : actionLabel(action)}
      {warningNo ? <b>· {ordinal(warningNo)}</b> : null}
    </span>
  )
}

function shortAction(a: DisciplinaryAction): string {
  switch (a) {
    case DisciplinaryAction.VERBAL_WARNING: return 'Verbal'
    case DisciplinaryAction.WRITTEN_WARNING: return 'Written'
    case DisciplinaryAction.FINAL_WARNING: return 'Final'
    default: return DISCIPLINARY_ACTION_LABELS[a]
  }
}

/** "#4 · 2nd of type" — how often this person has had an incident (all time). */
export function OccurrenceBadge({ occ }: { occ: IncidentOccurrence | null | undefined }) {
  if (!occ) return null
  const repeat = occ.no > 1
  return (
    <span
      className={`inc-occ${repeat ? ' inc-occ--repeat' : ''}${occ.no >= 5 ? ' inc-occ--hot' : ''}`}
      title={`${ordinal(occ.no)} incident for this person (all time) · ${ordinal(occ.typeNo)} of this type · ${occ.last12Months} in the last 12 months`}
    >
      #{occ.no}
      {occ.typeNo > 1 && <small>· {ordinal(occ.typeNo)} of type</small>}
    </span>
  )
}

/** Six-step ladder (Coaching → Termination) with steps filled up to the highest action. */
export function LadderDots({ highest }: { highest: DisciplinaryAction | null }) {
  const level = highest ? DISCIPLINARY_LEVEL[highest] : 0
  const steps = ACTION_ORDER.filter((a) => a !== 'NOT_RECORDED' && a !== DisciplinaryAction.NO_ACTION) as DisciplinaryAction[]
  return (
    <span className="inc-ladder" role="img" aria-label={`Highest action: ${actionLabel(highest)}`}>
      {steps.map((a) => (
        <i key={a} title={DISCIPLINARY_ACTION_LABELS[a]} style={{ background: DISCIPLINARY_LEVEL[a] <= level ? ACTION_STYLE[a].fill : undefined }} />
      ))}
    </span>
  )
}
