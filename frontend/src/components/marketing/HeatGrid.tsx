import { useState, type ReactNode } from 'react'
import { AgentAvatar, TooltipCard, type TipRow } from './chartKit'
import { shortDate } from './format'

// Agent × day grid. Each cell's level indexes into `ramp` (sequential, one hue);
// null = nothing reported (drawn as an empty outlined cell, never a ramp colour).

export interface HeatCell {
  date: string
  level: number | null
  tip: TipRow[]
  dot?: boolean            // secondary marker (e.g. direct order that day)
}

export interface HeatRow {
  id: string
  label: string
  color: string
  cells: HeatCell[]
  meta?: ReactNode
}

interface Props {
  dates: string[]
  rows: HeatRow[]
  ramp: readonly string[]
  legend: ReactNode
  onRowClick?: (id: string) => void
  today?: string
}

const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export default function HeatGrid({ dates, rows, ramp, legend, onRowClick, today }: Props) {
  const [hover, setHover] = useState<{ x: number; y: number; row: HeatRow; cell: HeatCell } | null>(null)

  const labelEvery = dates.length <= 14 ? 1 : dates.length <= 35 ? 7 : 14
  // Minimum cell width — cells stretch to fill the card and only scroll when the range is long
  const cell = dates.length <= 14 ? 28 : dates.length <= 35 ? 14 : dates.length <= 62 ? 11 : 9
  const cellH = dates.length <= 14 ? 28 : dates.length <= 62 ? 20 : 16

  // Viewport coordinates + position:fixed so the scroll container never clips the tooltip
  function show(e: React.MouseEvent | React.FocusEvent, row: HeatRow, c: HeatCell) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setHover({ x: r.left + r.width / 2, y: r.top, row, cell: c })
  }

  return (
    <div className="mkt-heat">
      <div className="mkt-heat-scroll" onMouseLeave={() => setHover(null)} onScroll={() => setHover(null)}>
        <table className="mkt-heat-table" style={{ '--cell': `${cell}px`, '--cell-h': `${cellH}px` } as React.CSSProperties}>
          <thead>
            <tr>
              <th className="mkt-heat-name" scope="col"><span className="sr-only">Agent</span></th>
              {dates.map((d, i) => (
                <th key={d} scope="col" className="mkt-heat-date" aria-label={shortDate(d)}>
                  {cell >= 28 ? (
                    <span>{WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()]}<br />{Number(d.slice(8))}</span>
                  ) : i % labelEvery === 0 ? (
                    <span className="mkt-heat-date-tick">{shortDate(d)}</span>
                  ) : null}
                </th>
              ))}
              <th className="mkt-heat-meta" scope="col"><span className="sr-only">Summary</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row" className="mkt-heat-name">
                  {onRowClick ? (
                    <button type="button" className="mkt-heat-agent" onClick={() => onRowClick(row.id)}>
                      <AgentAvatar name={row.label} color={row.color} size={22} />
                      <span>{row.label}</span>
                    </button>
                  ) : (
                    <span className="mkt-heat-agent">
                      <AgentAvatar name={row.label} color={row.color} size={22} />
                      <span>{row.label}</span>
                    </span>
                  )}
                </th>
                {row.cells.map((c) => (
                  <td key={c.date} className="mkt-heat-td">
                    <span
                      className={`mkt-heat-cell${c.level === null ? ' mkt-heat-cell--none' : ''}${c.date === today ? ' mkt-heat-cell--today' : ''}`}
                      style={c.level === null ? undefined : { background: ramp[Math.min(ramp.length - 1, c.level)] }}
                      tabIndex={0}
                      role="img"
                      aria-label={`${row.label}, ${shortDate(c.date)}: ${c.tip.map((t) => `${t.label} ${t.value}`).join(', ')}`}
                      onMouseEnter={(e) => show(e, row, c)}
                      onFocus={(e) => show(e, row, c)}
                      onBlur={() => setHover(null)}
                    >
                      {c.dot && <i className="mkt-heat-dot" />}
                    </span>
                  </td>
                ))}
                <td className="mkt-heat-meta">{row.meta}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {hover && (
          <div className="mkt-heat-tip" style={{ left: hover.x, top: hover.y }}>
            <TooltipCard title={`${hover.row.label} · ${shortDate(hover.cell.date)}`} rows={hover.cell.tip} />
          </div>
        )}
      </div>
      <div className="mkt-heat-legend">{legend}</div>
    </div>
  )
}

/** "Less ▢▢▢▢▢ More" legend + optional extra items. */
export function RampLegend({ ramp, low, high, extra }: { ramp: readonly string[]; low: string; high: string; extra?: ReactNode }) {
  return (
    <div className="mkt-ramp-legend">
      <span>{low}</span>
      {ramp.map((c) => <i key={c} style={{ background: c }} />)}
      <span>{high}</span>
      {extra}
    </div>
  )
}
