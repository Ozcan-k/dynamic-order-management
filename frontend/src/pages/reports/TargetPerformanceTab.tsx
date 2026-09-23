import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { PERF_STATUS_LABEL, type PerfDay, type PerfRole, type PerfStatus, type PerfTeamReport, type PerfWorkerRow } from '@dom/shared'
import { getTargetPerformance } from '../../api/performance'
import {
  ATTENDANCE_SHORT,
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
  ROLE_LABEL,
  RangePicker,
  STATUS_OUTCOME,
  StatusPill,
  TARGET_INK,
  TipShell,
  apiError,
  dayCount,
  fmt1,
  fmtDays,
  fmtInt,
  fmtPct,
  longDate,
  rangeLabel,
  relDelta,
  shortDate,
  weekdayOf,
  type PerfRange,
} from './perf/perfUi'
import { exportTargetXlsx } from './perf/exportTargetXlsx'

interface Props {
  role: PerfRole
  onRoleChange: (r: PerfRole) => void
  range: PerfRange
  onRangeChange: (r: PerfRange) => void
  today: string
  onOpenEmployee: (userId: string) => void
}

export default function TargetPerformanceTab({ role, onRoleChange, range, onRangeChange, today, onOpenEmployee }: Props) {
  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['reports', 'target-performance', role, range.from, range.to],
    queryFn: () => getTargetPerformance(role, range.from, range.to),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
  const [exporting, setExporting] = useState(false)
  const label = ROLE_LABEL[role]
  // a previous role's data can linger for a frame while the new one loads
  const report = data && data.role === role ? data : undefined

  function handleExport() {
    if (!report) return
    setExporting(true)
    try {
      exportTargetXlsx(report)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="perf-root" data-role={role}>
      {/* ── Filters ── */}
      <div className="perf-hero">
        <div>
          <div className="perf-hero-label">Target Performance</div>
          <div className="perf-hero-title">
            {label.many} · Daily target {fmtInt(report?.dailyTarget ?? (role === 'PICKER' ? 210 : 280))}
          </div>
          <div className="perf-hero-sub">
            {rangeLabel(range.from, range.to)} · {dayCount(range.from, range.to)} days{isFetching ? ' · updating…' : ''}
          </div>
        </div>
        <div className="perf-hero-controls">
          <div className="perf-seg" role="group" aria-label="Role">
            {(['PICKER', 'PACKER'] as const).map((r) => (
              <button key={r} type="button" aria-pressed={role === r} onClick={() => onRoleChange(r)}>
                {ROLE_LABEL[r].many}
              </button>
            ))}
          </div>
          <RangePicker value={range} today={today} onChange={onRangeChange} />
          <button type="button" className="perf-btn-white" onClick={handleExport} disabled={!report || exporting}>
            {Icons.download} Excel
          </button>
        </div>
      </div>

      {isLoading && !report && <LoadingBlock />}
      {isError && !report && <ErrorBlock message={apiError(error)} />}
      {report && <ReportBody report={report} onOpenEmployee={onOpenEmployee} />}
    </div>
  )
}

// ─── Body ────────────────────────────────────────────────────────────────────

function ReportBody({ report, onOpenEmployee }: { report: PerfTeamReport; onOpenEmployee: (id: string) => void }) {
  const [showIdle, setShowIdle] = useState(false)
  const label = ROLE_LABEL[report.role]
  const s = report.summary
  const active = report.rows.filter((r) => r.status !== 'NO_ACTIVITY')
  const idle = report.rows.filter((r) => r.status === 'NO_ACTIVITY')
  const visible = showIdle ? report.rows : active
  const includesToday = report.dates.includes(report.today)
  const avgVsTarget = relDelta(s.teamAvgPerActiveDay, report.dailyTarget)

  return (
    <>
      {(includesToday || report.unlinkedCount > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {includesToday && (
            <div className="perf-note perf-note--info">
              <span aria-hidden="true">ⓘ</span>
              <span><strong>Today is still in progress.</strong> It is shown in the daily grid but excluded from every total, average and rate.</span>
            </div>
          )}
          {report.unlinkedCount > 0 && (
            <div className="perf-note">
              <span aria-hidden="true">⚑</span>
              <span>
                <strong>{report.unlinkedCount} of {report.rows.length} {label.many.toLowerCase()}</strong> are not linked to an Employee Schedule record,
                so their day offs and leaves can't be applied — any day with output counts as a working day.
                Link them in <strong>Employee Schedule → Employees → Edit → Linked system user</strong>.
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── KPIs ── */}
      <div className="perf-kpis">
        <KpiTile label="Daily Target" icon={Icons.target} value={fmtInt(report.dailyTarget)} unit="/ day"
          sub={<span>per working day · Half Day = {fmtInt(report.dailyTarget / 2)}</span>} color="#334155" />
        <KpiTile label="Total Output" icon={Icons.box} value={fmtInt(s.totalOutput)}
          sub={<span>{fmtDays(s.activeDays)} active days · {active.length} {active.length === 1 ? label.one.toLowerCase() : label.many.toLowerCase()}</span>} />
        <KpiTile label="Team Avg / Active Day" icon={Icons.avg} value={fmt1(s.teamAvgPerActiveDay)}
          color={OUTCOME_COLOR[STATUS_OUTCOME[teamStatus(s.achievement, s.activeDays)]].fill}
          progress={s.teamAvgPerActiveDay / report.dailyTarget}
          sub={s.activeDays > 0 ? <><Delta value={avgVsTarget} /> <span>vs target</span></> : <span>No working days</span>} />
        <KpiTile label="Target Days Met" icon={Icons.check} value={fmtInt(s.daysMetTarget)} unit={`/ ${fmtInt(s.targetDays)}`}
          color={OUTCOME_COLOR.MET.fill} sub={<span>working days on or above target</span>} />
        <KpiTile label="Overall Hit Rate" icon={Icons.hit} value={fmtPct(s.hitRate)} color="#7c3aed"
          progress={s.hitRate} sub={<span>Achievement {fmtPct(s.achievement)} of target output</span>} />
      </div>

      {active.length === 0 ? (
        <div className="perf-card">
          <div className="perf-empty">
            <strong>No {label.one.toLowerCase()} activity in this period</strong>
            Pick a different date range or role.
          </div>
        </div>
      ) : (
        <>
          <div className="perf-grid-2">
            <Card
              title="Average per active day vs target"
              sub={`Ranked by average output per working day · dashed line = ${fmtInt(report.dailyTarget)} target`}
              actions={<OutcomeLegend />}
            >
              <RankingChart rows={active} target={report.dailyTarget} onOpen={onOpenEmployee} />
            </Card>
            <Card title="Team status mix" sub={`${active.length} active ${label.many.toLowerCase()} by period achievement`}>
              <StatusMix rows={active} />
            </Card>
          </div>

          <Card
            title="Team average per active worker — by day"
            sub="Each bar = that day's output ÷ workers expected that day. Colour shows the day vs target."
            actions={<OutcomeLegend />}
          >
            <TeamDailyChart report={report} />
          </Card>

          <Card
            title="Performance ranking"
            sub="Based on average output per active day · click a name for the employee report"
            flush
          >
            <RankingTable rows={visible} summary={s} target={report.dailyTarget} onOpen={onOpenEmployee} roleOne={label.one} />
            {idle.length > 0 && (
              <div className="perf-idle-toggle">
                <button type="button" className="perf-link-btn" onClick={() => setShowIdle((v) => !v)}>
                  {showIdle ? 'Hide' : 'Show'} {idle.length} {idle.length === 1 ? label.one.toLowerCase() : label.many.toLowerCase()} with no activity
                </button>
              </div>
            )}
          </Card>

          <Card
            title="Daily performance"
            sub="Output per day, coloured against the daily target. Grey = off / leave (not counted)."
            actions={<OutcomeLegend showLeave showHalf />}
            flush
          >
            <DailyMatrix report={report} rows={visible} onOpen={onOpenEmployee} />
          </Card>
        </>
      )}
    </>
  )
}

function teamStatus(achievement: number, activeDays: number): PerfStatus {
  if (activeDays === 0) return 'NO_ACTIVITY'
  if (achievement >= 1) return 'TARGET_ACHIEVED'
  if (achievement >= 0.9) return 'NEAR_TARGET'
  return 'BELOW_TARGET'
}

// ─── Charts ──────────────────────────────────────────────────────────────────

function GradientDefs({ horizontal }: { horizontal?: boolean }) {
  return (
    <defs>
      {(['MET', 'NEAR', 'BELOW', 'OFF', 'IN_PROGRESS'] as const).map((o) => (
        <linearGradient key={o} id={`perf-g-${horizontal ? 'h' : 'v'}-${o}`} x1="0" y1={horizontal ? '0' : '1'} x2={horizontal ? '1' : '0'} y2="0">
          <stop offset="0%" stopColor={OUTCOME_COLOR[o].fill} stopOpacity={0.7} />
          <stop offset="100%" stopColor={OUTCOME_COLOR[o].fill} stopOpacity={1} />
        </linearGradient>
      ))}
    </defs>
  )
}

function RankingChart({ rows, target, onOpen }: { rows: PerfWorkerRow[]; target: number; onOpen: (id: string) => void }) {
  const data = rows.map((r) => ({
    id: r.userId,
    name: r.displayName,
    avg: Math.round(r.avgPerActiveDay * 10) / 10,
    outcome: STATUS_OUTCOME[r.status],
    row: r,
  }))
  const max = Math.max(target * 1.15, ...data.map((d) => d.avg * 1.08))
  const height = Math.max(160, data.length * 34 + 36)
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 18, right: 52, bottom: 0, left: 4 }} barCategoryGap={8}>
          <GradientDefs horizontal />
          <CartesianGrid horizontal={false} stroke={GRID_STROKE} strokeOpacity={0.18} />
          <XAxis type="number" domain={[0, niceMax(max)]} ticks={niceTicks(max)} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={128}
            tick={{ fontSize: 12, fill: '#0f172a', fontWeight: 600 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: string) => (v.length > 17 ? `${v.slice(0, 16)}…` : v)}
          />
          <Tooltip
            cursor={{ fill: 'rgba(148,163,184,0.10)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const r = (payload[0].payload as { row: PerfWorkerRow }).row
              return (
                <TipShell
                  title={`#${r.rank} ${r.displayName}`}
                  rows={[
                    { label: 'Avg / active day', value: fmt1(r.avgPerActiveDay), color: OUTCOME_COLOR[STATUS_OUTCOME[r.status]].fill },
                    { label: 'Target', value: fmtInt(target) },
                    { label: 'Achievement', value: fmtPct(r.achievement) },
                    { label: 'Active days', value: fmtDays(r.activeDays) },
                    { label: 'Total output', value: fmtInt(r.totalOutput) },
                  ]}
                />
              )
            }}
          />
          <ReferenceLine
            x={target}
            stroke={TARGET_INK}
            strokeDasharray="5 4"
            strokeWidth={1.5}
            label={{ value: `Target ${target}`, position: 'top', fontSize: 11, fontWeight: 700, fill: TARGET_INK }}
          />
          <Bar
            dataKey="avg"
            barSize={18}
            radius={[0, 6, 6, 0]}
            isAnimationActive
            animationDuration={700}
            cursor="pointer"
            onClick={(d: unknown) => {
              const id = (d as { id?: string; payload?: { id?: string } })?.id ?? (d as { payload?: { id?: string } })?.payload?.id
              if (id) onOpen(id)
            }}
          >
            {data.map((d) => <Cell key={d.id} fill={`url(#perf-g-h-${d.outcome})`} />)}
            <LabelList dataKey="avg" position="right" formatter={(v: unknown) => fmt1(Number(v))} style={{ fontSize: 11.5, fontWeight: 700, fill: '#0f172a' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function StatusMix({ rows }: { rows: PerfWorkerRow[] }) {
  const counts = (['TARGET_ACHIEVED', 'NEAR_TARGET', 'BELOW_TARGET'] as const).map((st) => ({
    status: st as PerfStatus,
    rows: rows.filter((r) => r.status === st),
  }))
  const total = rows.length
  const top = rows[0]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <MixRing
          centerLabel="Active"
          centerValue={total}
          segments={counts.map((c) => ({
            label: PERF_STATUS_LABEL[c.status],
            value: c.rows.length,
            color: OUTCOME_COLOR[STATUS_OUTCOME[c.status]].fill,
          }))}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {counts.map((c) => {
          const o = OUTCOME_COLOR[STATUS_OUTCOME[c.status]]
          const pct = total > 0 ? c.rows.length / total : 0
          return (
            <div key={c.status} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 4, alignItems: 'center' }}>
              <span style={{ justifySelf: 'start' }}><StatusPill status={c.status} /></span>
              <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#0f172a' }}>
                {c.rows.length} <span style={{ color: '#94a3b8', fontWeight: 600 }}>· {fmtPct(pct)}</span>
              </span>
              <div style={{ gridColumn: '1 / -1', height: 6, background: '#eef2f7', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: `${pct * 100}%`, height: '100%', background: o.fill, borderRadius: 999, transition: 'width .6s ease' }} />
              </div>
            </div>
          )
        })}
      </div>
      {top && (
        <div className="perf-note" style={{ alignItems: 'center' }}>
          <span className="perf-rank perf-rank--1" aria-hidden="true">1</span>
          <span><strong>{top.displayName}</strong> leads with {fmt1(top.avgPerActiveDay)} / active day ({fmtPct(top.achievement)} of target).</span>
        </div>
      )}
    </div>
  )
}

function TeamDailyChart({ report }: { report: PerfTeamReport }) {
  const target = report.dailyTarget
  const data = report.daily.map((d) => {
    const avg = Math.round(d.avgPerActiveWorker * 10) / 10
    const outcome = d.inProgress ? 'IN_PROGRESS'
      : d.activeWorkers === 0 ? 'OFF'
      : avg >= target ? 'MET' : avg >= target * 0.9 ? 'NEAR' : 'BELOW'
    return { ...d, avg, outcome, label: shortDate(d.date) }
  })
  const max = Math.max(target * 1.15, ...data.map((d) => d.avg * 1.08))
  return (
    <div style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 22, right: 16, bottom: 0, left: 0 }} barCategoryGap="18%">
          <GradientDefs />
          <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeOpacity={0.18} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} interval="preserveStartEnd" minTickGap={14} />
          <YAxis domain={[0, niceMax(max)]} ticks={niceTicks(max)} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={40} />
          <Tooltip
            cursor={{ fill: 'rgba(148,163,184,0.10)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as (typeof data)[number]
              return (
                <TipShell
                  title={`${longDate(d.date)}${d.inProgress ? ' · in progress' : ''}`}
                  rows={[
                    { label: 'Avg / active worker', value: fmt1(d.avg), color: OUTCOME_COLOR[d.outcome as keyof typeof OUTCOME_COLOR].fill },
                    { label: 'Target', value: fmtInt(target) },
                    { label: 'Team output', value: fmtInt(d.output) },
                    { label: 'Workers expected', value: fmtDays(d.activeWorkers) },
                  ]}
                />
              )
            }}
          />
          <ReferenceLine
            y={target}
            stroke={TARGET_INK}
            strokeDasharray="5 4"
            strokeWidth={1.5}
            label={{ value: `Target ${target}`, position: 'insideTopRight', fontSize: 11, fontWeight: 700, fill: TARGET_INK }}
          />
          <Bar dataKey="avg" radius={[6, 6, 0, 0]} maxBarSize={30} isAnimationActive animationDuration={700}>
            {data.map((d) => <Cell key={d.date} fill={`url(#perf-g-v-${d.outcome})`} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Ranking table ───────────────────────────────────────────────────────────

function CellBar({ ratio, color, label, goal = true }: { ratio: number; color: string; label: string; goal?: boolean }) {
  // track = 0…120% so the 100% goal marker sits at 5/6 of the width
  const width = Math.max(0, Math.min(1.2, ratio)) / 1.2
  return (
    <span className="perf-cellbar">
      <span className="perf-cellbar-track">
        <span className="perf-cellbar-fill" style={{ width: `${width * 100}%`, background: color }} />
        {goal && <span className="perf-cellbar-goal" style={{ left: `${(1 / 1.2) * 100}%` }} />}
      </span>
      <span className="perf-cellbar-val">{label}</span>
    </span>
  )
}

function RankingTable({ rows, summary, target, onOpen, roleOne }: {
  rows: PerfWorkerRow[]
  summary: PerfTeamReport['summary']
  target: number
  onOpen: (id: string) => void
  roleOne: string
}) {
  return (
    <div className="perf-table-wrap">
      <table className="perf-table">
        <thead>
          <tr>
            <th className="c">Rank</th>
            <th className="l">{roleOne}</th>
            <th>Total Output</th>
            <th>Active Days</th>
            <th>Target Output</th>
            <th>Avg / Active Day</th>
            <th>Achievement %</th>
            <th className="c" title="Days on or above target / working days">Days Met</th>
            <th>Hit Rate</th>
            <th>Best Day</th>
            <th className="c">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const idle = r.status === 'NO_ACTIVITY'
            const o = OUTCOME_COLOR[STATUS_OUTCOME[r.status]]
            return (
              <tr key={r.userId} style={idle ? { opacity: 0.6 } : undefined}>
                <td className="c">
                  {r.rank ? <span className={`perf-rank${r.rank <= 3 ? ` perf-rank--${r.rank}` : ''}`}>{r.rank}</span> : <span className="perf-muted">—</span>}
                </td>
                <td className="l">
                  <button type="button" className="perf-person" onClick={() => onOpen(r.userId)} title="Open employee report">
                    <span>
                      <span className="perf-person-name">{r.displayName}</span>
                      <span className="perf-person-meta">
                        {!r.linked && <span className="perf-unlinked" title="Not linked to Employee Schedule — attendance not applied" aria-label="Not linked to Employee Schedule" />}
                        @{r.username}{r.empNo ? ` · #${r.empNo}` : ''}
                      </span>
                    </span>
                  </button>
                </td>
                <td className="perf-strong">{fmtInt(r.totalOutput)}</td>
                <td>{fmtDays(r.activeDays)}</td>
                <td className="perf-muted">{fmtInt(r.targetOutput)}</td>
                <td>
                  <span className="perf-strong">{fmt1(r.avgPerActiveDay)}</span>
                </td>
                <td>{idle ? <span className="perf-muted">—</span> : <CellBar ratio={r.achievement} color={o.fill} label={fmtPct(r.achievement)} />}</td>
                <td className="c">{r.daysMetTarget}<span className="perf-muted"> / {r.targetDays}</span></td>
                <td>{idle ? <span className="perf-muted">—</span> : <CellBar ratio={r.hitRate} color="#7c3aed" label={fmtPct(r.hitRate)} goal={false} />}</td>
                <td title={r.bestDayDate ? longDate(r.bestDayDate) : undefined}>
                  {fmtInt(r.bestDay)}
                  {r.bestDay >= target && <span aria-label="met target" style={{ color: OUTCOME_COLOR.MET.fill, marginLeft: 4 }}>★</span>}
                </td>
                <td className="c"><StatusPill status={r.status} short /></td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <td />
            <td className="l">Team total</td>
            <td>{fmtInt(summary.totalOutput)}</td>
            <td>{fmtDays(summary.activeDays)}</td>
            <td>{fmtInt(summary.targetOutput)}</td>
            <td>{fmt1(summary.teamAvgPerActiveDay)}</td>
            <td>{fmtPct(summary.achievement)}</td>
            <td style={{ textAlign: 'center' }}>{summary.daysMetTarget} / {summary.targetDays}</td>
            <td>{fmtPct(summary.hitRate)}</td>
            <td />
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ─── Daily matrix ────────────────────────────────────────────────────────────

function cellTitle(name: string, d: PerfDay): string {
  const lines = [`${name} · ${longDate(d.date)}`]
  if (d.attendance) lines.push(`Schedule: ${ATTENDANCE_TEXT[d.attendance]}`)
  if (d.inProgress) lines.push(`Output so far: ${fmtInt(d.output)} (day in progress)`)
  else if (d.factor > 0) lines.push(`Output: ${fmtInt(d.output)} / target ${fmtInt(d.target)} (${fmtPct(d.target ? d.output / d.target : 0)})`)
  else lines.push(d.output > 0 ? `Output: ${fmtInt(d.output)}` : 'No output — not counted')
  if (d.flag === 'NO_SCHEDULE') lines.push('⚑ No schedule entry — counted as a working day')
  if (d.flag === 'WORKED_ON_LEAVE') lines.push('⚑ Worked on a scheduled off / leave day — counted')
  return lines.join('\n')
}

function MatrixCell({ name, d }: { name: string; d: PerfDay }) {
  let cls = `perf-mcell perf-mcell--${d.outcome}`
  let content: string
  if (d.outcome === 'OFF') {
    if (d.attendance && d.attendance !== 'PRESENT') {
      cls = 'perf-mcell perf-mcell--LEAVE'
      content = ATTENDANCE_SHORT[d.attendance]
    } else content = '·'
  } else {
    content = fmtInt(d.output)
    if (d.outcome === 'MET' && d.output >= d.target * 1.15) cls += ' strong'
    if (d.outcome === 'BELOW' && d.output < d.target * 0.5) cls += ' weak'
  }
  return (
    <td className={cls} title={cellTitle(name, d)}>
      {d.factor === 0.5 && <span className="half" aria-label="half day">½</span>}
      {d.flag && <span className="flag" aria-hidden="true" />}
      {content}
    </td>
  )
}

function DailyMatrix({ report, rows, onOpen }: { report: PerfTeamReport; rows: PerfWorkerRow[]; onOpen: (id: string) => void }) {
  const dates = report.dates
  const teamByDate = useMemo(() => new Map(report.daily.map((d) => [d.date, d])), [report.daily])
  return (
    <div className="perf-matrix-wrap">
      <table className="perf-matrix">
        <thead>
          <tr>
            <th className="name">{ROLE_LABEL[report.role].one}</th>
            {dates.map((d) => (
              <th key={d} className={d === report.today ? 'today' : undefined}>
                <span className="wd">{weekdayOf(d).slice(0, 2)}</span>
                {shortDate(d).split(' ')[1]}
              </th>
            ))}
            <th style={{ textAlign: 'right', paddingRight: 8 }}>Total</th>
            <th style={{ textAlign: 'right', paddingRight: 8 }}>Avg</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId}>
              <td className="name">
                <button type="button" className="perf-person" onClick={() => onOpen(r.userId)} style={{ fontWeight: 700 }} title={r.displayName}>
                  <span className="perf-person-name">{r.displayName}</span>
                </button>
              </td>
              {r.days.map((d) => <MatrixCell key={d.date} name={r.displayName} d={d} />)}
              <td className="tot">{fmtInt(r.totalOutput)}</td>
              <td className="tot avg">{fmt1(r.avgPerActiveDay)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="name">Team output</td>
            {dates.map((d) => {
              const t = teamByDate.get(d)
              return <td key={d} title={t ? `${fmtDays(t.activeWorkers)} workers · avg ${fmt1(t.avgPerActiveWorker)}` : undefined}>{t && t.output > 0 ? fmtInt(t.output) : '·'}</td>
            })}
            <td className="tot">{fmtInt(report.summary.totalOutput)}</td>
            <td className="tot avg">{fmt1(report.summary.teamAvgPerActiveDay)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
