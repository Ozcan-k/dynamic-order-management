import type { AnalyticsDailyRow, MarketingKpis } from '../../api/marketing'
import NumberTicker from '../shared/NumberTicker'
import Sparkline from '../shared/Sparkline'
import {
  type Delta,
  formatHours,
  formatInt,
  formatPct,
  formatPHP,
  formatPHPCompact,
  pointDelta,
  relativeDelta,
} from './format'
import { IconArrowDown, IconArrowUp, IconBag, IconBroadcast, IconCheckSquare, IconClock, IconMessage, IconPeso } from './icons'
import { completionStatus, METRIC_COLOR } from './palette'

interface Props {
  current?: MarketingKpis
  previous?: MarketingKpis
  daily?: AnalyticsDailyRow[]
  loading: boolean
  /** Agent view: average of agents active in the range — adds a "vs team" line to each tile */
  team?: MarketingKpis | null
}

/** "Team avg ₱12K · +18%" — relative position of this agent against the team average. */
function vsTeam(value: number, avg: number | undefined, fmt: (n: number) => string, rate = false): TeamLine | undefined {
  if (avg === undefined) return undefined
  if (rate) {
    const pp = (value - avg) * 100
    return { text: `Team avg ${fmt(avg)}`, diff: Math.abs(pp) < 0.5 ? 'even' : `${pp > 0 ? '+' : '−'}${Math.abs(pp).toFixed(0)} pp`, up: pp >= 0 }
  }
  if (avg === 0) return { text: `Team avg ${fmt(0)}`, diff: value > 0 ? 'above' : 'even', up: true }
  const pct = ((value - avg) / avg) * 100
  return { text: `Team avg ${fmt(avg)}`, diff: Math.abs(pct) < 0.5 ? 'even' : `${pct > 0 ? '+' : '−'}${Math.abs(pct).toFixed(0)}%`, up: pct >= 0 }
}

interface TeamLine { text: string; diff: string; up: boolean }

export default function KpiRow({ current, previous, daily, loading, team }: Props) {
  const series = (pick: (d: AnalyticsDailyRow) => number) =>
    daily && daily.length >= 3 ? daily.map(pick) : undefined

  if (loading || !current || !previous) {
    return (
      <div className="mkt-kpis" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="mkt-kpi mkt-kpi--skeleton" />)}
      </div>
    )
  }

  const c = current
  const p = previous
  const completion = completionStatus(c.completionRate)

  return (
    <div className="mkt-kpis">
      <Kpi
        color={METRIC_COLOR.directSales}
        icon={<IconPeso />}
        label="Direct Sales"
        value={<>₱<NumberTicker value={Math.round(c.directSales)} /></>}
        title={formatPHP(c.directSales)}
        delta={relativeDelta(c.directSales, p.directSales)}
        sub={`prev ${formatPHPCompact(p.directSales)}`}
        spark={series((d) => d.directSales)}
        team={team ? vsTeam(c.directSales, team.directSales, formatPHPCompact) : undefined}
      />
      <Kpi
        color={METRIC_COLOR.orders}
        icon={<IconBag />}
        label="Direct Orders"
        value={<NumberTicker value={c.orders} />}
        delta={relativeDelta(c.orders, p.orders)}
        sub={c.orders > 0 ? `AOV ${formatPHPCompact(c.aov)}` : 'No orders yet'}
        spark={series((d) => d.orders)}
        team={team ? vsTeam(c.orders, team.orders, (n) => n.toFixed(1)) : undefined}
      />
      <Kpi
        color={METRIC_COLOR.liveOrders}
        icon={<IconBroadcast />}
        label="Live Orders"
        value={<NumberTicker value={c.liveOrders} />}
        delta={relativeDelta(c.liveOrders, p.liveOrders)}
        sub={c.liveHours > 0 ? `${c.ordersPerLiveHour.toFixed(1)} per live hour` : 'No live sessions'}
        spark={series((d) => d.liveOrders)}
        team={team ? vsTeam(c.liveOrders, team.liveOrders, (n) => n.toFixed(1)) : undefined}
      />
      <Kpi
        color={METRIC_COLOR.liveHours}
        icon={<IconClock />}
        label="Live Hours"
        value={<>{formatHours(c.liveHours)}<small>h</small></>}
        delta={relativeDelta(c.liveHours, p.liveHours)}
        sub={`prev ${formatHours(p.liveHours)}h`}
        spark={series((d) => d.liveHours)}
        team={team ? vsTeam(c.liveHours, team.liveHours, (n) => `${formatHours(Math.round(n * 10) / 10)}h`) : undefined}
      />
      <Kpi
        color={METRIC_COLOR.content}
        icon={<IconCheckSquare />}
        label="Content Done"
        value={c.requiredPosts > 0 ? formatPct(c.completionRate) : '—'}
        title="Completed mandatory posts ÷ required (9 per store per day reported)"
        delta={pointDelta(c.completionRate, p.completionRate, p.requiredPosts > 0)}
        sub={c.requiredPosts > 0 ? `${formatInt(c.posts)} of ${formatInt(c.requiredPosts)} posts` : 'No store reports'}
        track={c.requiredPosts > 0 ? { ratio: c.completionRate, color: completion.color, label: completion.label } : undefined}
        team={team ? vsTeam(c.completionRate, team.completionRate, (n) => formatPct(n), true) : undefined}
      />
      <Kpi
        color={METRIC_COLOR.inquiries}
        icon={<IconMessage />}
        label="Inquiries"
        value={<NumberTicker value={c.inquiries} />}
        delta={relativeDelta(c.inquiries, p.inquiries)}
        sub={`${formatInt(c.listings)} listing${c.listings === 1 ? '' : 's'} created`}
        spark={series((d) => d.inquiries)}
        team={team ? vsTeam(c.inquiries, team.inquiries, (n) => n.toFixed(1)) : undefined}
      />
    </div>
  )
}

function Kpi({ color, icon, label, value, title, delta, sub, spark, track, team }: {
  color: string
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  title?: string
  delta: Delta
  sub: string
  spark?: number[]
  track?: { ratio: number; color: string; label: string }
  team?: TeamLine
}) {
  return (
    <article className="mkt-kpi" style={{ '--kpi': color } as React.CSSProperties} title={title}>
      <div className="mkt-kpi-label">
        <span className="mkt-kpi-icon">{icon}</span>
        {label}
      </div>
      <div className="mkt-kpi-value">{value}</div>
      <div className="mkt-kpi-sub">
        <DeltaChip delta={delta} />
        <span>{sub}</span>
      </div>
      {team && (
        <div className="mkt-kpi-team">
          <span>{team.text}</span>
          <strong className={team.diff === 'even' ? '' : team.up ? 'mkt-up' : 'mkt-down'}>{team.diff}</strong>
        </div>
      )}
      {track ? (
        <div className="mkt-kpi-track-wrap">
          <div className="mkt-kpi-track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(track.ratio * 100)} aria-label={`${label} ${track.label}`}>
            <span style={{ width: `${Math.min(100, track.ratio * 100)}%`, background: track.color }} />
          </div>
          <span className="mkt-kpi-status" style={{ color: track.color }}>{track.label}</span>
        </div>
      ) : spark && spark.some((v) => v !== 0) ? (
        <div className="mkt-kpi-spark">
          <Sparkline data={spark} color={color} width={220} height={30} strokeWidth={2} />
        </div>
      ) : null}
    </article>
  )
}

export function DeltaChip({ delta }: { delta: Delta }) {
  if (delta.dir === 'none') return <span className="mkt-delta mkt-delta--flat" title="No data in the previous period">—</span>
  if (delta.dir === 'new') return <span className="mkt-delta mkt-delta--up" title="Nothing in the previous period">New</span>
  return (
    <span className={`mkt-delta mkt-delta--${delta.dir}`} title="vs previous period">
      {delta.dir === 'up' && <IconArrowUp size={11} />}
      {delta.dir === 'down' && <IconArrowDown size={11} />}
      <span className="sr-only">{delta.dir === 'up' ? 'up' : delta.dir === 'down' ? 'down' : 'unchanged'} </span>
      {delta.label}
    </span>
  )
}
