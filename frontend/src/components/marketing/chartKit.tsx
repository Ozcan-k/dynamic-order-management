// Shared building blocks for Marketing Report charts: card chrome, segmented
// control, HTML legend, tooltip card, ranked bar list and axis defaults.

import type { ReactNode } from 'react'

// ─── Card ─────────────────────────────────────────────────────────────────────

export function ChartCard({ title, sub, actions, children, flush, className }: {
  title: string
  sub?: ReactNode
  actions?: ReactNode
  children: ReactNode
  flush?: boolean
  className?: string
}) {
  return (
    <section className={`mkt-card${className ? ` ${className}` : ''}`}>
      <header className="mkt-card-head">
        <div style={{ minWidth: 0 }}>
          <h3 className="mkt-card-title">{title}</h3>
          {sub && <p className="mkt-card-sub">{sub}</p>}
        </div>
        {actions}
      </header>
      <div className={flush ? 'mkt-card-body mkt-card-body--flush' : 'mkt-card-body'}>{children}</div>
    </section>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mkt-empty">
      <strong>{title}</strong>
      {children}
    </div>
  )
}

// ─── Segmented control ───────────────────────────────────────────────────────

export function Seg<T extends string>({ label, options, value, onChange }: {
  label: string
  options: readonly { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="mkt-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ─── Legend ───────────────────────────────────────────────────────────────────

export interface LegendItem {
  label: string
  color: string
  kind?: 'swatch' | 'line' | 'dash' | 'dot'
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <div className="mkt-legend">
      {items.map((it) => (
        <span key={it.label} className="mkt-legend-item">
          <span
            className={`mkt-swatch mkt-swatch--${it.kind ?? 'swatch'}`}
            style={it.kind === 'dash' ? { borderColor: it.color } : { background: it.color }}
          />
          {it.label}
        </span>
      ))}
    </div>
  )
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

export interface TipRow {
  label: string
  value: string
  color?: string
  dashed?: boolean
  muted?: boolean
}

export function TooltipCard({ title, rows, foot }: { title: string; rows: TipRow[]; foot?: string }) {
  return (
    <div className="mkt-tip">
      <div className="mkt-tip-title">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className={`mkt-tip-row${r.muted ? ' mkt-tip-row--muted' : ''}`}>
          {r.color && (
            <span
              className={`mkt-swatch ${r.dashed ? 'mkt-swatch--dash' : 'mkt-swatch--dot'}`}
              style={r.dashed ? { borderColor: r.color } : { background: r.color }}
            />
          )}
          <span className="mkt-tip-label">{r.label}</span>
          <span className="mkt-tip-value">{r.value}</span>
        </div>
      ))}
      {foot && <div className="mkt-tip-foot">{foot}</div>}
    </div>
  )
}

// ─── Ranked horizontal bar list (HTML — direct-labelled, clickable rows) ─────

export interface BarItem {
  id: string
  label: string
  value: number
  display: string
  color: string
  sub?: ReactNode
  badge?: ReactNode
}

export function BarList({ items, max, target, onSelect, emptyTitle = 'No data for this range' }: {
  items: BarItem[]
  max?: number
  target?: { value: number; label: string }
  onSelect?: (id: string) => void
  emptyTitle?: string
}) {
  const top = max ?? Math.max(0, ...items.map((i) => i.value))
  if (items.length === 0 || top <= 0) return <Empty title={emptyTitle} />
  return (
    <ol className="mkt-bars">
      {items.map((it) => {
        const pct = Math.max(0, Math.min(100, (it.value / top) * 100))
        const content = (
          <>
            <div className="mkt-bars-top">
              <span className="mkt-bars-label">
                <span className="mkt-swatch mkt-swatch--dot" style={{ background: it.color }} />
                <span className="mkt-bars-name">{it.label}</span>
                {it.badge}
              </span>
              <span className="mkt-bars-value">{it.display}</span>
            </div>
            <div className="mkt-bars-track">
              <span style={{ width: `${pct}%`, background: it.color }} />
              {target && (
                <i
                  className="mkt-bars-target"
                  style={{ left: `${Math.min(100, (target.value / top) * 100)}%` }}
                  title={target.label}
                />
              )}
            </div>
            {it.sub && <div className="mkt-bars-sub">{it.sub}</div>}
          </>
        )
        return (
          <li key={it.id}>
            {onSelect ? (
              <button type="button" className="mkt-bars-row mkt-bars-row--btn" onClick={() => onSelect(it.id)}>
                {content}
              </button>
            ) : (
              <div className="mkt-bars-row">{content}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

// ─── Mini stat (used in strips inside tabs) ──────────────────────────────────

export function MiniStat({ label, value, sub, color }: { label: string; value: ReactNode; sub?: ReactNode; color: string }) {
  return (
    <div className="mkt-mini" style={{ '--kpi': color } as React.CSSProperties}>
      <div className="mkt-mini-label">{label}</div>
      <div className="mkt-mini-value">{value}</div>
      {sub && <div className="mkt-mini-sub">{sub}</div>}
    </div>
  )
}

/** Initial-letter avatar tinted with the agent's series colour. */
export function AgentAvatar({ name, color, size = 28 }: { name: string; color: string; size?: number }) {
  return (
    <span
      className="mkt-avatar"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: `color-mix(in srgb, ${color} 16%, #fff)`,
        color,
        boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${color} 45%, #fff)`,
      }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}
