import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AttendanceStatus, EMP_DEPARTMENT_LABEL, type EmpEmployeeDTO, type EmpScheduleCell } from '@dom/shared'
import { getEmployeeHistory, type HistoryDays } from '../../api/employeeSchedule'
import { DEPT_STYLE, STATUS_STYLE, fullDate, initials, shortDate, shortDayName } from './config'
import { STATUS_ORDER, cellHoursText, fmtHours, statusLabel, tenure } from './scheduleUi'

// Employee profile (v2.93.0) — read-only side panel: details, attendance for the last
// 30 / 90 / 180 days (KPIs, status mix, calendar). Editing stays in the Edit modal.

interface Props {
  employeeId: string
  usernameById: Map<string, string>
  readOnly: boolean
  onEdit: (e: EmpEmployeeDTO) => void
  onClose: () => void
}

export default function EmployeeProfile({ employeeId, usernameById, readOnly, onEdit, onClose }: Props) {
  const [days, setDays] = useState<HistoryDays>(30)
  const q = useQuery({ queryKey: ['emp', 'history', employeeId, days], queryFn: () => getEmployeeHistory(employeeId, days), staleTime: 30_000 })
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    panelRef.current?.focus()
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [onClose])

  const h = q.data
  const e = h?.employee
  const ds = e ? DEPT_STYLE[e.department] : null
  const cellByDate = useMemo(() => new Map((h?.cells ?? []).map((c) => [c.date, c])), [h])

  // status mix for the bar (entries only)
  const mix = useMemo(() => {
    const m = new Map<AttendanceStatus, number>()
    for (const c of h?.cells ?? []) m.set(c.status, (m.get(c.status) ?? 0) + 1)
    return STATUS_ORDER.filter((s) => m.get(s)).map((s) => ({ status: s, count: m.get(s)! }))
  }, [h])
  const mixTotal = mix.reduce((s, x) => s + x.count, 0)

  // calendar: weeks (Sun→Sat) covering the window
  const weeks = useMemo(() => {
    if (!h) return [] as (string | null)[][]
    const first = new Date(`${h.days[0]}T00:00:00Z`)
    const lead = first.getUTCDay()
    const all: (string | null)[] = [...Array(lead).fill(null), ...h.days]
    while (all.length % 7) all.push(null)
    const out: (string | null)[][] = []
    for (let i = 0; i < all.length; i += 7) out.push(all.slice(i, i + 7))
    return out.reverse() // newest week first
  }, [h])

  const s = h?.summary
  const rate = s?.attendanceRate
  const rateTone = rate == null ? 'slate' : rate >= 0.95 ? 'green' : rate >= 0.85 ? 'amber' : 'red'

  return (
    <div className="ee-drawer-backdrop" onClick={onClose}>
      <aside ref={panelRef} className="ee-drawer" role="dialog" aria-modal="true" aria-label={e ? `${e.firstName} ${e.lastName} profile` : 'Employee profile'} tabIndex={-1} onClick={(ev) => ev.stopPropagation()}>
        <header className="ee-drawer-head" style={ds ? { ['--dept' as string]: ds.accent, ['--dept-soft' as string]: ds.soft, ['--dept-ink' as string]: ds.bandText } : undefined}>
          {e && ds ? (
            <div className="ee-drawer-id">
              <span className="ee-avatar-lg">{initials(e.firstName, e.lastName)}</span>
              <div>
                <h2>{e.firstName} {e.lastName}</h2>
                <p>
                  <b>{e.empNo}</b> · {EMP_DEPARTMENT_LABEL[e.department]}
                  {e.isActive
                    ? <span className="ee-pill ee-pill--active">Active</span>
                    : <span className="ee-pill ee-pill--left">Left {e.leaveDate ? fullDate(e.leaveDate) : ''}</span>}
                </p>
                <small>Since {fullDate(e.startDate)} · {tenure(e.startDate, e.isActive ? null : e.leaveDate)}</small>
              </div>
            </div>
          ) : <div className="ee-drawer-id"><h2>{q.isLoading ? 'Loading…' : 'Employee'}</h2></div>}
          <div className="ee-drawer-actions">
            {e && !readOnly && <button type="button" className="es-btn" onClick={() => onEdit(e)}>Edit</button>}
            <button type="button" className="es-icon-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </header>

        {q.isError && <div className="es-empty">Could not load this employee.</div>}

        {e && h && s && (
          <div className="ee-drawer-body">
            <section className="ee-details">
              <Detail label="Contact number" value={e.contactNumber} />
              <Detail label="Email" value={e.email} />
              <Detail label="Birthday" value={e.birthday ? fullDate(e.birthday) : null} />
              <Detail label="Emergency contact" value={e.emergencyContactName ? `${e.emergencyContactName}${e.emergencyContactNumber ? ` · ${e.emergencyContactNumber}` : ''}` : null} />
              <Detail label="Address" value={e.address} wide />
              <div className="ee-detail ee-detail--wide">
                <span>System logins</span>
                {e.userIds.length ? (
                  <div className="ee-logins">{e.userIds.map((id) => <em key={id}>@{usernameById.get(id) ?? 'login'}</em>)}</div>
                ) : <b className="ee-muted">Not linked — Warehouse Report can't apply this schedule</b>}
              </div>
            </section>

            <section>
              <div className="ee-section-head">
                <h3>Attendance</h3>
                <div className="es-seg" role="group" aria-label="Period">
                  {([30, 90, 180] as HistoryDays[]).map((d) => (
                    <button key={d} type="button" className={days === d ? 'is-on' : ''} aria-pressed={days === d} onClick={() => setDays(d)}>{d} days</button>
                  ))}
                </div>
              </div>
              <p className="ee-range">{fullDate(h.from)} – {fullDate(h.to)}{q.isFetching ? ' · updating…' : ''}</p>

              <div className="ee-kpis">
                <div className={`ee-kpi ee-kpi--${rateTone}`}>
                  <span>Attendance</span>
                  <b>{rate == null ? '—' : `${Math.round(rate * 100)}%`}</b>
                  <small>of days expected to work</small>
                </div>
                <div className="ee-kpi"><span>Worked days</span><b>{fmtNum(s.workedDays)}</b><small>{s.present} full · {s.halfDay} half · {s.partialDay} partial</small></div>
                <div className="ee-kpi"><span>Hours</span><b>{fmtNum(s.hours)}</b><small>{s.otHours ? `incl. ${fmtHours(s.otHours)} OT` : 'no overtime'}</small></div>
                <div className={`ee-kpi${s.absent ? ' ee-kpi--red' : ''}`}><span>Absent</span><b>{s.absent}</b><small>{s.leave} leave · {s.dayOff} days off</small></div>
              </div>

              {mixTotal > 0 ? (
                <div className="ee-mix">
                  <div className="ee-mix-bar" role="img" aria-label={mix.map((m) => `${statusLabel(m.status)} ${m.count}`).join(', ')}>
                    {mix.map((m) => (
                      <i key={m.status} style={{ width: `${(m.count / mixTotal) * 100}%`, background: STATUS_STYLE[m.status].dot }} title={`${statusLabel(m.status)}: ${m.count}`} />
                    ))}
                  </div>
                  <ul className="ee-mix-legend">
                    {mix.map((m) => (
                      <li key={m.status}><i style={{ background: STATUS_STYLE[m.status].dot }} aria-hidden="true" />{statusLabel(m.status)} <b>{m.count}</b></li>
                    ))}
                    {h.days.length - mixTotal > 0 && <li className="ee-muted"><i style={{ background: '#e2e8f0' }} aria-hidden="true" />No entry <b>{h.days.length - mixTotal}</b></li>}
                  </ul>
                </div>
              ) : <p className="ee-muted">No schedule entries in this period.</p>}
            </section>

            <section>
              <h3 className="ee-h3">Calendar <small>newest week first · hover a day for details</small></h3>
              <div className="ee-cal" role="grid" aria-label="Attendance calendar">
                <div className="ee-cal-row ee-cal-head" role="row">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i} role="columnheader">{d}</span>)}
                </div>
                {weeks.map((w, i) => (
                  <div key={i} className="ee-cal-row" role="row">
                    {w.map((d, j) => d ? <CalDay key={j} date={d} cell={cellByDate.get(d)} /> : <span key={j} className="ee-cal-pad" role="gridcell" />)}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </aside>
    </div>
  )
}

function CalDay({ date, cell }: { date: string; cell?: EmpScheduleCell }) {
  const st = cell ? STATUS_STYLE[cell.status] : null
  const hours = cell ? cellHoursText(cell) : ''
  const label = `${shortDayName(date)} ${shortDate(date)}: ${cell ? `${statusLabel(cell.status)}${hours ? ` · ${hours}` : ''}` : 'no entry'}`
  return (
    <span className={`ee-cal-day${cell ? '' : ' is-empty'}`} role="gridcell" title={label} aria-label={label} style={st ? { background: st.dot } : undefined}>
      {Number(date.slice(8))}
    </span>
  )
}

function Detail({ label, value, wide }: { label: string; value: string | null; wide?: boolean }) {
  return (
    <div className={`ee-detail${wide ? ' ee-detail--wide' : ''}`}>
      <span>{label}</span>
      {value ? <b>{value}</b> : <b className="ee-muted">—</b>}
    </div>
  )
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}
