import { useState } from 'react'

export interface DateRange { from: string; to: string } // YYYY-MM-DD or ''

const pad = (n: number) => String(n).padStart(2, '0')
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

type Preset = 'all' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom'

function rangeFor(preset: Preset): DateRange {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  if (preset === 'thisMonth') return { from: fmt(new Date(y, m, 1)), to: fmt(new Date(y, m + 1, 0)) }
  if (preset === 'lastMonth') return { from: fmt(new Date(y, m - 1, 1)), to: fmt(new Date(y, m, 0)) }
  if (preset === 'thisYear') return { from: fmt(new Date(y, 0, 1)), to: fmt(new Date(y, 11, 31)) }
  return { from: '', to: '' } // all
}

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'thisMonth', label: 'This Month' },
  { id: 'lastMonth', label: 'Last Month' },
  { id: 'thisYear', label: 'This Year' },
  { id: 'custom', label: 'Custom' },
]

// Derive which preset a value corresponds to, so a parent-supplied default (e.g.
// This Month) highlights the right pill instead of always falling back to Custom.
function presetOf(value: DateRange): Preset {
  if (!value.from && !value.to) return 'all'
  for (const p of ['thisMonth', 'lastMonth', 'thisYear'] as Preset[]) {
    const r = rangeFor(p)
    if (r.from === value.from && r.to === value.to) return p
  }
  return 'custom'
}

export default function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const [preset, setPreset] = useState<Preset>(() => presetOf(value))
  const pick = (p: Preset) => {
    setPreset(p)
    if (p !== 'custom') onChange(rangeFor(p))
  }
  return (
    <div className="acc-range">
      <div className="acc-range-pills">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" className={`acc-range-pill${preset === p.id ? ' active' : ''}`} onClick={() => pick(p.id)}>{p.label}</button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="acc-range-custom">
          <input type="date" value={value.from} max={value.to || undefined} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          <span className="acc-muted">→</span>
          <input type="date" value={value.to} min={value.from || undefined} onChange={(e) => onChange({ ...value, to: e.target.value })} />
        </div>
      )}
    </div>
  )
}
