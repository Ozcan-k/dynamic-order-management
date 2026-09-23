import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import type { LiveRoleSnapshot, PerfDayOutcome, PerfRole, PerfWorkerRow } from '@dom/shared'
import { getTargetPerformance } from '../../api/performance'
import { addDays } from '../shared/DateNavigator'
import SectionHeader from '../shared/SectionHeader'
import { longDate, OUTCOME_COLOR, presetRange, rangeLabel, STATUS_OUTCOME } from '../../pages/reports/perf/perfUi'
import { ROLE_TEXT } from './model'

// Comparative performance under the workload cards (v2.90.0). Today uses the live
// floor already on the page; every other range reuses the Warehouse Report's
// target-performance endpoint + date presets, so the numbers match it exactly.

type Preset = 'today' | 'yesterday' | 'last7' | 'thisMonth'
type Metric = 'avg' | 'total'

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last7', label: '7 days' },
  { id: 'thisMonth', label: 'This month' },
]

interface Row {
  userId: string
  name: string
  sub: string | null
  value: number
  extra: number | null        // today: projected end-of-shift (drawn as a lighter extension)
  target: number | null       // per-row target tick
  outcome: PerfDayOutcome
  label: string
  detail: string
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
const pct = (r: number) => `${Math.round(r * 100)}%`

interface Props {
  role: PerfRole
  live: LiveRoleSnapshot | undefined
  today: string
}

export default function PerformanceCompare({ role, live, today }: Props) {
  const [preset, setPreset] = useState<Preset>('today')
  const [metric, setMetric] = useState<Metric>('avg')
  const text = ROLE_TEXT[role]

  const range = useMemo(() => {
    if (preset === 'today') return { from: today, to: today }
    if (preset === 'yesterday') { const y = addDays(today, -1); return { from: y, to: y } }
    const r = presetRange(preset, today)
    return { from: r.from, to: r.to }
  }, [preset, today])

  const report = useQuery({
    queryKey: ['reports', 'target-performance', role, range.from, range.to],
    queryFn: () => getTargetPerformance(role, range.from, range.to),
    enabled: preset !== 'today',
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })
  const data = preset !== 'today' && report.data?.role === role && report.data.from === range.from && report.data.to === range.to ? report.data : undefined

  // ─── Rows + team reference line ────────────────────────────────────────────
  const { rows, idle, teamRef, teamRefLabel, max, summary } = useMemo(() => {
    if (preset === 'today') {
      const workers = live?.board.workers ?? []
      const expected = workers.filter((w) => w.target > 0 || w.completed > 0)
      const rows: Row[] = expected
        .map((w) => ({
          userId: w.userId,
          name: w.username,
          sub: w.linked && w.displayName !== w.username ? w.displayName : null,
          value: w.completed,
          extra: live?.isLive && w.completed > 0 ? Math.max(w.completed, w.projected) : null,
          target: w.target || null,
          outcome: w.target > 0 ? w.outcome : ('OFF' as PerfDayOutcome),
          label: w.target > 0 ? `${fmt(w.completed)} / ${fmt(w.target)}` : fmt(w.completed),
          detail: w.completed > 0 ? `proj. ${fmt(w.projected)} · ${w.pacePerHour.toFixed(0)}/h` : w.state === 'NOT_STARTED' ? 'not started' : 'no output yet',
        }))
        // Live: rank by where each person is heading (projection vs own target) — the same basis as the colours
        .sort((a, b) => (b.target ? (b.extra ?? b.value) / b.target : 0) - (a.target ? (a.extra ?? a.value) / a.target : 0) || b.value - a.value)
      const withOutput = expected.filter((w) => w.completed > 0)
      const teamRef = withOutput.length ? withOutput.reduce((s, w) => s + w.completed, 0) / withOutput.length : null
      const max = Math.max(1, ...rows.map((r) => Math.max(r.extra ?? r.value, r.target ?? 0))) * 1.05
      const t = live?.board.totals
      return {
        rows,
        idle: workers.filter((w) => w.target === 0 && w.completed === 0).map((w) => w.username),
        teamRef,
        teamRefLabel: 'Team avg (workers with output)',
        max,
        summary: t ? [
          { label: 'Done today', value: fmt(t.completed), sub: `of ${fmt(t.target)} target` },
          { label: 'Projected', value: fmt(t.projected), sub: t.target ? `${pct(t.projected / t.target)} of target by shift end` : '' },
          { label: 'Team pace', value: `${t.pacePerHour.toFixed(0)}/h`, sub: `last hour ${fmt(t.lastHour)}` },
          { label: 'On track', value: `${t.onTrack} / ${t.onTrack + t.near + t.behind}`, sub: `${t.near} near · ${t.behind} behind` },
        ] : [],
      }
    }

    const src: PerfWorkerRow[] = data?.rows ?? []
    const active = src.filter((r) => r.totalOutput > 0 || r.activeDays > 0)
    const dailyTarget = data?.dailyTarget ?? 0
    const rows: Row[] = active
      .map((r) => {
        const value = metric === 'avg' ? r.avgPerActiveDay : r.totalOutput
        return {
          userId: r.userId,
          name: r.username,
          sub: r.linked && r.displayName !== r.username ? r.displayName : null,
          value,
          extra: null,
          target: metric === 'avg' ? dailyTarget : r.targetOutput || null,
          outcome: STATUS_OUTCOME[r.status],
          label: metric === 'avg' ? `${fmt(r.avgPerActiveDay)}/day` : fmt(r.totalOutput),
          detail: `${pct(r.achievement)} of target · met ${r.daysMetTarget}/${r.targetDays} day${r.targetDays === 1 ? '' : 's'}`,
        }
      })
      .sort((a, b) => b.value - a.value)
    const teamRef = metric === 'avg'
      ? (data?.summary.teamAvgPerActiveDay ?? null)
      : (active.length ? active.reduce((s, r) => s + r.totalOutput, 0) / active.length : null)
    const max = Math.max(1, ...rows.map((r) => Math.max(r.value, r.target ?? 0))) * 1.05
    const s = data?.summary
    return {
      rows,
      idle: src.filter((r) => r.totalOutput === 0 && r.activeDays === 0).map((r) => r.username),
      teamRef,
      teamRefLabel: metric === 'avg' ? 'Team avg / active day' : 'Team avg total',
      max,
      summary: s ? [
        { label: 'Team output', value: fmt(s.totalOutput), sub: `${s.workers} ${text.many.toLowerCase()}` },
        { label: 'Avg / active day', value: fmt(s.teamAvgPerActiveDay), sub: `target ${fmt(dailyTarget)}` },
        { label: 'Achievement', value: pct(s.achievement), sub: `${fmt(s.totalOutput)} of ${fmt(s.targetOutput)}` },
        { label: 'Days on target', value: pct(s.hitRate), sub: `${s.daysMetTarget} of ${s.targetDays} days` },
      ] : [],
    }
  }, [preset, live, data, metric, text.many])

  const loading = preset === 'today' ? !live : report.isLoading || (!data && report.isFetching)
  const reportHref = `/reports?tab=performance&role=${role}&from=${range.from}&to=${range.to}`
  const rangeText = preset === 'today' ? `Today · live` : preset === 'yesterday' ? `Yesterday · ${longDate(range.to)}` : rangeLabel(range.from, range.to)
  const note = preset === 'last7' ? 'Complete days only — ends yesterday.' : preset === 'thisMonth' && range.to === today ? 'Today is shown in the Warehouse Report but excluded from totals.' : null

  return (
    <div className="wl-section pc" style={{ '--wl-accent': text.accent, '--wl-soft': text.accentSoft } as React.CSSProperties}>
      <SectionHeader title={`${text.one} Performance`} />

      <div className="wl-toolbar">
        <div className="wl-seg" role="group" aria-label="Period">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" aria-pressed={preset === p.id} onClick={() => setPreset(p.id)}>{p.label}</button>
          ))}
        </div>
        <div className="pc-toolbar-right">
          {preset !== 'today' && (
            <div className="wl-seg" role="group" aria-label="Metric">
              <button type="button" aria-pressed={metric === 'avg'} onClick={() => setMetric('avg')}>Avg / day</button>
              <button type="button" aria-pressed={metric === 'total'} onClick={() => setMetric('total')}>Total</button>
            </div>
          )}
          <Link className="pc-link" to={reportHref}>Open in Warehouse Report →</Link>
        </div>
      </div>

      <div className="pc-card">
        <div className="pc-head">
          <div>
            <strong>{rangeText}</strong>
            {note && <span className="pc-note">{note}</span>}
          </div>
          <div className="pc-legend" aria-hidden="true">
            {(['MET', 'NEAR', 'BELOW'] as const).map((o) => (
              <span key={o}><i style={{ background: OUTCOME_COLOR[o].fill }} />{o === 'MET' ? 'On target' : o === 'NEAR' ? '90–99%' : 'Below 90%'}</span>
            ))}
            <span><i className="pc-lg-target" />Target</span>
            {teamRef !== null && <span><i className="pc-lg-avg" />Team avg</span>}
            {preset === 'today' && <span><i className="pc-lg-proj" />Projected</span>}
          </div>
        </div>

        {summary.length > 0 && (
          <div className="pc-summary">
            {summary.map((k) => (
              <div key={k.label} className="pc-kpi">
                <span>{k.label}</span>
                <b>{k.value}</b>
                <small>{k.sub}</small>
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div className="pc-skeleton" />
        ) : report.isError && preset !== 'today' ? (
          <div className="wl-empty">Could not load this period. <button type="button" onClick={() => report.refetch()}>Retry</button></div>
        ) : rows.length === 0 ? (
          <div className="wl-empty">No {text.many.toLowerCase()} {preset === 'today' ? 'are scheduled or active yet today' : 'had output in this period'}.</div>
        ) : (
          <ol className="pc-rows">
            {rows.map((r, i) => {
              const color = OUTCOME_COLOR[r.outcome]
              const employeeHref = `/reports?tab=employee&userId=${r.userId}&from=${range.from}&to=${range.to}`
              return (
                <li key={r.userId}>
                  <Link className="pc-row" to={employeeHref} title={`Open ${r.name} in the Warehouse Report`}>
                    <span className="pc-rank">{i + 1}</span>
                    <span className="pc-name">
                      <b>{r.name}</b>
                      {r.sub && <small>{r.sub}</small>}
                    </span>
                    <span className="pc-track">
                      {r.extra !== null && r.extra > r.value && (
                        <span className="pc-proj" style={{ left: `${(r.value / max) * 100}%`, width: `${((r.extra - r.value) / max) * 100}%`, background: color.fill }} />
                      )}
                      <span className="pc-fill" style={{ width: `${(r.value / max) * 100}%`, background: color.fill }} />
                      {r.target !== null && <i className="pc-target" style={{ left: `${Math.min(100, (r.target / max) * 100)}%` }} />}
                      {teamRef !== null && <i className="pc-avg" style={{ left: `${Math.min(100, (teamRef / max) * 100)}%` }} />}
                    </span>
                    <span className="pc-val">
                      <b>{r.label}</b>
                      <small style={{ color: r.outcome === 'OFF' ? undefined : color.ink }}>{r.detail}</small>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ol>
        )}

        {!loading && idle.length > 0 && (
          <p className="pc-foot">{preset === 'today' ? 'Off / no schedule today' : 'No output in this period'}: {idle.join(', ')}</p>
        )}
        {teamRef !== null && !loading && rows.length > 0 && (
          <p className="pc-foot">{teamRefLabel}: <b>{fmt(teamRef)}</b></p>
        )}
      </div>
    </div>
  )
}
