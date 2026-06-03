import { useEffect, useMemo, useRef, useState } from 'react'

export interface ComboOption {
  id: string
  name: string
  subtitle?: string | null
}

interface Props<T extends ComboOption> {
  items: T[]
  value: string
  onChange: (text: string) => void
  onPick: (item: T | null) => void // null = "Others"
  onAddNew?: (name: string) => void
  placeholder?: string
  showOthers?: boolean
}

export default function ComboBox<T extends ComboOption>({
  items, value, onChange, onPick, onAddNew, placeholder, showOthers = true,
}: Props<T>) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return items
    const score = (n: string) => {
      const l = n.toLowerCase()
      if (l.startsWith(q)) return 0
      if (l.includes(q)) return 1
      return 2
    }
    return [...items].filter((c) => c.name.toLowerCase().includes(q)).sort((a, b) => score(a.name) - score(b.name) || a.name.localeCompare(b.name))
  }, [items, value])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const pick = (c: T) => { onPick(c); onChange(c.name); setOpen(false) }
  const pickOthers = () => { onPick(null); setOpen(false) }
  const showAdd = onAddNew && value.trim() && !items.some((c) => c.name.toLowerCase() === value.trim().toLowerCase())

  return (
    <div className="acc-combo" ref={wrapRef}>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0) }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
          else if (e.key === 'Enter') { e.preventDefault(); if (active < filtered.length) pick(filtered[active]); else if (showOthers) pickOthers() }
          else if (e.key === 'Escape') setOpen(false)
        }}
      />
      {open && (
        <div className="acc-combo-menu">
          {filtered.map((c, i) => (
            <div key={c.id} className={`acc-combo-item${i === active ? ' active' : ''}`}
              onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); pick(c) }}>
              {c.name}{c.subtitle ? <span className="acc-muted"> · {c.subtitle}</span> : null}
            </div>
          ))}
          {filtered.length === 0 && <div className="acc-combo-item acc-muted" style={{ cursor: 'default' }}>No matches</div>}
          {showOthers && <div className="acc-combo-item others" onMouseDown={(e) => { e.preventDefault(); pickOthers() }}>Others (enter manually)</div>}
          {showAdd && (
            <div className="acc-combo-add" onMouseDown={(e) => { e.preventDefault(); onAddNew!(value.trim()); setOpen(false) }}>
              + Add “{value.trim()}”
            </div>
          )}
        </div>
      )}
    </div>
  )
}
