import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AttendanceStatus,
  MAX_OT_HOURS,
  PARTIAL_MAX_HOURS,
  PARTIAL_MIN_HOURS,
  isValidPartialHours,
  type EmpScheduleCell,
} from '@dom/shared'
import { STATUS_STYLE } from './config'
import { STATUS_KEY, STATUS_ORDER, statusLabel } from './scheduleUi'

// Cell editor popover (v2.93.0): pick a status (click or key), enter Partial Day hours
// or Present OT, or clear. Partial Day is only saved together with valid hours.

export interface CellChange {
  status: AttendanceStatus | null
  otHours: number
  workedHours: number | null
}

interface Props {
  anchor: DOMRect
  title: string
  subtitle: string
  cell?: EmpScheduleCell
  /** Open straight on the Partial Day hours field (keyboard R). */
  startPartial?: boolean
  onSave: (change: CellChange) => void
  onClose: () => void
}

const W = 300

export default function CellEditor({ anchor, title, subtitle, cell, startPartial, onSave, onClose }: Props) {
  const [partial, setPartial] = useState(startPartial || cell?.status === AttendanceStatus.PARTIAL_DAY)
  const [hours, setHours] = useState(cell?.workedHours != null ? String(cell.workedHours) : '')
  const [ot, setOt] = useState(cell?.status === AttendanceStatus.PRESENT ? String(cell.otHours) : '0')
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const hoursRef = useRef<HTMLInputElement>(null)
  const [pos, setPos] = useState({ top: anchor.bottom + 6, left: anchor.left })

  // keep inside the viewport (flip above when there is no room below)
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 320
    const top = anchor.bottom + 6 + h > window.innerHeight - 8 ? Math.max(8, anchor.top - h - 6) : anchor.bottom + 6
    const left = Math.min(Math.max(8, anchor.left + anchor.width / 2 - W / 2), window.innerWidth - W - 8)
    setPos({ top, left })
  }, [anchor, partial])

  useEffect(() => { if (partial) hoursRef.current?.focus() }, [partial])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown) }
  }, [onClose])

  const pick = (s: AttendanceStatus) => {
    if (s === AttendanceStatus.PARTIAL_DAY) { setPartial(true); setError(null); return }
    const otHours = s === AttendanceStatus.PRESENT ? clampOt(ot) : 0
    onSave({ status: s, otHours, workedHours: null })
  }

  const savePartial = () => {
    const n = parseFloat(hours)
    if (!isValidPartialHours(n)) { setError(`Enter ${PARTIAL_MIN_HOURS}–${PARTIAL_MAX_HOURS} hours in half-hour steps (e.g. 3 or 2.5)`); return }
    onSave({ status: AttendanceStatus.PARTIAL_DAY, otHours: 0, workedHours: n })
  }

  const saveOt = () => onSave({ status: AttendanceStatus.PRESENT, otHours: clampOt(ot), workedHours: null })

  // letter shortcuts while the popover is open (not while typing in a field)
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    const k = e.key.toUpperCase()
    const s = STATUS_ORDER.find((x) => STATUS_KEY[x] === k)
    if (s) { e.preventDefault(); pick(s) }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); onSave({ status: null, otHours: 0, workedHours: null }) }
  }

  return createPortal(
    <div
      ref={ref}
      className="es-editor"
      style={{ top: pos.top, left: pos.left, width: W }}
      role="dialog"
      aria-label={`Set attendance — ${title}, ${subtitle}`}
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      <header className="es-editor-head">
        <b>{title}</b>
        <span>{subtitle}</span>
      </header>
      <div className="es-editor-grid">
        {STATUS_ORDER.map((s, i) => {
          const st = STATUS_STYLE[s]
          const on = partial ? s === AttendanceStatus.PARTIAL_DAY : cell?.status === s
          return (
            <button
              key={s}
              type="button"
              autoFocus={!partial && (on || (!cell && i === 0))}
              className={`es-editor-opt${on ? ' is-on' : ''}`}
              style={{ ['--st-bg' as string]: st.bg, ['--st-ink' as string]: st.text, ['--st-dot' as string]: st.dot, ['--st-border' as string]: st.border }}
              onClick={() => pick(s)}
            >
              <i aria-hidden="true" />
              <span>{statusLabel(s)}</span>
              <kbd>{STATUS_KEY[s]}</kbd>
            </button>
          )
        })}
      </div>

      {partial && (
        <div className="es-editor-field">
          <label htmlFor="es-partial-hours">Hours worked</label>
          <div className="es-editor-row">
            <input
              id="es-partial-hours"
              ref={hoursRef}
              inputMode="decimal"
              value={hours}
              placeholder="e.g. 3"
              aria-invalid={!!error}
              onChange={(e) => { if (/^\d*\.?\d*$/.test(e.target.value)) { setHours(e.target.value); setError(null) } }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); savePartial() } }}
            />
            <span className="es-editor-unit">of 8h</span>
            <button type="button" className="es-btn es-btn--primary" onClick={savePartial}>Save</button>
          </div>
          <div className="es-editor-quick">
            {[1, 2, 3, 4, 5, 6].map((h) => (
              <button key={h} type="button" onClick={() => { setHours(String(h)); setError(null) }}>{h}h</button>
            ))}
          </div>
          {error && <p className="es-editor-error">{error}</p>}
        </div>
      )}

      {!partial && cell?.status === AttendanceStatus.PRESENT && (
        <div className="es-editor-field">
          <label htmlFor="es-ot">Overtime (hours)</label>
          <div className="es-editor-row">
            <input
              id="es-ot"
              inputMode="decimal"
              value={ot}
              onChange={(e) => { if (/^\d*\.?\d*$/.test(e.target.value)) setOt(e.target.value) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveOt() } }}
            />
            <span className="es-editor-unit">max {MAX_OT_HOURS}h</span>
            <button type="button" className="es-btn es-btn--primary" onClick={saveOt}>Save OT</button>
          </div>
        </div>
      )}

      <footer className="es-editor-foot">
        {cell ? (
          <button type="button" className="es-btn es-btn--ghost-danger" onClick={() => onSave({ status: null, otHours: 0, workedHours: null })}>
            Clear day <kbd>Del</kbd>
          </button>
        ) : <span />}
        <button type="button" className="es-btn" onClick={onClose}>Close <kbd>Esc</kbd></button>
      </footer>
    </div>,
    document.body,
  )
}

function clampOt(raw: string): number {
  const n = parseFloat(raw)
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(MAX_OT_HOURS, Math.round(n * 100) / 100))
}
