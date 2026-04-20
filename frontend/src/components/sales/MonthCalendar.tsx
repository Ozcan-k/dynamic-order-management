import { useMemo } from 'react'

interface MonthCalendarProps {
  month: string                    // YYYY-MM
  onMonthChange: (next: string) => void
  todayDate: string                // YYYY-MM-DD (Manila)
  renderCell: (date: string, ctx: { inMonth: boolean; isToday: boolean; isFuture: boolean }) => React.ReactNode
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function parseMonth(month: string): { y: number; m: number } {
  const [y, m] = month.split('-').map(Number)
  return { y, m }
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function shiftMonth(month: string, delta: number): string {
  const { y, m } = parseMonth(month)
  const total = y * 12 + (m - 1) + delta
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${pad(nm)}`
}

// Mon-first 7×6 grid for the given month
function buildGrid(month: string): { date: string; inMonth: boolean }[] {
  const { y, m } = parseMonth(month)
  const first = new Date(Date.UTC(y, m - 1, 1))
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  // JS getUTCDay: Sun=0 ... Sat=6 → convert to Mon=0 ... Sun=6
  const firstWeekday = (first.getUTCDay() + 6) % 7
  const cells: { date: string; inMonth: boolean }[] = []

  // Leading days from previous month
  for (let i = firstWeekday; i > 0; i--) {
    const d = new Date(Date.UTC(y, m - 1, 1 - i))
    cells.push({
      date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
      inMonth: false,
    })
  }
  // Current month
  for (let d = 1; d <= lastDay; d++) {
    cells.push({ date: `${y}-${pad(m)}-${pad(d)}`, inMonth: true })
  }
  // Trailing → fill to 42
  while (cells.length < 42) {
    const last = cells[cells.length - 1]
    const [ly, lm, ld] = last.date.split('-').map(Number)
    const next = new Date(Date.UTC(ly, lm - 1, ld + 1))
    cells.push({
      date: `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`,
      inMonth: false,
    })
  }
  return cells
}

export default function MonthCalendar({ month, onMonthChange, todayDate, renderCell }: MonthCalendarProps) {
  const cells = useMemo(() => buildGrid(month), [month])
  const { y, m } = parseMonth(month)
  const title = `${MONTH_NAMES[m - 1]} ${y}`

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: '14px',
      padding: '14px',
      boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px',
      }}>
        <button
          type="button"
          onClick={() => onMonthChange(shiftMonth(month, -1))}
          aria-label="Previous month"
          style={navBtnStyle}
        >‹</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <strong style={{ fontSize: '15px', color: '#0f172a' }}>{title}</strong>
          <button
            type="button"
            onClick={() => onMonthChange(todayDate.slice(0, 7))}
            style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '4px 10px',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              background: '#fff',
              color: '#1d4ed8',
              cursor: 'pointer',
            }}
          >Today</button>
        </div>
        <button
          type="button"
          onClick={() => onMonthChange(shiftMonth(month, 1))}
          aria-label="Next month"
          style={navBtnStyle}
        >›</button>
      </div>

      {/* Weekday header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', marginBottom: '6px' }}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{
            fontSize: '10px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: '#94a3b8',
            textAlign: 'center',
            padding: '4px 0',
          }}>
            {w}
          </div>
        ))}
      </div>

      {/* Cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
        {cells.map((c) => (
          <div key={c.date}>
            {renderCell(c.date, {
              inMonth: c.inMonth,
              isToday: c.date === todayDate,
              isFuture: c.date > todayDate,
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

const navBtnStyle: React.CSSProperties = {
  width: '32px',
  height: '32px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '18px',
  fontWeight: 700,
  border: '1px solid #cbd5e1',
  borderRadius: '8px',
  background: '#fff',
  color: '#0f172a',
  cursor: 'pointer',
}
