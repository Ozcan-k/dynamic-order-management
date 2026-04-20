import { useEffect, useRef, useState } from 'react'
import { fetchSuggestions, type SuggestField } from '../../api/sales'

interface AutoSuggestInputProps {
  field: SuggestField
  value: string
  onChange: (next: string) => void
  placeholder?: string
  disabled?: boolean
}

export default function AutoSuggestInput({ field, value, onChange, placeholder, disabled }: AutoSuggestInputProps) {
  const [open, setOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [activeIdx, setActiveIdx] = useState(-1)
  const debounceRef = useRef<number | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Debounced fetch on value change while focused
  useEffect(() => {
    if (!open) return
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    const q = value.trim()
    if (q.length < 1) {
      setSuggestions([])
      return
    }
    debounceRef.current = window.setTimeout(async () => {
      try {
        const items = await fetchSuggestions(field, q)
        setSuggestions(items)
        setActiveIdx(-1)
      } catch {
        setSuggestions([])
      }
    }, 200)
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [value, open, field])

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function pick(s: string) {
    onChange(s)
    setOpen(false)
    setSuggestions([])
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault()
      pick(suggestions[activeIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onKeyDown={onKeyDown}
        style={{
          width: '100%',
          fontSize: '13px',
          padding: '8px 10px',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          background: '#fff',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      {open && suggestions.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          boxShadow: '0 8px 20px rgba(15,23,42,0.10)',
          zIndex: 10,
          maxHeight: '220px',
          overflowY: 'auto',
        }}>
          {suggestions.map((s, i) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s)}
              onMouseEnter={() => setActiveIdx(i)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                fontSize: '13px',
                background: i === activeIdx ? '#eff6ff' : 'transparent',
                color: '#0f172a',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
