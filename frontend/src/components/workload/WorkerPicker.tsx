import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { PerfRole } from '@dom/shared'
import { ROLE_TEXT, STATE_META, type WorkerView } from './model'

// Assignment dropdown for Picker / Packer Admin (v2.90.0). Each option shows the
// worker's live state, open queue, today's output and when their queue should
// clear at their current pace, plus the queue after this assignment. The
// "Suggested" worker is only a hint — the admin always makes the choice.

interface Props {
  role: PerfRole
  workers: { id: string; username: string }[]   // selectable accounts (authoritative list)
  views: WorkerView[]                           // live-enriched workload (may lack live data)
  value: string
  onChange: (id: string) => void
  incoming: number                              // orders about to be assigned (staged / selected)
  hasLive: boolean
}

interface Option {
  id: string
  username: string
  view: WorkerView | null
  clearMin: number | null      // minutes to clear the current queue at the current pace
  tier: number                 // 0 working, 1 idle, 2 not started, 3 off / done / unknown
}

const tierOf = (v: WorkerView | null) =>
  !v?.state ? 3 : v.state === 'WORKING' ? 0 : v.state === 'IDLE' ? 1 : v.state === 'NOT_STARTED' ? 2 : 3

function clearLabel(min: number | null): string | null {
  if (min === null) return null
  if (min < 1) return 'free now'
  if (min < 60) return `clears ~${Math.round(min)}m`
  return `clears ~${(min / 60).toFixed(1)}h`
}

function initials(name: string): string {
  const parts = name.replace(/[-_.]/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function WorkerPicker({ role, workers, views, value, onChange, incoming, hasLive }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const text = ROLE_TEXT[role]

  const options = useMemo<Option[]>(() => {
    const byId = new Map(views.map((v) => [v.id, v]))
    const list = workers.map((w) => {
      const view = byId.get(w.id) ?? null
      const pace = view?.live?.pacePerHour ?? 0
      const clearMin = view && view.state === 'WORKING' && pace > 0 ? (view.active / pace) * 60 : null
      return { id: w.id, username: w.username, view, clearMin, tier: tierOf(view) }
    })
    if (!hasLive) return list.sort((a, b) => a.username.localeCompare(b.username))
    return list.sort((a, b) =>
      a.tier - b.tier
      || (a.clearMin ?? Infinity) - (b.clearMin ?? Infinity)
      || (a.view?.active ?? 0) - (b.view?.active ?? 0)
      || a.username.localeCompare(b.username))
  }, [workers, views, hasLive])

  // Suggested: the working person whose queue clears first; else the lightest idle one
  const suggestedId = hasLive ? (options.find((o) => o.tier === 0)?.id ?? options.find((o) => o.tier === 1)?.id ?? null) : null
  const selected = options.find((o) => o.id === value) ?? null

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    // Focus the current (or suggested) option when the list opens
    requestAnimationFrame(() => {
      const target = listRef.current?.querySelector<HTMLButtonElement>(`[data-id="${value || suggestedId}"]`)
        ?? listRef.current?.querySelector<HTMLButtonElement>('button')
      target?.focus()
    })
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, value, suggestedId])

  function onListKey(e: React.KeyboardEvent) {
    const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(items.length - 1, i + 1)]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[Math.max(0, i - 1)]?.focus() }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); rootRef.current?.querySelector<HTMLButtonElement>('.wp-trigger')?.focus() }
  }

  function pick(id: string) {
    onChange(id)
    setOpen(false)
    rootRef.current?.querySelector<HTMLButtonElement>('.wp-trigger')?.focus()
  }

  const selQueue = selected?.view?.active ?? null

  return (
    <div className="wp" ref={rootRef} style={{ '--wl-accent': text.accent, '--wl-soft': text.accentSoft } as React.CSSProperties}>
      <button
        type="button"
        className={`wp-trigger${selected ? ' wp-trigger--on' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
      >
        {selected ? (
          <>
            <span className="wp-avatar">{initials(selected.view?.live?.displayName || selected.username)}</span>
            <span className="wp-trigger-text">
              <strong>{selected.username}</strong>
              {selQueue !== null && (
                <small>
                  Queue {selQueue}{incoming > 0 && <> → <b>{selQueue + incoming}</b></>}
                  {selected.view?.state && <> · {STATE_META[selected.view.state].label}</>}
                </small>
              )}
            </span>
          </>
        ) : (
          <span className="wp-placeholder">Select a {text.one.toLowerCase()}…</span>
        )}
        <svg className="wp-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : undefined }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="wp-pop" ref={listRef} id={listId} role="listbox" aria-label={`Assign to ${text.one.toLowerCase()}`} onKeyDown={onListKey}>
          {hasLive && (
            <div className="wp-head">
              {incoming > 0 ? <>Assigning <b>{incoming}</b> order{incoming === 1 ? '' : 's'} · </> : null}
              sorted by who frees up first
            </div>
          )}
          {options.map((o) => {
            const v = o.view
            const meta = v?.state ? STATE_META[v.state] : null
            const dim = hasLive && o.tier === 3
            const clears = clearLabel(o.clearMin)
            return (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={o.id === value}
                data-id={o.id}
                className={`wp-opt${o.id === value ? ' wp-opt--on' : ''}${dim ? ' wp-opt--dim' : ''}`}
                onClick={() => pick(o.id)}
              >
                <span className="wp-avatar">{initials(o.view?.live?.displayName || o.username)}</span>
                <span className="wp-opt-main">
                  <span className="wp-opt-name">
                    {o.username}
                    {o.id === suggestedId && <em className="wp-suggest" title="Working, and their queue should clear first at their current pace">Suggested</em>}
                    {v?.flag === 'HEAVY' && <em className="wp-heavy">Heavy queue</em>}
                  </span>
                  <span className="wp-opt-sub">
                    {meta && <><i style={{ background: meta.color }} />{v?.state === 'IDLE' && v.live?.minutesSinceLast != null ? `Idle ${v.live.minutesSinceLast}m` : meta.label}</>}
                    {v?.live?.attendance === 'HALF_DAY' && <> · Half day</>}
                    {clears && <> · {clears}</>}
                  </span>
                </span>
                {v && (
                  <span className="wp-opt-nums">
                    <span>Queue <b>{v.active}</b>{incoming > 0 && <> → <b>{v.active + incoming}</b></>}</span>
                    <span>{v.completedToday} done</span>
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
