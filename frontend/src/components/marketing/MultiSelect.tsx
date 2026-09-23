import { useEffect, useId, useRef, useState } from 'react'
import { IconCheck, IconChevron } from './icons'

export interface MultiSelectOption {
  id: string
  label: string
  color?: string
}

interface Props {
  icon: React.ReactNode
  allLabel: string            // "All agents"
  noun: [string, string]      // ['agent', 'agents']
  options: MultiSelectOption[]
  value: string[]             // [] = all
  onChange: (ids: string[]) => void
}

/** Pill button + checklist popover used in the Marketing Report hero. Empty selection = all. */
export default function MultiSelect({ icon, allLabel, noun, options, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selected = new Set(value)
  const label =
    value.length === 0 ? allLabel
      : value.length === 1 ? options.find((o) => o.id === value[0])?.label ?? `1 ${noun[0]}`
        : `${value.length} ${noun[1]}`

  const q = query.trim().toLowerCase()
  const visible = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    // Selecting every option is the same as "all" — keep the URL short
    onChange(next.size === options.length ? [] : options.filter((o) => next.has(o.id)).map((o) => o.id))
  }

  return (
    <div className="mkt-ms" ref={rootRef}>
      <button
        type="button"
        className={`mkt-ms-btn${value.length ? ' mkt-ms-btn--active' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
      >
        {icon}
        <span className="mkt-ms-label">{label}</span>
        <IconChevron size={12} />
      </button>

      {open && (
        <div className="mkt-ms-pop" role="dialog" aria-label={allLabel}>
          {options.length > 8 && (
            <input
              className="mkt-ms-search"
              placeholder={`Search ${noun[1]}…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          )}
          <div className="mkt-ms-actions">
            <button type="button" onClick={() => onChange([])} disabled={value.length === 0}>
              Show all
            </button>
            <span>{value.length === 0 ? `All ${options.length}` : `${value.length} of ${options.length}`}</span>
          </div>
          <ul id={listId} role="listbox" aria-multiselectable="true" className="mkt-ms-list">
            {visible.map((o) => {
              const on = selected.has(o.id)
              return (
                <li key={o.id} role="option" aria-selected={on}>
                  <button type="button" className="mkt-ms-opt" onClick={() => toggle(o.id)}>
                    <span className={`mkt-ms-check${on ? ' mkt-ms-check--on' : ''}`}>{on && <IconCheck size={11} />}</span>
                    {o.color && <span className="mkt-ms-dot" style={{ background: o.color }} />}
                    <span className="mkt-ms-opt-label">{o.label}</span>
                  </button>
                </li>
              )
            })}
            {visible.length === 0 && <li className="mkt-ms-empty">No matches</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
