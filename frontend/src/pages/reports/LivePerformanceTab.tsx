import { useEffect, useMemo, useRef, useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AttendanceStatus, LIVE_IDLE_MINUTES, type LiveBoard, type LiveRoleBoard, type LiveState, type LiveWorker, type PerfRole } from '@dom/shared'
import { getLiveBoard } from '../../api/performance'
import { addDays } from '../../components/shared/DateNavigator'
import { getManilaDateString } from '../../lib/manila'
import { getSocket } from '../../lib/socket'
import {
  ATTENDANCE_TEXT,
  Delta,
  ErrorBlock,
  GRID_STROKE,
  LoadingBlock,
  OUTCOME_COLOR,
  OutcomeIcon,
  ROLE_ACCENT,
  ROLE_LABEL,
  TipShell,
  apiError,
  fmt1,
  fmtInt,
  fmtPct,
  initialsOf,
  longDate,
  relDelta,
  scheduledHoursLabel,
} from './perf/perfUi'

// ════════════════════════════════════════════════════════════════════════════
// Live floor (v2.85.0) — who is working right now, how fast, and whether they
// will reach today's target. Backed by GET /reports/live-board.
// ════════════════════════════════════════════════════════════════════════════

const STATE_META: Record<LiveState, { label: string; color: string; bg: string; order: number }> = {
  WORKING: { label: 'Working', color: '#16a34a', bg: '#dcfce7', order: 0 },
  IDLE: { label: 'Idle', color: '#d97706', bg: '#fef3c7', order: 1 },
  NOT_STARTED: { label: 'Not started', color: '#dc2626', bg: '#fee2e2', order: 2 },
  DONE: { label: 'Shift done', color: '#475569', bg: '#f1f5f9', order: 3 },
  OFF: { label: 'Off', color: '#94a3b8', bg: '#f8fafc', order: 4 },
  NO_ACTIVITY: { label: 'No activity', color: '#94a3b8', bg: '#f8fafc', order: 5 },
}

type Filter = 'ALL' | 'WORKING' | 'IDLE' | 'NOT_STARTED' | 'BEHIND' | 'OFF'
type SortKey = 'output' | 'progress' | 'pace'

/** Sequential ramp per role for the worker × hour heatmap (light → dark). */
const HEAT_RAMP: Record<PerfRole, string[]> = {
  PICKER: ['#eff6ff', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#1d4ed8'],
  PACKER: ['#ecfeff', '#a5f3fc', '#67e8f9', '#22d3ee', '#0891b2', '#155e75'],
}

function hh(h: number): string {
  return `${String(h).padStart(2, '0')}:00`
}

function clockOf(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' })
}

function agoLabel(min: number | null): string {
  if (min === null) return ''
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  return `${h}h ${min % 60}m ago`
}

/** Hours to show on charts: first active hour − 1 → max(last active, now) + 1, at least 07–18. */
function hourWindow(hourly: number[], currentHour: number | null): number[] {
  let first = hourly.findIndex((v) => v > 0)
  let last = 23 - [...hourly].reverse().findIndex((v) => v > 0)
  if (first < 0) { first = 7; last = 18 }
  const from = Math.max(0, Math.min(first - 1, 7))
  const to = Math.min(23, Math.max(last + 1, currentHour ?? 0, 18))
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}

export default function LivePerformanceTab({ onOpenEmployee, initialRole, initialDate }: {
  onOpenEmployee?: (userId: string) => void
  /** Deep link (v2.93.0, from Picker / Packer Admin): open on this role … */
  initialRole?: PerfRole
  /** … and this past day ('' / undefined = today, live). */
  initialDate?: string
}) {
  const queryClient = useQueryClient()
  const todayStr = getManilaDateString()
  const yesterdayStr = addDays(todayStr, -1)
  const [selectedDate, setSelectedDate] = useState<string>(initialDate ?? '') // '' = today (live)
  const [customMode, setCustomMode] = useState(false)
  const [socketConnected, setSocketConnected] = useState<boolean>(() => getSocket()?.connected ?? false)
  const [role, setRole] = useState<PerfRole>(initialRole ?? 'PICKER')
  const [filter, setFilter] = useState<Filter>('ALL')
  const [tick, setTick] = useState(0) // re-renders "x min ago" between polls

  const isHistorical = selectedDate !== ''
  const { data, isLoading, isError, error, dataUpdatedAt, isFetching } = useQuery({
    queryKey: ['reports', 'live-board', selectedDate],
    queryFn: () => getLiveBoard(selectedDate || undefined),
    refetchInterval: isHistorical ? false : 30_000,
    staleTime: isHistorical ? 5 * 60_000 : 10_000,
    refetchOnWindowFocus: !isHistorical,
    placeholderData: keepPreviousData,
  })

  // Socket push: every picker/packer transition emits order:stats_changed. Throttle to one
  // refetch per 5 s so a busy floor doesn't hammer the endpoint.
  const lastInvalidate = useRef(0)
  useEffect(() => {
    if (isHistorical) return
    const socket = getSocket()
    if (!socket) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const invalidate = () => {
      if (timer) return
      const wait = Math.max(0, 5_000 - (Date.now() - lastInvalidate.current))
      timer = setTimeout(() => {
        timer = null
        lastInvalidate.current = Date.now()
        queryClient.invalidateQueries({ queryKey: ['reports', 'live-board', ''] })
      }, wait)
    }
    const onConnect = () => setSocketConnected(true)
    const onDisconnect = () => setSocketConnected(false)
    setSocketConnected(socket.connected)
    socket.on('order:stats_changed', invalidate)
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    return () => {
      if (timer) clearTimeout(timer)
      socket.off('order:stats_changed', invalidate)
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
    }
  }, [queryClient, isHistorical])

  useEffect(() => {
    if (isHistorical) return
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [isHistorical])

  const board = data && (isHistorical ? data.date === selectedDate : data.isLive) ? data : undefined
  // minutes elapsed since the server built the snapshot — keeps "x min ago" honest between polls
  const drift = board?.isLive && tick >= 0 ? Math.max(0, Math.floor((Date.now() - new Date(board.generatedAt).getTime()) / 60_000)) : 0

  const preset: 'today' | 'yesterday' | 'custom' = customMode ? 'custom' : selectedDate === '' ? 'today' : selectedDate === yesterdayStr ? 'yesterday' : 'custom'
  const activeDate = selectedDate || todayStr

  return (
    <div className="perf-root" data-role={role}>
      {/* ── Header ── */}
      <div className="perf-hero live-hero">
        <div>
          <div className="perf-hero-label">{isHistorical ? 'Floor replay' : 'Live floor'}</div>
          <div className="perf-hero-title">{isHistorical ? longDate(activeDate) : `Today · ${longDate(todayStr)}`}</div>
          <div className="perf-hero-sub">
            Targets: Picker {board?.roles.PICKER.dailyTarget ?? 210} · Packer {board?.roles.PACKER.dailyTarget ?? 280} per working day
          </div>
        </div>
        <div className="perf-hero-controls">
          <div className="preset-btn-group" role="group" aria-label="Day">
            <button type="button" className={`preset-btn${preset === 'today' ? ' preset-btn--active' : ''}`} aria-pressed={preset === 'today'}
              onClick={() => { setCustomMode(false); setSelectedDate('') }}>Today</button>
            <button type="button" className={`preset-btn${preset === 'yesterday' ? ' preset-btn--active' : ''}`} aria-pressed={preset === 'yesterday'}
              onClick={() => { setCustomMode(false); setSelectedDate(yesterdayStr) }}>Yesterday</button>
            <button type="button" className={`preset-btn${preset === 'custom' ? ' preset-btn--active' : ''}`} aria-pressed={preset === 'custom'}
              onClick={() => { setSelectedDate(activeDate === todayStr ? yesterdayStr : activeDate); setCustomMode(true) }}>Custom</button>
          </div>
          {preset === 'custom' && (
            <input type="date" className="perf-date-input" aria-label="Day" value={activeDate} min={addDays(todayStr, -89)} max={todayStr}
              onChange={(e) => {
                const v = e.target.value
                if (!v || v === todayStr) { setCustomMode(false); setSelectedDate(''); return }
                setSelectedDate(v)
                setCustomMode(true)
              }} />
          )}
          <LivePill isLive={!isHistorical} connected={socketConnected} updatedAt={dataUpdatedAt} fetching={isFetching} />
        </div>
      </div>

      {isLoading && !board && <LoadingBlock />}
      {isError && !board && <ErrorBlock message={apiError(error)} />}
      {board && (
        <LiveBody
          board={board}
          role={role}
          onRole={(r) => { setRole(r); setFilter('ALL') }}
          filter={filter}
          onFilter={setFilter}
          drift={drift}
          onOpenEmployee={onOpenEmployee}
        />
      )}
    </div>
  )
}

function LivePill({ isLive, connected, updatedAt, fetching }: { isLive: boolean; connected: boolean; updatedAt: number; fetching: boolean }) {
  if (!isLive) {
    return <span className="live-pill live-pill--past"><i />Replay · final numbers</span>
  }
  const t = updatedAt ? new Date(updatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Manila' }) : '—'
  return (
    <span className={`live-pill${connected ? '' : ' live-pill--poll'}`} aria-live="polite">
      <i className={fetching ? 'blink' : ''} />
      {connected ? 'Live' : 'Polling'} · updated {t}
    </span>
  )
}

// ─── Body ────────────────────────────────────────────────────────────────────

function LiveBody({ board, role, onRole, filter, onFilter, drift, onOpenEmployee }: {
  board: LiveBoard
  role: PerfRole
  onRole: (r: PerfRole) => void
  filter: Filter
  onFilter: (f: Filter) => void
  drift: number
  onOpenEmployee?: (userId: string) => void
}) {
  const current = board.roles[role]
  const combinedHourly = board.roles.PICKER.hourly.map((v, i) => v + board.roles.PACKER.hourly[i])
  const hours = hourWindow(combinedHourly, board.currentHour)
  const jump = (r: PerfRole, f: Filter) => {
    onRole(r)
    onFilter(f)
    document.getElementById('live-team')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  return (
    <>
      {board.isLive && <AttentionStrip board={board} drift={drift} onJump={jump} />}

      <div className="perf-grid-2 perf-grid-2--even">
        <RoleScore board={board.roles.PICKER} isLive={board.isLive} active={role === 'PICKER'} onSelect={() => onRole('PICKER')} />
        <RoleScore board={board.roles.PACKER} isLive={board.isLive} active={role === 'PACKER'} onSelect={() => onRole('PACKER')} />
      </div>

      <section className="perf-card">
        <header className="perf-card-head">
          <div>
            <h3 className="perf-card-title">Output by hour</h3>
            <p className="perf-card-sub">Orders completed per hour (Manila){board.isLive ? ' · shaded column = current hour, still filling' : ''}</p>
          </div>
          <div className="perf-legend">
            <span className="perf-legend-item"><span className="perf-swatch" style={{ background: ROLE_ACCENT.PICKER.main }} />Pickers</span>
            <span className="perf-legend-item"><span className="perf-swatch" style={{ background: ROLE_ACCENT.PACKER.main }} />Packers</span>
          </div>
        </header>
        <div className="perf-card-body">
          <HourlyFlow board={board} hours={hours} />
        </div>
      </section>

      <section className="perf-card" id="live-team" style={{ scrollMarginTop: 12 }}>
        <header className="perf-card-head">
          <div>
            <h3 className="perf-card-title">Team — {board.isLive ? 'live leaderboard' : 'day leaderboard'}</h3>
            <p className="perf-card-sub">
              Bar = done vs target{board.isLive ? '; lighter extension = projected by end of shift at the current pace' : ''} · click a name for the employee report
            </p>
          </div>
          <div className="live-seg" role="group" aria-label="Role">
            {(['PICKER', 'PACKER'] as const).map((r) => (
              <button key={r} type="button" aria-pressed={role === r} onClick={() => onRole(r)} data-role={r}>
                {ROLE_LABEL[r].many}
                <span>{board.roles[r].workers.filter((w) => w.state !== 'NO_ACTIVITY' && w.state !== 'OFF').length}</span>
              </button>
            ))}
          </div>
        </header>
        <Leaderboard board={current} isLive={board.isLive} filter={filter} onFilter={onFilter} drift={drift} onOpenEmployee={onOpenEmployee} />
      </section>

      <section className="perf-card">
        <header className="perf-card-head">
          <div>
            <h3 className="perf-card-title">Who worked when — {ROLE_LABEL[role].many.toLowerCase()}</h3>
            <p className="perf-card-sub">Completions per worker per hour. Darker = more orders{board.isLive ? '; outlined column = now' : ''}.</p>
          </div>
          <HeatLegend role={role} />
        </header>
        <Heatmap board={current} hours={hours} currentHour={board.currentHour} onOpenEmployee={onOpenEmployee} />
      </section>
    </>
  )
}

// ─── Attention strip ─────────────────────────────────────────────────────────

function AttentionStrip({ board, drift, onJump }: { board: LiveBoard; drift: number; onJump: (r: PerfRole, f: Filter) => void }) {
  type Line = { filter: Filter; tone: 'amber' | 'red' | 'orange'; label: string; people: string[] }
  const cards = (['PICKER', 'PACKER'] as const).map((role) => {
    const ws = board.roles[role].workers
    const lines: Line[] = []
    const idle = ws.filter((w) => w.state === 'IDLE')
    const notStarted = ws.filter((w) => w.state === 'NOT_STARTED')
    const behind = ws.filter((w) => w.target > 0 && w.outcome === 'BELOW' && (w.state === 'WORKING' || w.state === 'IDLE'))
    if (idle.length) {
      lines.push({
        filter: 'IDLE', tone: 'amber', label: `Idle ${LIVE_IDLE_MINUTES}+ min`,
        people: idle.map((w) => `${w.displayName} (${agoLabel((w.minutesSinceLast ?? 0) + drift).replace(' ago', '')})`),
      })
    }
    if (notStarted.length) lines.push({ filter: 'NOT_STARTED', tone: 'red', label: 'Scheduled, not started', people: notStarted.map((w) => w.displayName) })
    if (behind.length) lines.push({ filter: 'BEHIND', tone: 'orange', label: 'Projected < 90% of target', people: behind.map((w) => w.displayName) })
    return { role, lines }
  }).filter((c) => c.lines.length > 0)

  if (cards.length === 0) {
    return (
      <div className="live-attn live-attn--ok" role="status">
        <OutcomeIcon outcome="MET" size={14} />
        <span><strong>All clear.</strong> Everyone scheduled has started, nobody is idle and every working picker/packer is on pace for their target.</span>
      </div>
    )
  }
  return (
    <div className="live-attn-grid" aria-label="Needs attention">
      {cards.map((c) => (
        <div key={c.role} className="live-attn-card" style={{ ['--acc' as string]: ROLE_ACCENT[c.role].main } as React.CSSProperties}>
          <div className="live-attn-head">
            <span className="live-score-dot" />
            {ROLE_LABEL[c.role].many} — needs attention
          </div>
          {c.lines.map((l) => (
            <button key={l.filter} type="button" className={`live-attn-line live-attn-line--${l.tone}`} onClick={() => onJump(c.role, l.filter)}>
              <span className="live-attn-count">{l.people.length}</span>
              <span className="live-attn-label">{l.label}</span>
              <span className="live-attn-people">{l.people.slice(0, 3).join(' · ')}{l.people.length > 3 ? ` +${l.people.length - 3}` : ''}</span>
              <span className="live-attn-go" aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Role scoreboard ─────────────────────────────────────────────────────────

function RoleScore({ board, isLive, active, onSelect }: { board: LiveRoleBoard; isLive: boolean; active: boolean; onSelect: () => void }) {
  const t = board.totals
  const accent = ROLE_ACCENT[board.role]
  const label = ROLE_LABEL[board.role]
  const done = t.target > 0 ? t.completed / t.target : 0
  const proj = t.target > 0 ? t.projected / t.target : 0
  const expected = t.onTrack + t.near + t.behind
  const states = isLive ? (['WORKING', 'IDLE', 'NOT_STARTED', 'OFF'] as const) : (['DONE', 'NOT_STARTED', 'OFF'] as const)
  const stateCount = (s: LiveState) => s === 'WORKING' ? t.working : s === 'IDLE' ? t.idle : s === 'NOT_STARTED' ? t.notStarted : s === 'OFF' ? t.off : t.done
  return (
    <section className={`perf-card live-score${active ? ' live-score--active' : ''}`} style={{ ['--acc' as string]: accent.main } as React.CSSProperties}>
      <button type="button" className="live-score-hit" onClick={onSelect} aria-label={`Show ${label.many} in team detail`} />
      <div className="live-score-top">
        <div className="live-score-role">
          <span className="live-score-dot" />
          {label.many}
          <span className="live-score-target">target {board.dailyTarget} / worker</span>
        </div>
        {isLive && (
          <div className="live-score-lasthr" title="Orders completed in the last 60 minutes">
            <b>{fmtInt(t.lastHour)}</b> last hour
          </div>
        )}
      </div>

      <div className="live-score-main">
        <div className="live-score-big">{fmtInt(t.completed)}</div>
        <div className="live-score-of">
          of <b>{fmtInt(t.target)}</b> team target
          <span className="live-score-pct">{fmtPct(done)}</span>
        </div>
      </div>

      <div className="live-track" role="img" aria-label={`${fmtPct(done)} done${isLive ? `, ${fmtPct(proj)} projected` : ''}`}>
        {isLive && <span className="live-track-proj" style={{ width: `${Math.min(1, proj) * 100}%` }} />}
        <span className="live-track-done" style={{ width: `${Math.min(1, done) * 100}%` }} />
      </div>

      <div className="live-score-stats">
        {isLive ? (
          <div>
            <span>Projected end of shift</span>
            <b>{fmtInt(t.projected)}</b>
            {t.target > 0 && <Delta value={relDelta(t.projected, t.target)} />}
          </div>
        ) : (
          <div>
            <span>Result vs target</span>
            <b>{fmtPct(done)}</b>
            {t.target > 0 && <Delta value={relDelta(t.completed, t.target)} />}
          </div>
        )}
        <div>
          <span>Team pace</span>
          <b>{fmt1(t.pacePerHour)}</b>
          <small>orders / h</small>
        </div>
        {isLive ? (
          <div>
            <span>Work in hand</span>
            <b>{fmtInt(t.inHand)}</b>
            <small>+ {fmtInt(t.queued)} queued</small>
          </div>
        ) : (
          <div>
            <span>Worked</span>
            <b>{t.done}</b>
            <small>{t.done === 1 ? label.one.toLowerCase() : label.many.toLowerCase()}</small>
          </div>
        )}
      </div>

      <div className="live-score-foot">
        <div className="live-states">
          {states.map((s) => {
            const n = stateCount(s)
            return (
              <span key={s} className="live-state-count" style={{ opacity: n ? 1 : 0.45 }}>
                <i style={{ background: STATE_META[s].color }} />{STATE_META[s].label} <b>{n}</b>
              </span>
            )
          })}
        </div>
        {expected > 0 && (
          <div className="live-mix" title={`${isLive ? 'Projected' : 'Final'}: ${t.onTrack} on target · ${t.near} near · ${t.behind} below`}>
            <div className="live-mix-bar">
              {t.onTrack > 0 && <span style={{ flex: t.onTrack, background: OUTCOME_COLOR.MET.fill }} />}
              {t.near > 0 && <span style={{ flex: t.near, background: OUTCOME_COLOR.NEAR.fill }} />}
              {t.behind > 0 && <span style={{ flex: t.behind, background: OUTCOME_COLOR.BELOW.fill }} />}
            </div>
            <span className="live-mix-text">
              <b style={{ color: OUTCOME_COLOR.MET.ink }}>{t.onTrack}</b> on target · <b style={{ color: OUTCOME_COLOR.NEAR.ink }}>{t.near}</b> near ·{' '}
              <b style={{ color: OUTCOME_COLOR.BELOW.ink }}>{t.behind}</b> below{isLive ? ' (projected)' : ''}
            </span>
          </div>
        )}
      </div>
    </section>
  )
}

// ─── Hourly flow ─────────────────────────────────────────────────────────────

function HourlyFlow({ board, hours }: { board: LiveBoard; hours: number[] }) {
  const pick = ROLE_ACCENT.PICKER.main
  const pack = ROLE_ACCENT.PACKER.main
  const data = hours.map((h) => ({ h, label: hh(h), Pickers: board.roles.PICKER.hourly[h], Packers: board.roles.PACKER.hourly[h] }))
  const cur = board.currentHour
  return (
    <div style={{ width: '100%', height: 270 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
          <defs>
            <linearGradient id="live-g-pick" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor={pick} stopOpacity={0.7} /><stop offset="100%" stopColor={pick} stopOpacity={1} /></linearGradient>
            <linearGradient id="live-g-pack" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor={pack} stopOpacity={0.7} /><stop offset="100%" stopColor={pack} stopOpacity={1} /></linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeOpacity={0.18} />
          {cur !== null && hours.includes(cur) && (
            <ReferenceArea x1={hh(cur)} x2={hh(cur)} fill="#f59e0b" fillOpacity={0.1} stroke="#f59e0b" strokeOpacity={0.35} strokeDasharray="3 3"
              label={{ value: 'Now', position: 'insideTop', fontSize: 11, fontWeight: 700, fill: '#b45309' }} />
          )}
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} interval="preserveStartEnd" minTickGap={8} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={36} />
          <Tooltip
            cursor={{ fill: 'rgba(148,163,184,0.10)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload as (typeof data)[number]
              return <TipShell title={`${hh(p.h)} – ${hh((p.h + 1) % 24)}${cur === p.h ? ' · in progress' : ''}`} rows={[
                { label: 'Pickers', value: fmtInt(p.Pickers), color: pick },
                { label: 'Packers', value: fmtInt(p.Packers), color: pack },
              ]} />
            }}
          />
          <Bar dataKey="Pickers" fill="url(#live-g-pick)" radius={[5, 5, 0, 0]} maxBarSize={22} isAnimationActive animationDuration={600} />
          <Bar dataKey="Packers" fill="url(#live-g-pack)" radius={[5, 5, 0, 0]} maxBarSize={22} isAnimationActive animationDuration={600} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

function matches(w: LiveWorker, f: Filter): boolean {
  switch (f) {
    case 'ALL': return w.state !== 'NO_ACTIVITY'
    case 'WORKING': return w.state === 'WORKING'
    case 'IDLE': return w.state === 'IDLE'
    case 'NOT_STARTED': return w.state === 'NOT_STARTED'
    case 'BEHIND': return w.target > 0 && w.outcome === 'BELOW' && w.state !== 'OFF'
    case 'OFF': return w.state === 'OFF' || w.state === 'NO_ACTIVITY'
  }
}

function Leaderboard({ board, isLive, filter, onFilter, drift, onOpenEmployee }: {
  board: LiveRoleBoard
  isLive: boolean
  filter: Filter
  onFilter: (f: Filter) => void
  drift: number
  onOpenEmployee?: (userId: string) => void
}) {
  const [sort, setSort] = useState<SortKey>('output')
  const ws = board.workers
  const count = (f: Filter) => ws.filter((w) => matches(w, f)).length
  const filters: { key: Filter; label: string; liveOnly?: boolean }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'WORKING', label: 'Working', liveOnly: true },
    { key: 'IDLE', label: 'Idle', liveOnly: true },
    { key: 'NOT_STARTED', label: isLive ? 'Not started' : 'No output' },
    { key: 'BEHIND', label: isLive ? 'Behind pace' : 'Below target' },
    { key: 'OFF', label: 'Off / not rostered' },
  ]
  const rows = useMemo(() => {
    const list = ws.filter((w) => matches(w, filter))
    const key = (w: LiveWorker) => (sort === 'progress' ? w.progress : sort === 'pace' ? w.pacePerHour : w.completed)
    return [...list].sort((a, b) => key(b) - key(a) || STATE_META[a.state].order - STATE_META[b.state].order || a.displayName.localeCompare(b.displayName))
  }, [ws, filter, sort])
  const maxHour = Math.max(1, ...ws.flatMap((w) => w.hourly))

  return (
    <>
      <div className="live-toolbar">
        <div className="live-filters" role="group" aria-label="Filter">
          {filters.filter((f) => isLive || !f.liveOnly).map((f) => {
            const n = count(f.key)
            return (
              <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => onFilter(f.key)} disabled={f.key !== 'ALL' && n === 0 && filter !== f.key}>
                {f.label} <span>{n}</span>
              </button>
            )
          })}
        </div>
        <label className="live-sort">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="output">Done today</option>
            <option value="progress">% of target</option>
            <option value="pace">Pace / hour</option>
          </select>
        </label>
      </div>
      {rows.length === 0 ? (
        <div className="perf-empty"><strong>Nobody in this view</strong>Try another filter.</div>
      ) : (
        <div className="perf-table-wrap">
          <table className="perf-table live-table">
            <thead>
              <tr>
                <th className="c">#</th>
                <th className="l">{ROLE_LABEL[board.role].one}</th>
                <th className="l" style={{ minWidth: 210 }}>Progress to target</th>
                <th>Done</th>
                <th>{isLive ? 'Projected' : 'Target'}</th>
                <th>Pace / h</th>
                {isLive && <th>Last hr</th>}
                {isLive && <th className="c" title="In hand (picking / packing) + queued (assigned)">Work</th>}
                <th className="l">Hourly 06–21</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w, i) => (
                <LeaderRow key={w.userId} w={w} rank={i + 1} isLive={isLive} drift={drift} maxHour={maxHour} onOpen={onOpenEmployee} role={board.role} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function LeaderRow({ w, rank, isLive, drift, maxHour, onOpen, role }: {
  w: LiveWorker
  rank: number
  isLive: boolean
  drift: number
  maxHour: number
  onOpen?: (id: string) => void
  role: PerfRole
}) {
  const meta = STATE_META[w.state]
  const ago = w.minutesSinceLast !== null ? agoLabel(w.minutesSinceLast + drift) : null
  const o = OUTCOME_COLOR[w.outcome]
  const hasTarget = w.target > 0
  // bar scale: 0…120% of target so the 100% tick sits at 5/6 of the track
  const scale = (v: number) => `${(Math.min(1.2, hasTarget ? v / w.target : 0) / 1.2) * 100}%`
  const detail = [
    w.attendance
      ? `Schedule: ${ATTENDANCE_TEXT[w.attendance]}${w.factor === 0.5 ? ' (half target)' : w.attendance === AttendanceStatus.PARTIAL_DAY ? ` (${scheduledHoursLabel(w.factor)} · ${Math.round(w.factor * 100)}% target)` : ''}`
      : w.linked ? 'No schedule entry today' : 'Not linked to Employee Schedule',
    w.firstAt ? `first ${clockOf(w.firstAt)} · last ${clockOf(w.lastAt)}` : null,
    isLive && w.completed > 0 ? `projection assumes a ${w.shiftHours}h shift from the first scan` : null,
  ].filter(Boolean).join(' · ')
  return (
    <tr className={w.state === 'OFF' || w.state === 'NO_ACTIVITY' ? 'live-row-muted' : undefined}>
      <td className="c">
        {w.completed > 0 ? <span className={`perf-rank${rank <= 3 ? ` perf-rank--${rank}` : ''}`}>{rank}</span> : <span className="perf-muted">—</span>}
      </td>
      <td className="l">
        <button type="button" className="perf-person" onClick={() => onOpen?.(w.userId)} title={detail} disabled={!onOpen}>
          <span className="perf-avatar live-avatar">
            {initialsOf(w.displayName)}
            <i className={`live-avatar-dot${w.state === 'WORKING' ? ' live-avatar-dot--pulse' : ''}`} style={{ background: meta.color }} />
          </span>
          <span>
            <span className="perf-person-name">{w.displayName}</span>
            <span className="perf-person-meta">
              <span className="live-badge" style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
              {ago && <span>{w.state === 'IDLE' ? `last scan ${ago}` : ago}</span>}
              {!ago && w.attendance && w.state !== 'DONE' && w.state !== 'OFF' && <span>{ATTENDANCE_TEXT[w.attendance]}</span>}
              {!ago && w.state === 'OFF' && w.attendance && <span>{ATTENDANCE_TEXT[w.attendance]}</span>}
            </span>
          </span>
        </button>
      </td>
      <td className="l">
        {hasTarget ? (
          <div className="live-prog" title={`${fmtInt(w.completed)} of ${fmtInt(w.target)}${isLive ? ` · projected ${fmtInt(w.projected)}` : ''}`}>
            <div className="live-prog-track">
              {isLive && w.projected > w.completed && <span className="live-prog-proj" style={{ width: scale(w.projected), background: o.fill }} />}
              <span className="live-prog-done" style={{ width: scale(w.completed), background: o.fill }} />
              <span className="live-prog-goal" />
            </div>
            <span className="live-prog-pct" style={{ color: o.ink }}>{fmtPct(w.progress)}</span>
          </div>
        ) : (
          <span className="perf-muted" style={{ fontSize: 12 }}>{w.state === 'OFF' ? 'Not counted today' : 'No target today'}</span>
        )}
      </td>
      <td className="perf-strong">
        {fmtInt(w.completed)}
        {hasTarget && <span className="perf-muted" style={{ fontWeight: 500 }}> / {fmtInt(w.target)}</span>}
      </td>
      <td>
        {isLive ? (
          hasTarget && w.completed > 0 ? (
            <span className="live-proj" style={{ color: o.ink }}>
              <OutcomeIcon outcome={w.outcome} size={11} /> {fmtInt(w.projected)}
            </span>
          ) : <span className="perf-muted">—</span>
        ) : <span className="perf-muted">{hasTarget ? fmtInt(w.target) : '—'}</span>}
      </td>
      <td>{w.completed > 0 ? fmt1(w.pacePerHour) : <span className="perf-muted">—</span>}</td>
      {isLive && <td>{w.lastHour > 0 ? fmtInt(w.lastHour) : <span className="perf-muted">0</span>}</td>}
      {isLive && (
        <td className="c">
          {w.inHand + w.queued > 0 ? (
            <span className="live-work" title={`${w.inHand} in hand · ${w.queued} queued`}>
              <b>{w.inHand}</b><span>+{w.queued}</span>
            </span>
          ) : <span className="perf-muted">—</span>}
        </td>
      )}
      <td className="l"><MiniHours hourly={w.hourly} max={maxHour} color={ROLE_ACCENT[role].main} /></td>
    </tr>
  )
}

/** Tiny hourly bars (06–21) — the shape of the worker's day at a glance. */
function MiniHours({ hourly, max, color }: { hourly: number[]; max: number; color: string }) {
  const from = 6
  const to = 21
  const bars = hourly.slice(from, to + 1)
  const w = 5
  const gap = 2
  const h = 24
  if (bars.every((v) => v === 0)) return <span className="perf-muted" style={{ fontSize: 11 }}>—</span>
  return (
    <svg width={bars.length * (w + gap)} height={h} role="img" aria-label={`Hourly: ${bars.map((v, i) => `${hh(from + i)} ${v}`).join(', ')}`}>
      {bars.map((v, i) => {
        const bh = v > 0 ? Math.max(2, (v / max) * h) : 1
        return (
          <rect key={i} x={i * (w + gap)} y={h - bh} width={w} height={bh} rx={1.5} fill={v > 0 ? color : '#e2e8f0'} opacity={v > 0 ? 0.35 + 0.65 * (v / max) : 1}>
            <title>{`${hh(from + i)}: ${v}`}</title>
          </rect>
        )
      })}
    </svg>
  )
}

// ─── Heatmap ─────────────────────────────────────────────────────────────────

function HeatLegend({ role }: { role: PerfRole }) {
  return (
    <div className="perf-legend" aria-hidden="true">
      <span>Fewer</span>
      {HEAT_RAMP[role].map((c) => <span key={c} className="perf-swatch" style={{ background: c }} />)}
      <span>More</span>
    </div>
  )
}

function Heatmap({ board, hours, currentHour, onOpenEmployee }: {
  board: LiveRoleBoard
  hours: number[]
  currentHour: number | null
  onOpenEmployee?: (id: string) => void
}) {
  const rows = board.workers.filter((w) => w.completed > 0 || w.state === 'WORKING')
  const ramp = HEAT_RAMP[board.role]
  const max = Math.max(1, ...rows.flatMap((w) => hours.map((h) => w.hourly[h])))
  const shade = (v: number) => {
    if (v === 0) return { bg: '#f8fafc', fg: '#cbd5e1' }
    const idx = Math.min(ramp.length - 1, 1 + Math.floor((v / max) * (ramp.length - 1)))
    return { bg: ramp[idx], fg: idx >= 4 ? '#fff' : '#0f172a' }
  }
  if (rows.length === 0) {
    return <div className="perf-empty"><strong>No completions yet</strong>The grid fills in as orders are completed.</div>
  }
  const totalsByHour = hours.map((h) => rows.reduce((s, w) => s + w.hourly[h], 0))
  return (
    <div className="perf-matrix-wrap">
      <table className="perf-matrix live-heat">
        <thead>
          <tr>
            <th className="name">{ROLE_LABEL[board.role].one}</th>
            {hours.map((h) => <th key={h} className={h === currentHour ? 'today' : undefined}>{String(h).padStart(2, '0')}</th>)}
            <th style={{ textAlign: 'right', paddingRight: 8 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w) => (
            <tr key={w.userId}>
              <td className="name">
                <button type="button" className="perf-person" onClick={() => onOpenEmployee?.(w.userId)} title={w.displayName} disabled={!onOpenEmployee}>
                  <span className="perf-person-name">{w.displayName}</span>
                </button>
              </td>
              {hours.map((h) => {
                const v = w.hourly[h]
                const s = shade(v)
                return (
                  <td key={h} className={`perf-mcell live-hcell${h === currentHour ? ' live-hcell--now' : ''}`} style={{ background: s.bg, color: s.fg }}
                    title={`${w.displayName} · ${hh(h)}–${hh((h + 1) % 24)}: ${v}`}>
                    {v > 0 ? v : ''}
                  </td>
                )
              })}
              <td className="tot">{fmtInt(w.completed)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="name">Team</td>
            {totalsByHour.map((v, i) => <td key={hours[i]}>{v > 0 ? fmtInt(v) : '·'}</td>)}
            <td className="tot">{fmtInt(board.totals.completed)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
