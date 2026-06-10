import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AttendanceStatus,
  ATTENDANCE_LABEL,
  ATTENDANCE_BASE_HOURS,
  EMP_DEPARTMENT_LABEL,
  EMP_DEPARTMENT_ORDER,
  MAX_OT_HOURS,
  type EmpWeekResponse,
  type EmpScheduleCell,
} from '@dom/shared'
import { colors, radius, shadow } from '../../theme'
import { getWeek, setCell, type SetCellInput } from '../../api/employeeSchedule'
import {
  STATUS_STYLE, EMPTY_CELL_STYLE, DEPT_STYLE,
  initials, hoursToClock, shortDayName, shortDate, fullDate, weekNumber, addDays, todayStr,
} from './config'

const STATUS_OPTIONS = [
  AttendanceStatus.PRESENT,
  AttendanceStatus.HALF_DAY,
  AttendanceStatus.ABSENT,
  AttendanceStatus.VACATION_LEAVE,
  AttendanceStatus.SICK_LEAVE,
  AttendanceStatus.MATERNITY_LEAVE,
]

const DAY_COL_W = 132
const LEFT_COL_W = 230

function cellHours(c: EmpScheduleCell): number {
  const base = ATTENDANCE_BASE_HOURS[c.status] ?? 0
  return base + (c.status === AttendanceStatus.PRESENT ? c.otHours : 0)
}

const ChevLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
)
const ChevRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
)
const ClockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
)

export default function ScheduleTab({ readOnly = false }: { readOnly?: boolean }) {
  const qc = useQueryClient()
  // anchor = any day inside the displayed week; the backend snaps to that week's Sunday
  const [anchor, setAnchor] = useState<string>(todayStr())

  const queryKey = ['emp', 'week', anchor]
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => getWeek(anchor),
    staleTime: 15_000,
  })

  const mutation = useMutation({
    mutationFn: (input: SetCellInput) => setCell(input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey })
      const prev = qc.getQueryData<EmpWeekResponse>(queryKey)
      if (prev) {
        const next: EmpWeekResponse = {
          ...prev,
          rows: prev.rows.map((row) => {
            if (row.employee.id !== input.employeeId) return row
            const cells = { ...row.cells }
            if (input.status === null) {
              delete cells[input.date]
            } else {
              cells[input.date] = { date: input.date, status: input.status, otHours: input.otHours }
            }
            const weekHours = Object.values(cells).reduce((s, c) => s + cellHours(c), 0)
            return { ...row, cells, weekHours }
          }),
        }
        qc.setQueryData(queryKey, next)
      }
      return { prev }
    },
    onError: (_e, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['emp', 'report'] })
    },
  })

  const weekLabel = useMemo(() => {
    if (!data) return ''
    const end = data.days[6]
    return `${shortDate(data.days[0])} – ${shortDate(end)}, ${fullDate(end).split(' ').pop()}`
  }, [data])

  function changeStatus(employeeId: string, date: string, value: string, existing?: EmpScheduleCell) {
    if (value === '') {
      mutation.mutate({ employeeId, date, status: null, otHours: 0 })
      return
    }
    const status = value as AttendanceStatus
    const otHours = status === AttendanceStatus.PRESENT ? (existing?.otHours ?? 0) : 0
    mutation.mutate({ employeeId, date, status, otHours })
  }
  function changeOt(employeeId: string, date: string, ot: number) {
    mutation.mutate({ employeeId, date, status: AttendanceStatus.PRESENT, otHours: ot })
  }

  const grouped = useMemo(() => {
    if (!data) return []
    return EMP_DEPARTMENT_ORDER
      .map((dept) => ({ dept, rows: data.rows.filter((r) => r.employee.department === dept) }))
      .filter((g) => g.rows.length > 0)
  }, [data])

  const gridW = LEFT_COL_W + DAY_COL_W * 7

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* ── Week navigator ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: colors.surface, border: `1px solid ${colors.border}`,
        borderRadius: radius.xl, boxShadow: shadow.card, padding: '12px 16px', flexWrap: 'wrap', gap: '10px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            padding: '6px 14px', borderRadius: radius.md, background: colors.primaryLight,
            color: colors.primary, fontWeight: 700, fontSize: '13px', letterSpacing: '0.02em',
          }}>
            WEEK # {data ? weekNumber(data.days[0]) : '—'}
          </div>
          <div style={{ fontSize: '13px', color: colors.textSecondary, fontWeight: 500 }}>{weekLabel}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => setAnchor((a) => addDays(a, -7))} style={navBtn}><ChevLeft /></button>
          <button onClick={() => setAnchor(todayStr())} style={{
            ...navBtn, width: 'auto', padding: '0 14px', fontSize: '12px', fontWeight: 600,
          }}>This Week</button>
          <button onClick={() => setAnchor((a) => addDays(a, 7))} style={navBtn}><ChevRight /></button>
        </div>
      </div>

      {/* ── Legend ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', padding: '0 2px' }}>
        {STATUS_OPTIONS.map((s) => {
          const st = STATUS_STYLE[s]
          const base = ATTENDANCE_BASE_HOURS[s]
          return (
            <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: colors.textSecondary }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: st.dot }} />
              {ATTENDANCE_LABEL[s]}{base > 0 ? ` · ${base}h` : ''}
            </span>
          )
        })}
      </div>

      {/* ── Grid ── */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: colors.textSecondary }}>Loading schedule…</div>
      ) : !data || data.rows.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px', color: colors.textSecondary,
          background: colors.surface, border: `1px dashed ${colors.borderStrong}`, borderRadius: radius.xl,
        }}>
          No employees yet. Add employees in the <strong>Employees</strong> tab to start scheduling.
        </div>
      ) : (
        <div style={{
          overflowX: 'auto', background: colors.surface,
          border: `1px solid ${colors.border}`, borderRadius: radius.xl, boxShadow: shadow.card,
        }}>
          <div style={{ minWidth: gridW }}>
            {/* Header row */}
            <div style={{ display: 'flex', borderBottom: `2px solid ${colors.border}`, background: colors.surfaceAlt, position: 'sticky', top: 0, zIndex: 2 }}>
              <div style={{ ...stickyLeft, width: LEFT_COL_W, fontWeight: 700, fontSize: '12px', color: colors.textSecondary, display: 'flex', alignItems: 'center', padding: '0 16px', background: colors.surfaceAlt }}>
                Employee
              </div>
              {data.days.map((d) => {
                const isToday = d === todayStr()
                return (
                  <div key={d} style={{
                    width: DAY_COL_W, padding: '8px 6px', textAlign: 'center',
                    borderLeft: `1px solid ${colors.border}`,
                    background: isToday ? colors.primaryLight : colors.surfaceAlt,
                  }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: isToday ? colors.primary : colors.textPrimary, textTransform: 'uppercase' }}>
                      {shortDayName(d)}
                    </div>
                    <div style={{ fontSize: '11px', color: colors.textSecondary, fontVariantNumeric: 'tabular-nums' }}>
                      {shortDate(d)}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Department sections */}
            {grouped.map((g) => {
              const ds = DEPT_STYLE[g.dept]
              return (
                <div key={g.dept}>
                  <div style={{
                    padding: '6px 16px', background: ds.band, borderBottom: `1px solid ${colors.border}`,
                    position: 'sticky', left: 0,
                    fontSize: '11px', fontWeight: 700, color: ds.bandText, textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>
                    {EMP_DEPARTMENT_LABEL[g.dept]}
                  </div>
                  {g.rows.map((row) => (
                    <div key={row.employee.id} style={{ display: 'flex', borderBottom: `1px solid ${colors.border}`, minHeight: 56 }}>
                      {/* Left sticky employee cell */}
                      <div style={{ ...stickyLeft, width: LEFT_COL_W, display: 'flex', alignItems: 'center', gap: '10px', padding: '0 16px', background: colors.surface, borderRight: `2px solid ${colors.border}` }}>
                        <span style={{
                          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                          background: ds.soft, color: ds.bandText,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700,
                        }}>{initials(row.employee.firstName, row.employee.lastName)}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '12.5px', fontWeight: 600, color: colors.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <span style={{ color: ds.accent, fontWeight: 700, marginRight: 5 }}>#{row.employee.empNo}</span>
                            {row.employee.firstName} {row.employee.lastName}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: colors.textSecondary, fontVariantNumeric: 'tabular-nums', marginTop: 1 }}>
                            <ClockIcon />{hoursToClock(row.weekHours)}
                          </div>
                        </div>
                      </div>
                      {/* Day cells */}
                      {data.days.map((d) => (
                        <DayCell
                          key={d}
                          cell={row.cells[d]}
                          readOnly={readOnly}
                          onStatus={(v) => changeStatus(row.employee.id, d, v, row.cells[d])}
                          onOt={(ot) => changeOt(row.employee.id, d, ot)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Single day cell ─────────────────────────────────────────────────────────
function DayCell({ cell, readOnly, onStatus, onOt }: {
  cell?: EmpScheduleCell
  readOnly?: boolean
  onStatus: (value: string) => void
  onOt: (ot: number) => void
}) {
  const style = cell ? STATUS_STYLE[cell.status] : EMPTY_CELL_STYLE
  const isPresent = cell?.status === AttendanceStatus.PRESENT
  const base = cell ? ATTENDANCE_BASE_HOURS[cell.status] : 0

  return (
    <div style={{
      width: DAY_COL_W, borderLeft: `1px solid ${colors.border}`,
      padding: '7px 6px', display: 'flex', flexDirection: 'column', gap: '5px',
      background: cell ? style.bg : colors.surface,
    }}>
      <select
        value={cell?.status ?? ''}
        onChange={(e) => onStatus(e.target.value)}
        disabled={readOnly}
        style={{
          width: '100%', padding: '5px 6px', borderRadius: radius.sm,
          border: `1.5px solid ${style.border}`, background: readOnly ? 'transparent' : '#fff',
          color: style.text, fontSize: '12px', fontWeight: 600,
          cursor: readOnly ? 'default' : 'pointer', outline: 'none',
          appearance: readOnly ? 'none' : undefined, opacity: 1,
        }}
      >
        <option value="">—</option>
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>{ATTENDANCE_LABEL[s]}</option>
        ))}
      </select>

      {cell && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
          {base > 0 ? (
            <span style={{ fontSize: '10.5px', fontWeight: 700, color: style.text, fontVariantNumeric: 'tabular-nums' }}>
              {base}h
            </span>
          ) : <span />}
          {isPresent && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: colors.textSecondary }}>
              OT
              <select
                value={cell.otHours}
                onChange={(e) => onOt(Number(e.target.value))}
                disabled={readOnly}
                style={{
                  padding: '2px 4px', borderRadius: radius.xs, border: `1px solid ${colors.border}`,
                  background: readOnly ? 'transparent' : '#fff', color: colors.textPrimary, fontSize: '11px', fontWeight: 600,
                  cursor: readOnly ? 'default' : 'pointer', outline: 'none', fontVariantNumeric: 'tabular-nums',
                  appearance: readOnly ? 'none' : undefined,
                }}
              >
                {Array.from({ length: MAX_OT_HOURS + 1 }, (_, i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  )
}

const navBtn: React.CSSProperties = {
  width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: radius.md, border: `1.5px solid ${colors.border}`, background: colors.surface,
  color: colors.textSecondary, cursor: 'pointer',
}

const stickyLeft: React.CSSProperties = {
  position: 'sticky', left: 0, zIndex: 1, flexShrink: 0,
}
