import { DISCIPLINARY_ACTION_LABELS, DisciplinaryAction, highestOf, INCIDENT_TYPE_LABELS, suggestNextAction, type IncidentType } from '@dom/shared'
import { usePersonHistory, type Incident } from '../../api/incidents'
import { ACTION_ORDER, actionLabel, ordinal } from './incidentPalette'
import { ActionPill, LadderDots } from './incidentUi'

// Create / edit form block (v2.91.0): the disciplinary action select plus a live
// hint from the person's history — "4th incident · 2nd Missing Item · last action
// Written (Aug 12) → suggested Final Written Warning". Advisory only.

interface Props {
  employeeUserId: string
  employeeName: string
  incidentType: IncidentType | ''
  editing?: Incident
  value: DisciplinaryAction | ''
  onChange: (v: DisciplinaryAction | '') => void
}

const fmt = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export default function DisciplineSection({ employeeUserId, employeeName, incidentType, editing, value, onChange }: Props) {
  const history = usePersonHistory(employeeUserId || null)
  const h = history.data

  // Everything except the incident being edited
  const others = (h?.incidents ?? []).filter((i) => i.id !== editing?.id)
  const priorHighest = highestOf(others.map((i) => i.disciplinaryAction))
  const suggested = suggestNextAction(priorHighest)
  const lastAction = others.find((i) => i.disciplinaryAction)
  const sameType = incidentType ? others.filter((i) => i.incidentType === incidentType).length : 0
  const yearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000
  const last12 = others.filter((i) => new Date(i.incidentDate).getTime() > yearAgo).length
  const no = editing?.occurrence?.no ?? others.length + 1
  const typeNo = editing?.occurrence?.typeNo ?? sameType + 1
  const name = h?.name || employeeName || 'This employee'

  return (
    <div className="inc-disc">
      {!employeeUserId ? (
        <p className="inc-disc-empty">Pick the employee to see their incident history and a suggested next step.</p>
      ) : history.isLoading ? (
        <div className="inc-disc-skel" />
      ) : history.isError ? (
        <p className="inc-disc-empty">Could not load this employee's history — you can still record an action.</p>
      ) : (
        <div className="inc-disc-hint" role="status">
          <div className="inc-disc-headline">
            <span className={`inc-disc-no${no >= 3 ? ' inc-disc-no--hot' : ''}`}>#{no}</span>
            <div>
              <b>
                {editing ? 'This is' : 'This will be'} {name}'s {ordinal(no)} incident
                {incidentType ? ` · ${ordinal(typeNo)} ${INCIDENT_TYPE_LABELS[incidentType]}` : ''}
              </b>
              <small>
                {others.length === 0
                  ? 'No earlier incidents on record.'
                  : <>
                      {last12} in the last 12 months · {h?.warningCount ?? 0} warning{h?.warningCount === 1 ? '' : 's'} on record
                      {lastAction && <> · last action <b>{actionLabel(lastAction.disciplinaryAction)}</b> ({fmt(lastAction.incidentDate)})</>}
                      {h && h.notRecorded > 0 && <> · {h.notRecorded - (editing && !editing.disciplinaryAction ? 1 : 0)} earlier without a recorded action</>}
                    </>}
              </small>
            </div>
            <span className="inc-disc-ladder">
              <LadderDots highest={priorHighest} />
              <small>{priorHighest ? DISCIPLINARY_ACTION_LABELS[priorHighest] : 'No action yet'}</small>
            </span>
          </div>

          {others.length > 0 && (
            <ol className="inc-disc-timeline">
              {others.slice(0, 3).map((i) => (
                <li key={i.id}>
                  <span>{fmt(i.incidentDate)}</span>
                  <span>{INCIDENT_TYPE_LABELS[i.incidentType]}</span>
                  <ActionPill action={i.disciplinaryAction} compact />
                </li>
              ))}
              {others.length > 3 && <li className="inc-disc-more">+{others.length - 3} earlier</li>}
            </ol>
          )}

          <div className="inc-disc-suggest">
            <span>Suggested next step: <b>{DISCIPLINARY_ACTION_LABELS[suggested]}</b></span>
            {value !== suggested && (
              <button type="button" className="btn btn-sm btn-outline" onClick={() => onChange(suggested)}>Use suggestion</button>
            )}
          </div>
        </div>
      )}

      <label className="inc-disc-field">
        <span>Disciplinary action</span>
        <select value={value} onChange={(e) => onChange(e.target.value as DisciplinaryAction | '')} className="styled-select">
          <option value="">Not recorded</option>
          {ACTION_ORDER.filter((a) => a !== 'NOT_RECORDED').map((a) => (
            <option key={a} value={a}>{actionLabel(a)}</option>
          ))}
        </select>
        <small>What was actually done about this incident. Warnings (Verbal and above) are numbered per employee.</small>
      </label>
    </div>
  )
}
