import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  AttendanceStatus,
  EMP_DEPARTMENT_LABEL,
  EMP_DEPARTMENT_ORDER,
  type EmpAnalyticsDay,
  type EmpAnalyticsRow,
  type EmpDepartment,
} from '@dom/shared'
import { ChartCard, BarList, Legend, TooltipCard, Empty } from '../../components/marketing/chartKit'
import { AXIS_PROPS, GRID_PROPS } from '../../components/marketing/chartTheme'
import { relativeDelta, pointDelta, type Delta } from '../../components/marketing/format'
import { apiErrorMessage, downloadRangeExport, getReportAnalytics, listLinkableUsers } from '../../api/employeeSchedule'
import { DEPT_STYLE, STATUS_STYLE, addDays, fullDate, initials, shortDate, todayStr } from './config'
import EmployeeProfile from './EmployeeProfile'
import { statusLabel } from './scheduleUi'

// Employee Schedule → Report (v2.93.0 redesign). Any range up to 186 days, compared with
// the same-length period just before. Charts use the grid's status colours so a status
// looks the same everywhere. Numbers follow the report formulas (Worked Days / Hours).

type Preset = 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'last90' | 'custom'
type SortKey = 'name' | 'rate' | 'workedDays' | 'hours' | 'otHours' | 'absent' | 'leave'

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'thisWeek', label: 'This week' },
  { id: 'lastWeek', label: 'Last week' },
  { id: 'thisMonth', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'last90', label: 'Last 90 days' },
  { id: 'custom', label: 'Custom' },
]

const STACK: { key: keyof EmpAnalyticsDay; status: AttendanceStatus; label: string }[] = [
  { key: 'present', status: AttendanceStatus.PRESENT, label: 'Present' },
  { key: 'halfDay', status: AttendanceStatus.HALF_DAY, label: 'Half day' },
  { key: 'partialDay', status: AttendanceStatus.PARTIAL_DAY, label: 'Partial day' },
  { key: 'absent', status: AttendanceStatus.ABSENT, label: 'Absent' },
  { key: 'leave', status: AttendanceStatus.VACATION_LEAVE, label: 'Leave' },
  { key: 'dayOff', status: AttendanceStatus.DAY_OFF, label: 'Day off' },
]

function sundayOf(d: string): string {
  const x = new Date(`${d}T00:00:00Z`)
  return addDays(d, -x.getUTCDay())
}
function rangeFor(p: Exclude<Preset, 'custom'>, today: string): { from: string; to: string } {
  const [y, m] = today.split('-').map(Number)
  const pad = (n: number) => String(n).padStart(2, '0')
  const lastDay = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate()
  switch (p) {
    case 'thisWeek': { const s = sundayOf(today); return { from: s, to: addDays(s, 6) } }
    case 'lastWeek': { const s = addDays(sundayOf(today), -7); return { from: s, to: addDays(s, 6) } }
    case 'thisMonth': return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDay(y, m))}` }
    case 'lastMonth': { const py = m === 1 ? y - 1 : y; const pm = m === 1 ? 12 : m - 1; return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(lastDay(py, pm))}` } }
    case 'last90': return { from: addDays(today, -89), to: today }
  }
}

const num = (n: number) => (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: 1 }))
const pct = (r: number | null) => (r == null ? '—' : `${Math.round(r * 100)}%`)
const rateColor = (r: number | null) => (r == null ? '#94a3b8' : r >= 0.95 ? '#16a34a' : r >= 0.85 ? '#f59e0b' : '#dc2626')

export default function ReportTab() {
  const today = todayStr()
  const [preset, setPreset] = useState<Preset>('thisMonth')
  const [custom, setCustom] = useState(() => rangeFor('thisMonth', today))
  const [dept, setDept] = useState<EmpDepartment | 'ALL'>('ALL')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'rate', dir: 1 })
  const [profileId, setProfileId] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const picked = preset === 'custom' ? custom : rangeFor(preset, today)
  // A period that runs past today is read "to date" and compared with the same number of
  // days just before it (otherwise a half-finished month looks like a drop).
  const range = picked.to > today && picked.from <= today ? { from: picked.from, to: today } : picked
  const toDate = range.to !== picked.to
  const q = useQuery({
    queryKey: ['emp', 'report', 'analytics', range.from, range.to, dept],
    queryFn: () => getReportAnalytics(range.from, range.to, dept === 'ALL' ? undefined : dept),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
  const { data: linkable } = useQuery({ queryKey: ['emp', 'linkable-users'], queryFn: listLinkableUsers, staleTime: 60_000 })
  const usernameById = useMemo(() => new Map((linkable ?? []).map((u) => [u.id, u.username])), [linkable])

  const a = q.data
  const t = a?.totals
  const p = a?.previous
  const hasPrev = !!p && p.scheduledDays > 0

  // daily → weekly buckets past 62 days so bars stay readable
  const chartData = useMemo(() => {
    if (!a) return []
    if (a.days.length <= 62) return a.daily.map((d) => ({ ...d, label: shortDate(d.date) }))
    const out: (EmpAnalyticsDay & { label: string })[] = []
    for (const d of a.daily) {
      const wk = sundayOf(d.date)
      let b = out[out.length - 1]
      if (!b || b.date !== wk) { b = { date: wk, label: `wk ${shortDate(wk)}`, present: 0, halfDay: 0, partialDay: 0, absent: 0, dayOff: 0, leave: 0, hours: 0 }; out.push(b) }
      for (const s of STACK) (b[s.key] as number) += d[s.key] as number
      b.hours += d.hours
    }
    return out
  }, [a])

  const rows = useMemo(() => {
    const list = [...(a?.rows ?? [])].filter((r) => r.summary.scheduledDays > 0 || r.employee.isActive)
    const val = (r: EmpAnalyticsRow): number | string => {
      switch (sort.key) {
        case 'name': return `${r.employee.firstName} ${r.employee.lastName}`
        case 'rate': return r.summary.attendanceRate ?? 2
        default: return r.summary[sort.key]
      }
    }
    return list.sort((x, y) => {
      const vx = val(x), vy = val(y)
      const c = typeof vx === 'string' ? vx.localeCompare(vy as string) : (vx as number) - (vy as number)
      return c * sort.dir || x.employee.empNo - y.employee.empNo
    })
  }, [a, sort])

  const topAbsent = (a?.rows ?? []).filter((r) => r.summary.absent > 0).sort((x, y) => y.summary.absent - x.summary.absent).slice(0, 8)
  const topOt = (a?.rows ?? []).filter((r) => r.summary.otHours > 0).sort((x, y) => y.summary.otHours - x.summary.otHours).slice(0, 8)

  const setSortKey = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'name' || key === 'rate' ? 1 : -1 }))

  const doExport = async (kind: 'csv' | 'pdf') => {
    setExportError(null)
    try { await downloadRangeExport(kind, range.from, range.to) } catch (err) { setExportError(apiErrorMessage(err, 'Export failed')) }
  }

  return (
    <div className="es-root mkt-root">
      {/* ── Controls ── */}
      <div className="es-weekbar er-controls">
        <div className="es-seg" role="group" aria-label="Period">
          {PRESETS.map((pr) => (
            <button key={pr.id} type="button" className={preset === pr.id ? 'is-on' : ''} aria-pressed={preset === pr.id} onClick={() => setPreset(pr.id)}>{pr.label}</button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="er-dates">
            <input type="date" aria-label="From" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} />
            <span aria-hidden="true">→</span>
            <input type="date" aria-label="To" value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} />
          </div>
        )}
        <div className="er-exports">
          <button type="button" className="es-btn" onClick={() => doExport('csv')}>CSV</button>
          <button type="button" className="es-btn" onClick={() => doExport('pdf')}>PDF</button>
        </div>
      </div>
      <div className="es-filters">
        <span className="er-range">{fullDate(range.from)} – {fullDate(range.to)}{toDate ? ' (to date)' : ''}{a && hasPrev ? <> · compared with {shortDate(a.prevFrom)} – {shortDate(a.prevTo)}</> : null}{q.isFetching ? ' · updating…' : ''}</span>
        <div className="es-seg" role="group" aria-label="Department">
          <button type="button" className={dept === 'ALL' ? 'is-on' : ''} aria-pressed={dept === 'ALL'} onClick={() => setDept('ALL')}>All departments</button>
          {EMP_DEPARTMENT_ORDER.map((d) => (
            <button key={d} type="button" className={dept === d ? 'is-on' : ''} aria-pressed={dept === d} onClick={() => setDept(d)}>
              <i style={{ background: DEPT_STYLE[d].accent }} aria-hidden="true" />{EMP_DEPARTMENT_LABEL[d].replace(' Staff', '')}
            </button>
          ))}
        </div>
      </div>
      {exportError && <div className="es-banner">{exportError}</div>}

      {q.isError && <div className="es-empty">Could not load the report. {apiErrorMessage(q.error, '')}</div>}
      {!a && q.isLoading && <div className="es-empty">Loading report…</div>}

      {a && t && p && (
        <>
          {/* ── KPIs ── */}
          <div className="mkt-kpis er-kpis">
            <Kpi color={rateColor(t.attendanceRate)} label="Attendance" value={pct(t.attendanceRate)} sub="worked ÷ expected days"
              delta={t.attendanceRate != null && p.attendanceRate != null ? pointDelta(t.attendanceRate, p.attendanceRate, hasPrev) : null} />
            <Kpi color="#3B82F6" label="Hours worked" value={num(t.hours)} sub={`${num(t.workedDays)} worked days`} delta={hasPrev ? relativeDelta(t.hours, p.hours) : null} />
            <Kpi color="#C2410C" label="Overtime" value={`${num(t.otHours)}h`} sub={`${a.rows.filter((r) => r.summary.otHours > 0).length} employees`} delta={hasPrev ? relativeDelta(t.otHours, p.otHours) : null} />
            <Kpi color="#DC2626" label="Absences" value={num(t.absent)} sub={`${a.rows.filter((r) => r.summary.absent > 0).length} employees`} delta={hasPrev ? relativeDelta(t.absent, p.absent) : null} goodWhenDown />
            <Kpi color="#0E7490" label="Leave days" value={num(t.leave)} sub="vacation · sick · maternity" delta={hasPrev ? relativeDelta(t.leave, p.leave) : null} neutral />
            <Kpi color="#CA8A04" label="Missing entries" value={num(t.missing)} sub="past days with no entry" />
          </div>

          {/* ── Daily attendance ── */}
          <ChartCard
            title={a.days.length <= 62 ? 'Daily attendance' : 'Weekly attendance'}
            sub={a.days.length <= 62 ? 'People per status each day · hover for details' : 'Person-days per status each week (ranges over 62 days are grouped by week)'}
          >
            {t.scheduledDays === 0 ? <Empty title="No entries in this range" /> : (
              <>
                <Legend items={STACK.map((s) => ({ label: s.label, color: STATUS_STYLE[s.status].dot }))} />
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap="18%">
                      <CartesianGrid {...GRID_PROPS} />
                      <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={16} />
                      <YAxis {...AXIS_PROPS} allowDecimals={false} width={40} />
                      <Tooltip
                        cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null
                          const d = payload[0].payload as EmpAnalyticsDay & { label: string }
                          return (
                            <TooltipCard
                              title={a.days.length <= 62 ? fullDate(d.date) : `Week of ${fullDate(d.date)}`}
                              rows={STACK.filter((s) => (d[s.key] as number) > 0).map((s) => ({ label: s.label, value: String(d[s.key]), color: STATUS_STYLE[s.status].dot }))}
                              foot={`${num(d.hours)} hours worked`}
                            />
                          )
                        }}
                      />
                      {STACK.map((s, i) => (
                        <Bar key={s.key} dataKey={s.key} stackId="a" fill={STATUS_STYLE[s.status].dot} stroke="#fff" strokeWidth={1}
                          radius={i === STACK.length - 1 ? [4, 4, 0, 0] : undefined} isAnimationActive={false} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </ChartCard>

          {/* ── Departments + rankings ── */}
          <div className="er-trio">
            <ChartCard title="Hours by department" sub="Bar = hours worked · attendance and OT below">
              <BarList
                items={a.byDept.map((d) => ({
                  id: d.department,
                  label: EMP_DEPARTMENT_LABEL[d.department],
                  value: d.hours,
                  display: `${num(d.hours)}h`,
                  color: DEPT_STYLE[d.department].accent,
                  sub: <>{d.employees} people · attendance {pct(d.attendanceRate)} · {num(d.otHours)}h OT · {d.absent} absent</>,
                }))}
                onSelect={(id) => setDept(id as EmpDepartment)}
                emptyTitle="No hours in this range"
              />
            </ChartCard>
            <ChartCard title="Most absences" sub="Click a name for the full history">
              <BarList
                items={topAbsent.map((r) => ({
                  id: r.employee.id,
                  label: `${r.employee.firstName} ${r.employee.lastName}`,
                  value: r.summary.absent,
                  display: `${r.summary.absent} day${r.summary.absent === 1 ? '' : 's'}`,
                  color: STATUS_STYLE[AttendanceStatus.ABSENT].dot,
                  sub: <>{r.employee.empNo} · attendance {pct(r.summary.attendanceRate)}</>,
                }))}
                onSelect={setProfileId}
                emptyTitle="No absences in this range"
              />
            </ChartCard>
            <ChartCard title="Most overtime" sub="Click a name for the full history">
              <BarList
                items={topOt.map((r) => ({
                  id: r.employee.id,
                  label: `${r.employee.firstName} ${r.employee.lastName}`,
                  value: r.summary.otHours,
                  display: `${num(r.summary.otHours)}h`,
                  color: '#C2410C',
                  sub: <>{r.employee.empNo} · {num(r.summary.hours)}h total</>,
                }))}
                onSelect={setProfileId}
                emptyTitle="No overtime in this range"
              />
            </ChartCard>
          </div>

          {/* ── Attendance map ── */}
          {a.grid && rows.length > 0 && (
            <ChartCard title="Attendance map" sub="One square per employee per day · hover for details · grey = no entry">
              <div className="er-map-wrap">
                <table className="er-map">
                  <thead>
                    <tr>
                      <th scope="col" className="er-map-name">Employee</th>
                      {a.days.map((d) => {
                        const wd = new Date(`${d}T00:00:00Z`).getUTCDay()
                        return <th key={d} scope="col" className={wd === 0 ? 'is-sun' : ''} title={fullDate(d)}>{Number(d.slice(8))}</th>
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const g = a.grid![r.employee.id] ?? {}
                      return (
                        <tr key={r.employee.id}>
                          <th scope="row" className="er-map-name">
                            <button type="button" onClick={() => setProfileId(r.employee.id)}>{r.employee.firstName} {r.employee.lastName}</button>
                          </th>
                          {a.days.map((d) => {
                            const st = g[d]
                            const future = d > today
                            return (
                              <td key={d}>
                                <span
                                  className={`er-sq${st ? '' : future ? ' is-future' : ' is-empty'}`}
                                  style={st ? { background: STATUS_STYLE[st].dot } : undefined}
                                  title={`${r.employee.firstName} · ${fullDate(d)}: ${st ? statusLabel(st) : future ? 'upcoming' : 'no entry'}`}
                                />
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          )}

          {/* ── Employee table ── */}
          <ChartCard title="Employees" sub="Click a column to sort · click a name for the profile" flush>
            <div className="er-table-wrap">
              <table className="er-table">
                <thead>
                  <tr>
                    <SortTh k="name" sort={sort} onSort={setSortKey} align="left">Employee</SortTh>
                    <SortTh k="rate" sort={sort} onSort={setSortKey}>Attendance</SortTh>
                    <th>Present</th>
                    <th>Half</th>
                    <th title="Partial days (hours)">Partial</th>
                    <SortTh k="absent" sort={sort} onSort={setSortKey}>Absent</SortTh>
                    <SortTh k="leave" sort={sort} onSort={setSortKey}>Leave</SortTh>
                    <th>Day off</th>
                    <SortTh k="otHours" sort={sort} onSort={setSortKey}>OT (h)</SortTh>
                    <SortTh k="workedDays" sort={sort} onSort={setSortKey}>Worked days</SortTh>
                    <SortTh k="hours" sort={sort} onSort={setSortKey}>Hours</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const s = r.summary
                    const ds = DEPT_STYLE[r.employee.department]
                    return (
                      <tr key={r.employee.id} className={r.employee.isActive ? '' : 'is-former'}>
                        <td className="l">
                          <button type="button" className="er-emp" onClick={() => setProfileId(r.employee.id)}>
                            <span className="er-avatar" style={{ background: ds.soft, color: ds.bandText }}>{initials(r.employee.firstName, r.employee.lastName)}</span>
                            <span><b>{r.employee.firstName} {r.employee.lastName}</b><small>{r.employee.empNo} · {EMP_DEPARTMENT_LABEL[r.employee.department].replace(' Staff', '')}{r.employee.isActive ? '' : ' · former'}</small></span>
                          </button>
                        </td>
                        <td>
                          <span className="er-rate"><i style={{ width: `${Math.round((s.attendanceRate ?? 0) * 100)}%`, background: rateColor(s.attendanceRate) }} /></span>
                          <b>{pct(s.attendanceRate)}</b>
                        </td>
                        <td>{s.present || <span className="z">0</span>}</td>
                        <td>{s.halfDay || <span className="z">0</span>}</td>
                        <td>{s.partialDay ? <>{s.partialDay} <small>({num(s.hours - 8 * s.present - 4 * s.halfDay - s.otHours)}h)</small></> : <span className="z">0</span>}</td>
                        <td className={s.absent ? 'bad' : ''}>{s.absent || <span className="z">0</span>}</td>
                        <td>{s.leave || <span className="z">0</span>}</td>
                        <td>{s.dayOff || <span className="z">0</span>}</td>
                        <td>{s.otHours ? num(s.otHours) : <span className="z">0</span>}</td>
                        <td><b>{num(s.workedDays)}</b></td>
                        <td><b>{num(s.hours)}</b></td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="l">Total · {t.employees} employees</td>
                    <td><b>{pct(t.attendanceRate)}</b></td>
                    <td>{t.present}</td>
                    <td>{t.halfDay}</td>
                    <td>{t.partialDay}</td>
                    <td>{t.absent}</td>
                    <td>{t.leave}</td>
                    <td>{t.dayOff}</td>
                    <td>{num(t.otHours)}</td>
                    <td><b>{num(t.workedDays)}</b></td>
                    <td><b>{num(t.hours)}</b></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </ChartCard>

          <p className="er-foot">
            Attendance = (Present + Half + Partial days) ÷ (those + Absent) — leave and days off don't count against it ·
            Worked Days = Present + 0.5 × Half + Partial hours ÷ 8 · Hours = 8 × Present + 4 × Half + Partial hours + OT
          </p>
        </>
      )}

      {profileId && (
        <EmployeeProfile employeeId={profileId} usernameById={usernameById} readOnly onEdit={() => {}} onClose={() => setProfileId(null)} />
      )}
    </div>
  )
}

function Kpi({ color, label, value, sub, delta, goodWhenDown, neutral }: {
  color: string; label: string; value: string; sub: string; delta?: Delta | null; goodWhenDown?: boolean; neutral?: boolean
}) {
  const up = delta?.dir === 'up' || delta?.dir === 'new'
  const tone = !delta || delta.dir === 'none' ? null : delta.dir === 'flat' || neutral ? 'flat' : up === !!goodWhenDown ? 'bad' : 'good'
  return (
    <article className="mkt-kpi" style={{ '--kpi': color } as React.CSSProperties}>
      <div className="mkt-kpi-label">{label}</div>
      <div className="mkt-kpi-value">{value}</div>
      <div className="mkt-kpi-sub">
        {tone && delta && (
          <span className={`er-delta er-delta--${tone}`} title="vs the previous period">
            {up ? '▲ ' : delta.dir === 'down' ? '▼ ' : ''}{delta.dir === 'new' ? 'New' : delta.label}
          </span>
        )}
        <span>{sub}</span>
      </div>
    </article>
  )
}

function SortTh({ k, sort, onSort, align, children }: {
  k: SortKey; sort: { key: SortKey; dir: 1 | -1 }; onSort: (k: SortKey) => void; align?: 'left'; children: React.ReactNode
}) {
  const on = sort.key === k
  return (
    <th className={align === 'left' ? 'l' : ''} aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={`er-sort${on ? ' is-on' : ''}`} onClick={() => onSort(k)}>
        {children}<span aria-hidden="true">{on ? (sort.dir === 1 ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  )
}
