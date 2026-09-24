import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AttendanceStatus,
  EMP_DEPARTMENT_LABEL,
  EMP_DEPARTMENT_ORDER,
  cellWorkedHours,
  type EmpDepartment,
  type EmpScheduleCell,
  type EmpWeekResponse,
  type EmpWeekRow,
} from '@dom/shared'
import ConfirmModal from '../../components/shared/ConfirmModal'
import {
  apiErrorMessage,
  copyPreviousWeek,
  fillEmptyCells,
  getWeek,
  setCell,
  undoFill,
  type BulkCell,
  type BulkFillResult,
  type SetCellInput,
} from '../../api/employeeSchedule'
import {
  STATUS_STYLE, DEPT_STYLE,
  initials, hoursToClock, shortDayName, shortDate, fullDate, weekNumber, addDays, todayStr,
} from './config'
import CellEditor, { type CellChange } from './CellEditor'
import { KEY_STATUS, LEAVE, STATUS_KEY, STATUS_ORDER, STATUS_SHORT, WORKING, cellHoursText, statusLabel } from './scheduleUi'

// Employee Schedule → Schedule (v2.93.0 redesign). Click a cell (or focus it and press a
// letter) to set the day; bulk actions only ever fill EMPTY cells and can be undone.

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; message: string }
interface Editing { row: EmpWeekRow; date: string; rect: DOMRect; startPartial?: boolean }
interface PendingFill { title: string; message: string; detail: string; run: () => Promise<BulkFillResult> }
interface UndoState { label: string; cells: BulkFillResult['created'] }

const ROW_FILL_OPTIONS = [
  AttendanceStatus.PRESENT,
  AttendanceStatus.DAY_OFF,
  AttendanceStatus.ABSENT,
  AttendanceStatus.HALF_DAY,
  AttendanceStatus.VACATION_LEAVE,
  AttendanceStatus.SICK_LEAVE,
  AttendanceStatus.MATERNITY_LEAVE,
]

export default function ScheduleTab({ readOnly = false }: { readOnly?: boolean }) {
  const qc = useQueryClient()
  const [anchor, setAnchor] = useState<string>(todayStr())
  const [search, setSearch] = useState('')
  const [dept, setDept] = useState<EmpDepartment | 'ALL'>('ALL')
  const [onlyIncomplete, setOnlyIncomplete] = useState(false)
  const [save, setSave] = useState<SaveState>({ kind: 'idle' })
  const [editing, setEditing] = useState<Editing | null>(null)
  const [rowMenu, setRowMenu] = useState<{ row: EmpWeekRow; rect: DOMRect } | null>(null)
  const [pendingFill, setPendingFill] = useState<PendingFill | null>(null)
  const [filling, setFilling] = useState(false)
  const [undo, setUndo] = useState<UndoState | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const queryKey = useMemo(() => ['emp', 'week', anchor], [anchor])
  const { data, isLoading } = useQuery({ queryKey, queryFn: () => getWeek(anchor), staleTime: 15_000 })
  const today = todayStr()

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['emp', 'week'] })
    qc.invalidateQueries({ queryKey: ['emp', 'report'] })
  }, [qc])

  // ── single cell (optimistic) ──
  const mutation = useMutation({
    mutationFn: (input: SetCellInput) => setCell(input),
    onMutate: async (input) => {
      setSave({ kind: 'saving' })
      await qc.cancelQueries({ queryKey })
      const prev = qc.getQueryData<EmpWeekResponse>(queryKey)
      if (prev) {
        qc.setQueryData<EmpWeekResponse>(queryKey, {
          ...prev,
          rows: prev.rows.map((row) => {
            if (row.employee.id !== input.employeeId) return row
            const cells = { ...row.cells }
            if (input.status === null) delete cells[input.date]
            else cells[input.date] = { date: input.date, status: input.status, otHours: input.otHours, workedHours: input.workedHours ?? null }
            const weekHours = Object.values(cells).reduce((s, c) => s + cellWorkedHours(c.status, c.otHours, c.workedHours), 0)
            return { ...row, cells, weekHours }
          }),
        })
      }
      return { prev }
    },
    onError: (err, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev)
      setSave({ kind: 'error', message: apiErrorMessage(err, 'Could not save — the change was undone') })
    },
    onSuccess: () => setSave({ kind: 'saved' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['emp', 'report'] }),
  })

  const applyChange = (employeeId: string, date: string, change: CellChange) => {
    mutation.mutate({ employeeId, date, status: change.status, otHours: change.otHours, workedHours: change.workedHours })
  }

  useEffect(() => {
    if (save.kind !== 'saved') return
    const t = setTimeout(() => setSave({ kind: 'idle' }), 2500)
    return () => clearTimeout(t)
  }, [save])

  useEffect(() => {
    if (!undo) return
    const t = setTimeout(() => setUndo(null), 15000)
    return () => clearTimeout(t)
  }, [undo])

  // ── filtering ──
  const needle = search.trim().toLowerCase()
  const visibleRows = useMemo(() => (data?.rows ?? []).filter((r) => {
    if (dept !== 'ALL' && r.employee.department !== dept) return false
    if (needle && !`${r.employee.empNo} ${r.employee.firstName} ${r.employee.lastName}`.toLowerCase().includes(needle)) return false
    if (onlyIncomplete && data && data.days.every((d) => r.cells[d])) return false
    return true
  }), [data, dept, needle, onlyIncomplete])

  const grouped = useMemo(() => EMP_DEPARTMENT_ORDER
    .map((d) => ({ dept: d, rows: visibleRows.filter((r) => r.employee.department === d) }))
    .filter((g) => g.rows.length > 0), [visibleRows])
  const flatRows = useMemo(() => grouped.flatMap((g) => g.rows), [grouped])

  const deptCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of data?.rows ?? []) m.set(r.employee.department, (m.get(r.employee.department) ?? 0) + 1)
    return m
  }, [data])

  const dayStats = useMemo(() => (data?.days ?? []).map((d) => {
    let working = 0, off = 0, leave = 0, absent = 0, empty = 0
    for (const r of visibleRows) {
      const c = r.cells[d]
      if (!c) empty++
      else if (WORKING.has(c.status)) working++
      else if (LEAVE.has(c.status)) leave++
      else if (c.status === AttendanceStatus.ABSENT) absent++
      else off++
    }
    return { date: d, working, off, leave, absent, empty }
  }), [data, visibleRows])

  const emptyTotal = dayStats.reduce((s, d) => s + d.empty, 0)
  const emptyPeople = visibleRows.filter((r) => data?.days.some((d) => !r.cells[d])).length

  // ── bulk actions (empty cells only) ──
  const runFill = async (fill: PendingFill) => {
    setFilling(true)
    try {
      const res = await fill.run()
      invalidate()
      setSave({ kind: 'saved' })
      if (res.created.length > 0) {
        setUndo({
          label: `${res.created.length} empty day${res.created.length === 1 ? '' : 's'} filled${res.skipped ? ` · ${res.skipped} already set, left unchanged` : ''}`,
          cells: res.created,
        })
      } else {
        setUndo(null)
        setSave({ kind: 'error', message: 'Nothing to fill — those days already have entries' })
      }
    } catch (err) {
      setSave({ kind: 'error', message: apiErrorMessage(err, 'Bulk fill failed — nothing was changed') })
    } finally {
      setFilling(false)
      setPendingFill(null)
    }
  }

  const askFillDay = (date: string) => {
    const targets = visibleRows.filter((r) => !r.cells[date])
    if (targets.length === 0) return
    const cells: BulkCell[] = targets.map((r) => ({ employeeId: r.employee.id, date, status: AttendanceStatus.PRESENT }))
    setPendingFill({
      title: `Mark ${shortDayName(date)} ${shortDate(date)} as Present?`,
      message: `${targets.length} employee${targets.length === 1 ? '' : 's'} with no entry that day will be set to Present (8h).`,
      detail: 'Days that already have an entry are not changed. You can undo right after.',
      run: () => fillEmptyCells(cells),
    })
  }

  const askFillRow = (row: EmpWeekRow, status: AttendanceStatus) => {
    setRowMenu(null)
    const days = (data?.days ?? []).filter((d) => !row.cells[d])
    if (days.length === 0) return
    setPendingFill({
      title: `Fill ${row.employee.firstName}'s empty days?`,
      message: `${days.length} empty day${days.length === 1 ? '' : 's'} this week will be set to ${statusLabel(status)}.`,
      detail: 'Days that already have an entry are not changed. You can undo right after.',
      run: () => fillEmptyCells(days.map((d) => ({ employeeId: row.employee.id, date: d, status }))),
    })
  }

  const askCopyWeek = () => {
    if (!data) return
    setPendingFill({
      title: 'Copy last week into this week?',
      message: `Each employee's ${shortDate(addDays(data.weekStart, -7))} – ${shortDate(addDays(data.weekStart, -1))} entries are copied to the same weekday this week.`,
      detail: 'Only empty days are filled — anything already entered this week stays as it is. You can undo right after.',
      run: () => copyPreviousWeek(data.weekStart),
    })
  }

  const doUndo = async () => {
    if (!undo) return
    try {
      const res = await undoFill(undo.cells.map((c) => ({ employeeId: c.employeeId, date: c.date, status: c.status })))
      invalidate()
      setUndo(null)
      if (res.removed < undo.cells.length) {
        setSave({ kind: 'error', message: `${undo.cells.length - res.removed} day(s) were edited since and were kept` })
      } else {
        setSave({ kind: 'saved' })
      }
    } catch (err) {
      setSave({ kind: 'error', message: apiErrorMessage(err, 'Undo failed') })
    }
  }

  // ── keyboard: arrows move, letters set, Enter opens, Delete clears ──
  const focusCell = (r: number, c: number) => {
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${r}:${c}"]`)?.focus()
  }
  const onGridKey = (e: React.KeyboardEvent) => {
    const el = e.target as HTMLElement
    const pos = el.dataset.cell
    if (!pos || !data) return
    const [r, c] = pos.split(':').map(Number)
    const row = flatRows[r]
    const date = data.days[c]
    if (!row || !date) return
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
    if (moves[e.key]) {
      e.preventDefault()
      focusCell(Math.max(0, Math.min(flatRows.length - 1, r + moves[e.key][0])), Math.max(0, Math.min(6, c + moves[e.key][1])))
      return
    }
    if (readOnly) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setEditing({ row, date, rect: el.getBoundingClientRect() })
      return
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      if (row.cells[date]) applyChange(row.employee.id, date, { status: null, otHours: 0, workedHours: null })
      return
    }
    const s = KEY_STATUS[e.key.toUpperCase()]
    if (s && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      if (s === AttendanceStatus.PARTIAL_DAY) {
        setEditing({ row, date, rect: el.getBoundingClientRect(), startPartial: true })
        return
      }
      const keepOt = s === AttendanceStatus.PRESENT && row.cells[date]?.status === AttendanceStatus.PRESENT ? row.cells[date].otHours : 0
      applyChange(row.employee.id, date, { status: s, otHours: keepOt, workedHours: null })
      if (c < 6) focusCell(r, c + 1)
    }
  }

  const weekLabel = data ? `${shortDate(data.days[0])} – ${shortDate(data.days[6])}, ${fullDate(data.days[6]).split(' ').pop()}` : ''
  const hasFilters = dept !== 'ALL' || !!needle || onlyIncomplete

  return (
    <div className="es-root">
      {/* ── Week bar ── */}
      <div className="es-weekbar">
        <div className="es-weekbar-l">
          <span className="es-weekno">Week {data ? weekNumber(data.days[0]) : '—'}</span>
          <span className="es-weeklabel">{weekLabel}</span>
          <SaveIndicator state={save} />
        </div>
        <div className="es-weekbar-r">
          {!readOnly && (
            <button type="button" className="es-btn" onClick={askCopyWeek} disabled={!data}>
              <CopyIcon /> Copy last week
            </button>
          )}
          <div className="es-nav">
            <button type="button" className="es-icon-btn" onClick={() => setAnchor((a) => addDays(a, -7))} aria-label="Previous week"><ChevLeft /></button>
            <button type="button" className="es-btn" onClick={() => setAnchor(todayStr())}>This week</button>
            <button type="button" className="es-icon-btn" onClick={() => setAnchor((a) => addDays(a, 7))} aria-label="Next week"><ChevRight /></button>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="es-filters">
        <label className="es-search">
          <SearchIcon />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or ID" aria-label="Search employees" />
        </label>
        <div className="es-seg" role="group" aria-label="Department">
          <button type="button" className={dept === 'ALL' ? 'is-on' : ''} onClick={() => setDept('ALL')} aria-pressed={dept === 'ALL'}>All <b>{data?.rows.length ?? 0}</b></button>
          {EMP_DEPARTMENT_ORDER.filter((d) => deptCounts.get(d)).map((d) => (
            <button key={d} type="button" className={dept === d ? 'is-on' : ''} onClick={() => setDept(d)} aria-pressed={dept === d}>
              <i style={{ background: DEPT_STYLE[d].accent }} aria-hidden="true" />{EMP_DEPARTMENT_LABEL[d].replace(' Staff', '')} <b>{deptCounts.get(d)}</b>
            </button>
          ))}
        </div>
        <label className="es-check">
          <input type="checkbox" checked={onlyIncomplete} onChange={(e) => setOnlyIncomplete(e.target.checked)} />
          Only with empty days
        </label>
        {hasFilters && <button type="button" className="es-link" onClick={() => { setSearch(''); setDept('ALL'); setOnlyIncomplete(false) }}>Clear filters</button>}
      </div>

      {/* ── Legend + shortcuts ── */}
      <div className="es-legend" aria-label="Legend and keyboard shortcuts">
        {STATUS_ORDER.map((s) => (
          <span key={s}><i style={{ background: STATUS_STYLE[s].dot }} aria-hidden="true" />{statusLabel(s)}{!readOnly && <kbd>{STATUS_KEY[s]}</kbd>}</span>
        ))}
        {!readOnly && <span className="es-legend-hint">Click a day, or select it and press a letter · arrows move · Del clears</span>}
      </div>

      {data && emptyTotal > 0 && (
        <div className="es-banner">
          <span><b>{emptyTotal}</b> day{emptyTotal === 1 ? '' : 's'} without an entry this week ({emptyPeople} employee{emptyPeople === 1 ? '' : 's'}).</span>
          {!onlyIncomplete && <button type="button" className="es-link" onClick={() => setOnlyIncomplete(true)}>Show only them</button>}
        </div>
      )}

      {/* ── Grid ── */}
      {isLoading ? (
        <div className="es-empty">Loading schedule…</div>
      ) : !data || data.rows.length === 0 ? (
        <div className="es-empty">No employees yet. Add employees in the <strong>Employees</strong> tab to start scheduling.</div>
      ) : flatRows.length === 0 ? (
        <div className="es-empty">No employee matches these filters.</div>
      ) : (
        <div className="es-grid-wrap" ref={gridRef} onKeyDown={onGridKey}>
          <table className="es-grid">
            <thead>
              <tr>
                <th className="es-grid-emp" scope="col">Employee</th>
                {data.days.map((d, i) => {
                  const st = dayStats[i]
                  return (
                    <th key={d} scope="col" className={d === today ? 'is-today' : ''}>
                      <div className="es-dayhead">
                        <b>{shortDayName(d)}</b>
                        <span>{shortDate(d)}</span>
                      </div>
                      <div className="es-daystats" aria-label={`${st.working} working, ${st.off + st.leave} off or on leave, ${st.absent} absent, ${st.empty} with no entry`}>
                        <span className="w" title="Working (Present / Half / Partial)">{st.working} in</span>
                        {st.off + st.leave > 0 && <span className="o" title="Day off or leave">{st.off + st.leave} off</span>}
                        {st.absent > 0 && <span className="a" title="Absent">{st.absent} abs</span>}
                        {st.empty > 0 && <span className="e" title="No entry yet">{st.empty} empty</span>}
                      </div>
                      {!readOnly && st.empty > 0 && (
                        <button type="button" className="es-fillday" onClick={() => askFillDay(d)} title="Set every empty day in this column to Present">
                          Fill Present
                        </button>
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {grouped.map((g) => {
                const ds = DEPT_STYLE[g.dept]
                return (
                  <DeptRows key={g.dept}>
                    <tr className="es-deptband" style={{ ['--dept' as string]: ds.accent, ['--dept-bg' as string]: ds.band, ['--dept-ink' as string]: ds.bandText }}>
                      <th colSpan={8} scope="rowgroup"><span className="es-deptband-label">{EMP_DEPARTMENT_LABEL[g.dept]} <em>{g.rows.length}</em></span></th>
                    </tr>
                    {g.rows.map((row) => {
                      const r = flatRows.indexOf(row)
                      const empties = data.days.filter((d) => !row.cells[d]).length
                      return (
                        <tr key={row.employee.id}>
                          <th scope="row" className="es-grid-emp">
                            <div className="es-emp">
                              <span className="es-avatar" style={{ background: ds.soft, color: ds.bandText }}>{initials(row.employee.firstName, row.employee.lastName)}</span>
                              <span className="es-emp-main">
                                <b><em style={{ color: ds.accent }}>{row.employee.empNo}</em> {row.employee.firstName} {row.employee.lastName}</b>
                                <small><ClockIcon /> {hoursToClock(row.weekHours)} this week{empties > 0 ? ` · ${empties} empty` : ''}</small>
                              </span>
                              {!readOnly && empties > 0 && (
                                <button
                                  type="button"
                                  className="es-rowfill"
                                  aria-label={`Fill ${row.employee.firstName}'s empty days`}
                                  title="Fill this employee's empty days"
                                  onClick={(e) => setRowMenu({ row, rect: e.currentTarget.getBoundingClientRect() })}
                                >
                                  <FillIcon />
                                </button>
                              )}
                            </div>
                          </th>
                          {data.days.map((d, c) => (
                            <td key={d} className={d === today ? 'is-today' : ''}>
                              <Cell
                                cell={row.cells[d]}
                                pos={`${r}:${c}`}
                                readOnly={readOnly}
                                label={`${row.employee.firstName} ${row.employee.lastName}, ${shortDayName(d)} ${shortDate(d)}`}
                                onOpen={(rect) => setEditing({ row, date: d, rect })}
                              />
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </DeptRows>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <CellEditor
          anchor={editing.rect}
          title={`${editing.row.employee.firstName} ${editing.row.employee.lastName}`}
          subtitle={`${shortDayName(editing.date)} ${shortDate(editing.date)}`}
          cell={editing.row.cells[editing.date]}
          startPartial={editing.startPartial}
          onSave={(change) => { applyChange(editing.row.employee.id, editing.date, change); setEditing(null) }}
          onClose={() => setEditing(null)}
        />
      )}

      {rowMenu && (
        <RowFillMenu
          rect={rowMenu.rect}
          name={rowMenu.row.employee.firstName}
          onPick={(s) => askFillRow(rowMenu.row, s)}
          onClose={() => setRowMenu(null)}
        />
      )}

      {pendingFill && (
        <ConfirmModal
          tone="primary"
          title={pendingFill.title}
          message={pendingFill.message}
          detail={pendingFill.detail}
          confirmLabel="Fill empty days"
          busy={filling}
          onCancel={() => setPendingFill(null)}
          onConfirm={() => runFill(pendingFill)}
        />
      )}

      {undo && (
        <div className="es-toast" role="status">
          <span>{undo.label}</span>
          <button type="button" onClick={doUndo}>Undo</button>
          <button type="button" className="es-toast-x" onClick={() => setUndo(null)} aria-label="Dismiss">✕</button>
        </div>
      )}
    </div>
  )
}

function DeptRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function Cell({ cell, pos, readOnly, label, onOpen }: {
  cell?: EmpScheduleCell
  pos: string
  readOnly: boolean
  label: string
  onOpen: (rect: DOMRect) => void
}) {
  const st = cell ? STATUS_STYLE[cell.status] : null
  const hours = cell ? cellHoursText(cell) : ''
  return (
    <button
      type="button"
      data-cell={pos}
      className={`es-cell${cell ? '' : ' is-empty'}${readOnly ? ' is-readonly' : ''}`}
      style={st ? { ['--st-bg' as string]: st.bg, ['--st-ink' as string]: st.text, ['--st-dot' as string]: st.dot, ['--st-border' as string]: st.border } : undefined}
      onClick={(e) => { if (!readOnly) onOpen(e.currentTarget.getBoundingClientRect()) }}
      aria-label={`${label}: ${cell ? `${statusLabel(cell.status)}${hours ? `, ${hours}` : ''}` : 'no entry'}`}
      aria-haspopup={readOnly ? undefined : 'dialog'}
    >
      {cell ? (
        <>
          <span className="es-cell-status"><i aria-hidden="true" />{STATUS_SHORT[cell.status]}</span>
          {hours && <span className="es-cell-hours">{hours}</span>}
        </>
      ) : (
        <span className="es-cell-none">{readOnly ? '—' : '+'}</span>
      )}
    </button>
  )
}

function RowFillMenu({ rect, name, onPick, onClose }: { rect: DOMRect; name: string; onPick: (s: AttendanceStatus) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown) }
  }, [onClose])
  const top = Math.min(rect.bottom + 6, window.innerHeight - 330)
  return createPortal(
    <div ref={ref} className="es-editor es-rowmenu" style={{ top, left: Math.max(8, Math.min(rect.left, window.innerWidth - 248)), width: 240 }} role="menu" aria-label={`Fill ${name}'s empty days`}>
      <header className="es-editor-head"><b>Fill {name}'s empty days with</b><span>Filled days stay unchanged</span></header>
      <div className="es-rowmenu-list">
        {ROW_FILL_OPTIONS.map((s, i) => (
          <button key={s} type="button" role="menuitem" autoFocus={i === 0} onClick={() => onPick(s)}>
            <i style={{ background: STATUS_STYLE[s].dot }} aria-hidden="true" />{statusLabel(s)}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  )
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state.kind === 'idle') return null
  if (state.kind === 'saving') return <span className="es-save is-saving" role="status"><i aria-hidden="true" />Saving…</span>
  if (state.kind === 'saved') return <span className="es-save is-saved" role="status">✓ Saved</span>
  return <span className="es-save is-error" role="alert">⚠ {state.message}</span>
}

const ChevLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
)
const ChevRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
)
const ClockIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
)
const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
)
const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
)
const FillIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="M12 5l7 7-7 7" /></svg>
)
