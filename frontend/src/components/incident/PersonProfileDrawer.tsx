import { useEffect, useRef } from 'react'
import { DISCIPLINARY_ACTION_LABELS, INCIDENT_TYPE_CATEGORY, INCIDENT_TYPE_LABELS, type IncidentType } from '@dom/shared'
import { usePersonHistory } from '../../api/incidents'
import { money } from '../../api/accounting'
import { BarList } from '../marketing/chartKit'
import { CATEGORY_COLOR, categoryLabel, ordinal } from './incidentPalette'
import { ActionPill, LadderDots, OccurrenceBadge } from './incidentUi'

// Employee profile (v2.91.0): everything on record for the person behind a login —
// all their linked logins — with the disciplinary ladder, the advisory next step,
// type mix and a newest-first timeline. Read-only; editing stays in the modals.

interface Props {
  userId: string
  onClose: () => void
  onOpenIncident: (id: string) => void
  onShowInTable: (userId: string, name: string) => void
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
// Date-only values (YYYY-MM-DD) are calendar days — format in UTC so they never shift a day
const fmtDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export default function PersonProfileDrawer({ userId, onClose, onOpenIncident, onShowInTable }: Props) {
  const history = usePersonHistory(userId)
  const h = history.data
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    panelRef.current?.focus()
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const typeItems = (h?.byType ?? []).map((t) => ({
    id: t.type,
    label: t.label,
    value: t.count,
    display: String(t.count),
    color: CATEGORY_COLOR[INCIDENT_TYPE_CATEGORY[t.type as IncidentType]],
  }))

  return (
    <div className="inc-drawer-backdrop" onClick={onClose}>
      <aside
        ref={panelRef}
        className="inc-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`${h?.name ?? 'Employee'} incident history`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="inc-drawer-head">
          <div>
            <div className="inc-eyebrow">Employee history</div>
            <h2>{h?.name ?? (history.isLoading ? 'Loading…' : 'Employee')}</h2>
            {h && h.userIds.length > 1 && <p>{h.userIds.length} linked logins counted as one person</p>}
          </div>
          <button type="button" className="mkt-btn-ghost" onClick={onClose} aria-label="Close">✕</button>
        </header>

        {history.isLoading && <div className="inc-disc-skel" style={{ height: 240 }} />}
        {history.isError && <div className="mkt-error">Could not load this employee's history.</div>}

        {h && (
          <div className="inc-drawer-body">
            <div className="inc-drawer-stats">
              <div><span>Incidents</span><b>{h.total}</b><small>{h.last12Months} in last 12 months</small></div>
              <div><span>Warnings</span><b>{h.warningCount}</b><small>{h.notRecorded} without a recorded action</small></div>
              <div><span>Total cost</span><b>{money(h.totalCost)}</b><small>estimated loss + shipping</small></div>
            </div>

            <section className="inc-drawer-ladder">
              <div>
                <span className="inc-eyebrow">Disciplinary ladder</span>
                <div className="inc-drawer-ladder-row">
                  <LadderDots highest={h.highestAction} />
                  <b>{h.highestAction ? DISCIPLINARY_ACTION_LABELS[h.highestAction] : 'No action recorded yet'}</b>
                </div>
                {h.lastWarning && (
                  <small>Last warning: {DISCIPLINARY_ACTION_LABELS[h.lastWarning.action]} · {fmtDay(h.lastWarning.date)}</small>
                )}
              </div>
              <div className="inc-drawer-next">
                <span>Suggested next step</span>
                <b>{DISCIPLINARY_ACTION_LABELS[h.suggestedNext]}</b>
                <small>advisory only</small>
              </div>
            </section>

            {typeItems.length > 0 && (
              <section>
                <h3 className="inc-drawer-h">By type</h3>
                <BarList items={typeItems} />
              </section>
            )}

            <section>
              <h3 className="inc-drawer-h">Timeline <span className="count-badge">{h.total}</span></h3>
              {h.incidents.length === 0 ? (
                <p className="inc-disc-empty">No incidents on record.</p>
              ) : (
                <ol className="inc-timeline">
                  {h.incidents.map((i) => {
                    const cat = INCIDENT_TYPE_CATEGORY[i.incidentType]
                    return (
                      <li key={i.id}>
                        <button type="button" className="inc-timeline-row" onClick={() => onOpenIncident(i.id)}>
                          <i className="inc-timeline-dot" style={{ background: CATEGORY_COLOR[cat] }} title={categoryLabel(cat)} />
                          <span className="inc-timeline-main">
                            <b>{INCIDENT_TYPE_LABELS[i.incidentType]}</b>
                            <small>
                              {fmt(i.incidentDate)}
                              {i.occurrence && i.occurrence.typeNo > 1 ? ` · ${ordinal(i.occurrence.typeNo)} of this type` : ''}
                              {i.cost > 0 ? ` · ${money(i.cost)}` : ''}
                              {!i.hasSignedCopy ? ' · signed copy missing' : ''}
                            </small>
                          </span>
                          <span className="inc-timeline-side">
                            <OccurrenceBadge occ={i.occurrence} />
                            <ActionPill action={i.disciplinaryAction} warningNo={i.occurrence?.warningNo} compact />
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ol>
              )}
            </section>
          </div>
        )}

        {h && (
          <footer className="inc-drawer-foot">
            <button type="button" className="btn btn-outline" onClick={() => onShowInTable(userId, h.name ?? 'Employee')}>Show in table</button>
          </footer>
        )}
      </aside>
    </div>
  )
}
