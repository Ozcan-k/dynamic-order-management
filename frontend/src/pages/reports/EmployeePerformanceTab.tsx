import { useEffect, useMemo } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AttendanceStatus, type PerfEmployeeReport, type PerfRole, type PerfWorkerOption } from '@dom/shared'
import { getEmployeePerformance, getPerformanceWorkers } from '../../api/performance'
import {
  ATTENDANCE_TEXT,
  Card,
  Delta,
  ErrorBlock,
  GRID_STROKE,
  Icons,
  KpiTile,
  LoadingBlock,
  MixRing,
  niceMax,
  niceTicks,
  OUTCOME_COLOR,
  OutcomeLegend,
  OutcomePill,
  ROLE_ACCENT,
  ROLE_LABEL,
  RangePicker,
  STATUS_OUTCOME,
  StatusPill,
  TARGET_INK,
  TEAM_INK,
  TipShell,
  WEEKDAY_SHORT,
  apiError,
  dayCount,
  fmt1,
  fmtDays,
  fmtInt,
  fmtPct,
  initialsOf,
  longDate,
  rangeLabel,
  relDelta,
  shortDate,
  weekdayOf,
  type PerfRange,
} from './perf/perfUi'

interface Props {
  role: PerfRole
  userId: string | null
  onUserChange: (userId: string) => void
  range: PerfRange
  onRangeChange: (r: PerfRange) => void
  today: string
}

export default function EmployeePerformanceTab({ role, userId, onUserChange, range, onRangeChange, today }: Props) {
  const workersQ = useQuery({
    queryKey: ['reports', 'performance-workers'],
    queryFn: getPerformanceWorkers,
    staleTime: 5 * 60_000,
  })
  const workers = useMemo(() => workersQ.data ?? [], [workersQ.data])
  const selected = workers.find((w) => w.userId === userId) ?? null

  // Default to the first worker of the current role (or anyone) once the list is in.
  useEffect(() => {
    if (workers.length === 0) return
    if (userId && workers.some((w) => w.userId === userId)) return
    const first = workers.find((w) => w.role === role) ?? workers[0]
    onUserChange(first.userId)
  }, [workers, userId, role, onUserChange])

  const reportQ = useQuery({
    queryKey: ['reports', 'employee-performance', userId, range.from, range.to],
    queryFn: () => getEmployeePerformance(userId!, range.from, range.to),
    enabled: !!userId && !!selected,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
  const report = reportQ.data && reportQ.data.worker.userId === userId ? reportQ.data : undefined
  const effectiveRole: PerfRole = selected?.role ?? role

  return (
    <div className="perf-root" data-role={effectiveRole}>
      <div className="perf-hero">
        <div>
          <div className="perf-hero-label">Employee Report</div>
          <div className="perf-hero-title">{selected ? selected.displayName : 'Select an employee'}</div>
          <div className="perf-hero-sub">
            {rangeLabel(range.from, range.to)} · {dayCount(range.from, range.to)} days{reportQ.isFetching ? ' · updating…' : ''}
          </div>
        </div>
        <div className="perf-hero-controls">
          <WorkerSelect workers={workers} value={userId} onChange={onUserChange} loading={workersQ.isLoading} />
          <RangePicker value={range} today={today} onChange={onRangeChange} />
        </div>
      </div>

      {workersQ.isError && <ErrorBlock message={apiError(workersQ.error)} />}
      {!workersQ.isLoading && workers.length === 0 && !workersQ.isError && (
        <div className="perf-card"><div className="perf-empty"><strong>No active pickers or packers</strong>Active picker/packer accounts will appear here.</div></div>
      )}
      {selected && reportQ.isLoading && !report && <LoadingBlock />}
      {selected && reportQ.isError && !report && <ErrorBlock message={apiError(reportQ.error)} />}
      {report && <EmployeeBody report={report} />}
    </div>
  )
}

function WorkerSelect({ workers, value, onChange, loading }: {
  workers: PerfWorkerOption[]
  value: string | null
  onChange: (id: string) => void
  loading: boolean
}) {
  const groups: { role: PerfRole; list: PerfWorkerOption[] }[] = [
    { role: 'PICKER', list: workers.filter((w) => w.role === 'PICKER') },
    { role: 'PACKER', list: workers.filter((w) => w.role === 'PACKER') },
  ]
  return (
    <select
      className="perf-hero-select"
      aria-label="Employee"
      value={value ?? ''}
      disabled={loading || workers.length === 0}
      onChange={(e) => e.target.value && onChange(e.target.value)}
    >
      {loading && <option value="">Loading…</option>}
      {groups.filter((g) => g.list.length > 0).map((g) => (
        <optgroup key={g.role} label={ROLE_LABEL[g.role].many}>
          {g.list.map((w) => (
            <option key={w.userId} value={w.userId}>
              {w.displayName}{w.displayName !== w.username ? ` (@${w.username})` : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

// ─── Body ────────────────────────────────────────────────────────────────────

function EmployeeBody({ report }: { report: PerfEmployeeReport }) {
  const w = report.worker
  const target = report.dailyTarget
  const accent = ROLE_ACCENT[report.role]
  const counted = w.days.filter((d) => !d.inProgress)
  const leaveDays = counted.filter((d) => d.outcome === 'OFF' && d.attendance && d.attendance !== AttendanceStatus.PRESENT).length
  const flagged = counted.filter((d) => d.flag).length
  const vsTeam = relDelta(w.avgPerActiveDay, report.teamAvgPerActiveDay)
  const includesToday = w.days.some((d) => d.inProgress)

  return (
    <>
      {/* ── Profile ── */}
      <section className="perf-card">
        <div className="perf-profile">
          <div className="perf-profile-avatar" aria-hidden="true">{initialsOf(w.displayName)}</div>
          <div style={{ minWidth: 0 }}>
            <div className="perf-profile-name">{w.displayName}</div>
            <div className="perf-profile-meta">
              <span className="perf-role-chip">{ROLE_LABEL[report.role].one}</span>
              <span>@{w.username}</span>
              {w.empNo && <span>· Employee ID {w.empNo}</span>}
              {w.rank && <span>· Rank <b style={{ color: '#0f172a' }}>#{w.rank}</b> of {report.teamSize}</span>}
              <StatusPill status={w.status} />
              {!w.linked && <span className="perf-tag perf-tag--warn" title="Link this user in Employee Schedule → Employees to apply attendance">Not linked to schedule</span>}
            </div>
          </div>
          <AchievementRing ratio={w.achievement} status={w.status} totalOutput={w.totalOutput} targetOutput={w.targetOutput} />
        </div>
      </section>

      {(includesToday || flagged > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {includesToday && (
            <div className="perf-note perf-note--info"><span aria-hidden="true">ⓘ</span><span><strong>Today is still in progress</strong> — shown in the chart and log, excluded from all totals.</span></div>
          )}
          {flagged > 0 && (
            <div className="perf-note"><span aria-hidden="true">⚑</span><span><strong>{flagged} day{flagged === 1 ? '' : 's'}</strong> had output without a matching Present / Half Day schedule entry and were counted as full working days. Check the daily log below.</span></div>
          )}
        </div>
      )}

      {/* ── KPIs ── */}
      <div className="perf-kpis">
        <KpiTile label="Total Output" icon={Icons.box} value={fmtInt(w.totalOutput)} color={accent.main}
          sub={<span>of {fmtInt(w.targetOutput)} target output</span>} progress={w.achievement} />
        <KpiTile label="Active Days" icon={Icons.calendar} value={fmtDays(w.activeDays)} color={accent.main}
          sub={<span>{w.targetDays} working · {leaveDays} leave / off</span>} />
        <KpiTile label="Avg / Active Day" icon={Icons.avg} value={fmt1(w.avgPerActiveDay)}
          color={OUTCOME_COLOR[STATUS_OUTCOME[w.status]].fill}
          progress={w.avgPerActiveDay / target}
          sub={<><Delta value={relDelta(w.avgPerActiveDay, target)} /> <span>vs target {target}</span></>} />
        <KpiTile label="Vs Team Average" icon={Icons.users} value={fmt1(report.teamAvgPerActiveDay)} color={TEAM_INK}
          sub={<><Delta value={vsTeam} /> <span>{vsTeam >= 0 ? 'above' : 'below'} team avg</span></>} />
        <KpiTile label="Days Met Target" icon={Icons.check} value={w.daysMetTarget} unit={`/ ${w.targetDays}`} color="#7c3aed"
          progress={w.hitRate} sub={<span>Hit rate {fmtPct(w.hitRate)}</span>} />
        <KpiTile label="Best Day" icon={Icons.star} value={fmtInt(w.bestDay)} color="#ca8a04"
          sub={<span>{w.bestDayDate ? longDate(w.bestDayDate) : '—'}</span>} />
      </div>

      {w.status === 'NO_ACTIVITY' ? (
        <div className="perf-card"><div className="perf-empty"><strong>No working days in this period</strong>Try a wider date range.</div></div>
      ) : (
        <>
          <div className="perf-grid-2">
            <Card
              title="Daily output vs target"
              sub="Bars coloured by result · line = 7-day average · dashed grey = team average per worker"
              actions={<ChartLegend accent={accent.main} />}
            >
              <DailyChart report={report} />
            </Card>
            <Card title="Day outcomes" sub={`${counted.length} days in period`}>
              <Outcomes report={report} />
            </Card>
          </div>

          <div className="perf-grid-2 perf-grid-2--even">
            <Card title="Working rhythm — output by hour" sub="All completions in the period, by hour of day (Manila)">
              <HourlyChart hourly={report.hourly} accent={accent.main} />
            </Card>
            <Card title="Average by weekday" sub="Output per active day for each weekday vs target" actions={<OutcomeLegend />}>
              <WeekdayChart report={report} />
            </Card>
          </div>

          <Card title="Daily log" sub="Every day in the period with schedule, output and result" flush>
            <DailyLog report={report} />
          </Card>
        </>
      )}
    </>
  )
}

function ChartLegend({ accent }: { accent: string }) {
  return (
    <div className="perf-legend">
      <span className="perf-legend-item"><span className="perf-swatch" style={{ background: OUTCOME_COLOR.MET.fill }} />Met</span>
      <span className="perf-legend-item"><span className="perf-swatch" style={{ background: OUTCOME_COLOR.NEAR.fill }} />Near</span>
      <span className="perf-legend-item"><span className="perf-swatch" style={{ background: OUTCOME_COLOR.BELOW.fill }} />Below</span>
      <span className="perf-legend-item"><span className="perf-swatch perf-swatch--line" style={{ background: accent }} />7-day avg</span>
      <span className="perf-legend-item"><span className="perf-swatch perf-swatch--line" style={{ background: TEAM_INK, opacity: 0.7 }} />Team avg</span>
      <span className="perf-legend-item"><span className="perf-swatch perf-swatch--dash" />Target</span>
    </div>
  )
}

// ─── Achievement ring ────────────────────────────────────────────────────────

function AchievementRing({ ratio, status, totalOutput, targetOutput }: {
  ratio: number
  status: PerfEmployeeReport['worker']['status']
  totalOutput: number
  targetOutput: number
}) {
  const size = 96
  const stroke = 10
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const shown = Math.max(0, Math.min(1, ratio))
  const color = OUTCOME_COLOR[STATUS_OUTCOME[status]].fill
  return (
    <div className="perf-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Achievement ${fmtPct(ratio)}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${c * shown} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray .8s cubic-bezier(.22,1,.36,1)' }}
        />
        <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 19, fontWeight: 800, fill: '#0f172a' }}>
          {Math.round(ratio * 100)}%
        </text>
        <text x="50%" y="66%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 9.5, fontWeight: 700, fill: '#64748b', letterSpacing: '.06em' }}>
          OF TARGET
        </text>
      </svg>
      <div>
        <div className="perf-ring-caption">Achievement</div>
        <div className="perf-ring-text">
          <b style={{ color: '#0f172a' }}>{fmtInt(totalOutput)}</b> produced<br />
          of <b style={{ color: '#0f172a' }}>{fmtInt(targetOutput)}</b> target
        </div>
      </div>
    </div>
  )
}

// ─── Charts ──────────────────────────────────────────────────────────────────

function DailyChart({ report }: { report: PerfEmployeeReport }) {
  const target = report.dailyTarget
  const accent = ROLE_ACCENT[report.role].main
  const teamByDate = new Map(report.teamDaily.map((t) => [t.date, t]))
  const days = report.worker.days
  const data = days.map((d, i) => {
    // trailing 7-calendar-day average over working days only
    let out = 0, fac = 0
    for (let j = Math.max(0, i - 6); j <= i; j++) {
      const x = days[j]
      if (!x.inProgress && x.factor > 0) { out += x.output; fac += x.factor }
    }
    const team = teamByDate.get(d.date)
    return {
      date: d.date,
      label: shortDate(d.date),
      output: d.output > 0 || d.factor > 0 ? d.output : null,
      rolling: fac > 0 && !d.inProgress ? Math.round((out / fac) * 10) / 10 : null,
      team: team && team.activeWorkers > 0 && !team.inProgress ? Math.round(team.avgPerActiveWorker * 10) / 10 : null,
      day: d,
    }
  })
  const max = Math.max(target * 1.2, ...data.map((d) => (d.output ?? 0) * 1.08))
  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 22, right: 12, bottom: 0, left: 0 }} barCategoryGap="16%">
          <defs>
            {(['MET', 'NEAR', 'BELOW', 'OFF', 'IN_PROGRESS'] as const).map((o) => (
              <linearGradient key={o} id={`perf-e-${o}`} x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor={OUTCOME_COLOR[o].fill} stopOpacity={0.7} />
                <stop offset="100%" stopColor={OUTCOME_COLOR[o].fill} stopOpacity={1} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeOpacity={0.18} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} interval="preserveStartEnd" minTickGap={14} />
          <YAxis domain={[0, niceMax(max)]} ticks={niceTicks(max)} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={40} />
          <Tooltip
            cursor={{ fill: 'rgba(148,163,184,0.10)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload as (typeof data)[number]
              const d = p.day
              const rows = [
                { label: 'Output', value: fmtInt(d.output), color: OUTCOME_COLOR[d.outcome].fill },
                { label: 'Target', value: d.factor > 0 ? fmtInt(d.target) : '—' },
                { label: 'Schedule', value: d.attendance ? ATTENDANCE_TEXT[d.attendance] : 'No entry' },
              ]
              if (p.rolling !== null) rows.push({ label: '7-day avg', value: fmt1(p.rolling), color: accent })
              if (p.team !== null) rows.push({ label: 'Team avg', value: fmt1(p.team), color: TEAM_INK })
              return <TipShell title={`${longDate(d.date)}${d.inProgress ? ' · in progress' : ''}`} rows={rows} />
            }}
          />
          <ReferenceLine
            y={target}
            stroke={TARGET_INK}
            strokeDasharray="5 4"
            strokeWidth={1.5}
            label={{ value: `Target ${target}`, position: 'insideTopRight', fontSize: 11, fontWeight: 700, fill: TARGET_INK }}
          />
          {/* minPointSize keeps a scheduled-but-empty day visible as a thin red stub */}
          <Bar dataKey="output" radius={[6, 6, 0, 0]} maxBarSize={28} minPointSize={3} isAnimationActive animationDuration={700}>
            {data.map((d) => <Cell key={d.date} fill={`url(#perf-e-${d.day.outcome})`} />)}
          </Bar>
          <Line dataKey="team" type="monotone" stroke={TEAM_INK} strokeOpacity={0.75} strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls isAnimationActive={false} />
          <Line
            dataKey="rolling"
            type="monotone"
            stroke={accent}
            strokeWidth={2.5}
            strokeLinecap="round"
            dot={false}
            activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
            connectNulls
            isAnimationActive
            animationDuration={900}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function Outcomes({ report }: { report: PerfEmployeeReport }) {
  const o = report.outcomes
  const working = o.met + o.near + o.below
  const segments = [
    { key: 'MET' as const, label: 'Met target', value: o.met },
    { key: 'NEAR' as const, label: 'Near target', value: o.near },
    { key: 'BELOW' as const, label: 'Below 90%', value: o.below },
    { key: 'OFF' as const, label: 'Off / leave', value: o.off },
  ]
  // attendance breakdown of non-working days (schedule-driven)
  const leaveCounts = new Map<string, number>()
  for (const d of report.worker.days) {
    if (d.inProgress || d.outcome !== 'OFF') continue
    const k = d.attendance && d.attendance !== AttendanceStatus.PRESENT ? ATTENDANCE_TEXT[d.attendance] : 'No work recorded'
    leaveCounts.set(k, (leaveCounts.get(k) ?? 0) + 1)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <MixRing
          centerLabel="Working days"
          centerValue={working}
          segments={segments.map((s) => ({ label: s.label, value: s.value, color: s.key === 'OFF' ? '#cbd5e1' : OUTCOME_COLOR[s.key].fill }))}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {segments.map((s) => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: s.key === 'OFF' ? '#f8fafc' : OUTCOME_COLOR[s.key].bg }}>
            <span className="perf-swatch" style={{ background: s.key === 'OFF' ? '#cbd5e1' : OUTCOME_COLOR[s.key].fill }} />
            <span style={{ fontSize: 12, color: '#334155', flex: 1 }}>{s.label}</span>
            <b style={{ fontVariantNumeric: 'tabular-nums', color: '#0f172a' }}>{s.value}</b>
          </div>
        ))}
      </div>
      {leaveCounts.size > 0 && (
        <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
          <b style={{ color: '#334155' }}>Not counted:</b>{' '}
          {[...leaveCounts.entries()].map(([k, v]) => `${k} ${v}`).join(' · ')}
        </div>
      )}
    </div>
  )
}

function HourlyChart({ hourly, accent }: { hourly: number[]; accent: string }) {
  const first = hourly.findIndex((v) => v > 0)
  const last = hourly.length - 1 - [...hourly].reverse().findIndex((v) => v > 0)
  const from = first < 0 ? 6 : Math.max(0, first - 1)
  const to = first < 0 ? 20 : Math.min(23, last + 1)
  const data = hourly.slice(from, to + 1).map((v, i) => ({ hour: from + i, label: `${String(from + i).padStart(2, '0')}:00`, v }))
  const total = hourly.reduce((s, v) => s + v, 0)
  const peak = data.reduce((m, d) => (d.v > m.v ? d : m), data[0] ?? { hour: 0, label: '', v: 0 })
  return (
    <div>
      <div style={{ width: '100%', height: 230 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="perf-hour-g" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity={0.45} />
                <stop offset="100%" stopColor={accent} stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeOpacity={0.18} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} interval="preserveStartEnd" minTickGap={10} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={40} />
            <Tooltip
              cursor={{ stroke: accent, strokeOpacity: 0.3, strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0].payload as (typeof data)[number]
                return <TipShell title={`${p.label} – ${String((p.hour + 1) % 24).padStart(2, '0')}:00`} rows={[
                  { label: 'Completed', value: fmtInt(p.v), color: accent },
                  { label: 'Share of period', value: total ? fmtPct(p.v / total) : '—' },
                ]} />
              }}
            />
            <Area type="monotone" dataKey="v" stroke={accent} strokeWidth={2.5} fill="url(#perf-hour-g)" dot={false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} isAnimationActive animationDuration={800} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {total > 0 && (
        <div className="perf-note" style={{ marginTop: 10 }}>
          <span aria-hidden="true">⏱</span>
          <span>Peak hour <strong>{peak.label}</strong> with {fmtInt(peak.v)} completions ({fmtPct(peak.v / total)} of the period).</span>
        </div>
      )}
    </div>
  )
}

function WeekdayChart({ report }: { report: PerfEmployeeReport }) {
  const target = report.dailyTarget
  // Monday-first reads naturally for a work week
  const order = [1, 2, 3, 4, 5, 6, 0]
  const data = order.map((wd) => {
    const w = report.weekday[wd]
    const avg = Math.round(w.avg * 10) / 10
    const outcome = w.activeDays === 0 ? 'OFF' : avg >= target ? 'MET' : avg >= target * 0.9 ? 'NEAR' : 'BELOW'
    return { label: WEEKDAY_SHORT[wd], avg: w.activeDays > 0 ? avg : null, days: w.activeDays, output: w.output, outcome }
  })
  const max = Math.max(target * 1.2, ...data.map((d) => (d.avg ?? 0) * 1.08))
  return (
    <div style={{ width: '100%', height: 262 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 22, right: 12, bottom: 0, left: 0 }} barCategoryGap="24%">
          <defs>
            {(['MET', 'NEAR', 'BELOW', 'OFF'] as const).map((o) => (
              <linearGradient key={o} id={`perf-w-${o}`} x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor={OUTCOME_COLOR[o].fill} stopOpacity={0.7} />
                <stop offset="100%" stopColor={OUTCOME_COLOR[o].fill} stopOpacity={1} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeOpacity={0.18} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#334155', fontWeight: 600 }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
          <YAxis domain={[0, niceMax(max)]} ticks={niceTicks(max)} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={40} />
          <Tooltip
            cursor={{ fill: 'rgba(148,163,184,0.10)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload as (typeof data)[number]
              return <TipShell title={p.label} rows={[
                { label: 'Avg / active day', value: p.avg === null ? '—' : fmt1(p.avg), color: OUTCOME_COLOR[p.outcome as keyof typeof OUTCOME_COLOR].fill },
                { label: 'Active days', value: fmtDays(p.days) },
                { label: 'Output', value: fmtInt(p.output) },
              ]} />
            }}
          />
          <ReferenceLine y={target} stroke={TARGET_INK} strokeDasharray="5 4" strokeWidth={1.5}
            label={{ value: `Target ${target}`, position: 'insideBottomLeft', fontSize: 11, fontWeight: 700, fill: TARGET_INK }} />
          <Bar dataKey="avg" radius={[6, 6, 0, 0]} maxBarSize={44} isAnimationActive animationDuration={700}
            label={{ position: 'top', fontSize: 11, fontWeight: 700, fill: '#0f172a', formatter: (v: unknown) => (v === null || v === undefined ? '' : fmt1(Number(v))) }}>
            {data.map((d) => <Cell key={d.label} fill={`url(#perf-w-${d.outcome})`} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Daily log ───────────────────────────────────────────────────────────────

function DailyLog({ report }: { report: PerfEmployeeReport }) {
  const days = [...report.worker.days].reverse() // newest first
  return (
    <div className="perf-table-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
      <table className="perf-table">
        <thead>
          <tr>
            <th className="l">Date</th>
            <th className="l">Schedule</th>
            <th>Output</th>
            <th>Target</th>
            <th>Achievement</th>
            <th className="c">Result</th>
            <th className="l">Note</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            const ratio = d.target > 0 ? d.output / d.target : 0
            const o = OUTCOME_COLOR[d.outcome]
            return (
              <tr key={d.date} style={d.outcome === 'OFF' ? { background: '#fcfdfe' } : undefined}>
                <td className="l">
                  <span className="perf-strong">{shortDate(d.date)}</span>{' '}
                  <span className="perf-muted">{weekdayOf(d.date)}</span>
                </td>
                <td className="l">
                  {d.attendance ? ATTENDANCE_TEXT[d.attendance] : <span className="perf-muted">—</span>}
                  {d.factor === 0.5 && <span className="perf-tag" style={{ marginLeft: 6 }}>½ target</span>}
                </td>
                <td className="perf-strong">{d.output > 0 ? fmtInt(d.output) : <span className="perf-muted">0</span>}</td>
                <td className="perf-muted">{d.factor > 0 ? fmtInt(d.target) : '—'}</td>
                <td>
                  {d.factor > 0 ? (
                    <span className="perf-cellbar">
                      <span className="perf-cellbar-track">
                        <span className="perf-cellbar-fill" style={{ width: `${Math.min(1.2, ratio) / 1.2 * 100}%`, background: o.fill }} />
                        <span className="perf-cellbar-goal" style={{ left: `${(1 / 1.2) * 100}%` }} />
                      </span>
                      <span className="perf-cellbar-val">{fmtPct(ratio)}</span>
                    </span>
                  ) : <span className="perf-muted">—</span>}
                </td>
                <td className="c"><OutcomePill day={d} /></td>
                <td className="l" style={{ whiteSpace: 'normal', minWidth: 180 }}>
                  {d.flag === 'NO_SCHEDULE' && <span className="perf-tag perf-tag--warn">No schedule entry</span>}
                  {d.flag === 'WORKED_ON_LEAVE' && <span className="perf-tag perf-tag--warn">Worked on off day</span>}
                  {d.inProgress && <span className="perf-tag">Today · not counted</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
