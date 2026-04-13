import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { colors, radius, shadow, font } from '../theme'
import PageShell from '../components/shared/PageShell'
import SectionHeader from '../components/shared/SectionHeader'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DailyEntry {
  date: string
  completed: number
}

interface PersonStat {
  id: string
  username: string
  daily: DailyEntry[]
  total: number
}

interface PerformanceData {
  pickers: PersonStat[]
  packers: PersonStat[]
  dateRange: { from: string; to: string }
  days: number
}

type SortKey = 'today' | 'total' | 'name'

// ─── Icons ────────────────────────────────────────────────────────────────────

const ReportsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
    <line x1="2" y1="20" x2="22" y2="20" />
  </svg>
)

// ─── Mini Bar Chart ───────────────────────────────────────────────────────────

function MiniBarChart({ daily, days }: { daily: DailyEntry[]; days: number }) {
  const last7 = daily.slice(-Math.min(7, days))
  const maxVal = Math.max(...last7.map((d) => d.completed), 1)

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '32px' }}>
      {last7.map((d) => {
        const heightPct = (d.completed / maxVal) * 100
        const label = d.date.slice(5) // MM-DD
        return (
          <div
            key={d.date}
            title={`${label}: ${d.completed}`}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-end',
              height: '100%',
            }}
          >
            <div
              style={{
                width: '100%',
                height: `${Math.max(heightPct, d.completed > 0 ? 8 : 2)}%`,
                background: d.completed > 0 ? colors.primary : colors.border,
                borderRadius: '2px 2px 0 0',
                minHeight: d.completed > 0 ? '4px' : '2px',
                opacity: d.completed > 0 ? 1 : 0.4,
              }}
            />
          </div>
        )
      })}
    </div>
  )
}

// ─── Performance Table ────────────────────────────────────────────────────────

function PerformanceTable({
  people,
  days,
  sort,
}: {
  people: PersonStat[]
  days: number
  sort: SortKey
}) {
  const todayDate = people[0]?.daily.at(-1)?.date ?? ''
  const yesterdayDate = people[0]?.daily.at(-2)?.date ?? ''

  const getDay = (person: PersonStat, date: string) =>
    person.daily.find((d) => d.date === date)?.completed ?? 0

  const get7DayAvg = (person: PersonStat) => {
    const last7 = person.daily.slice(-7)
    const sum = last7.reduce((s, d) => s + d.completed, 0)
    return last7.length > 0 ? (sum / last7.length).toFixed(1) : '0.0'
  }

  const sorted = useMemo(() => {
    return [...people].sort((a, b) => {
      if (sort === 'today') return getDay(b, todayDate) - getDay(a, todayDate)
      if (sort === 'total') return b.total - a.total
      return a.username.localeCompare(b.username)
    })
  }, [people, sort, todayDate])

  if (sorted.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px', color: colors.textSecondary, fontSize: font.sizeMd }}>
        No data available
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
            <th style={thStyle('#')}>Name</th>
            <th style={thStyle()}>Today</th>
            <th style={thStyle()}>Yesterday</th>
            <th style={thStyle()}>7-Day Avg</th>
            <th style={thStyle()}>{days}-Day Total</th>
            <th style={{ ...thStyle(), minWidth: '80px' }}>Last 7 Days</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((person, i) => {
            const today = getDay(person, todayDate)
            const yesterday = getDay(person, yesterdayDate)
            const avg7 = get7DayAvg(person)
            const isEven = i % 2 === 0

            return (
              <tr
                key={person.id}
                style={{
                  background: isEven ? colors.surface : colors.surfaceAlt,
                  borderBottom: `1px solid ${colors.border}`,
                }}
              >
                <td style={tdStyle(true)}>
                  <span style={{ fontWeight: 600, color: colors.textPrimary }}>
                    {person.username}
                  </span>
                </td>
                <td style={tdStyle()}>
                  <span style={{
                    fontWeight: 700,
                    color: today > 0 ? '#10b981' : colors.textSecondary,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {today}
                  </span>
                </td>
                <td style={tdStyle()}>
                  <span style={{
                    fontVariantNumeric: 'tabular-nums',
                    color: yesterday > 0 ? colors.text ?? '#0f172a' : colors.textSecondary,
                  }}>
                    {yesterday}
                  </span>
                </td>
                <td style={tdStyle()}>
                  <span style={{ fontVariantNumeric: 'tabular-nums', color: colors.textPrimary }}>
                    {avg7}
                  </span>
                </td>
                <td style={tdStyle()}>
                  <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: colors.textPrimary }}>
                    {person.total.toLocaleString()}
                  </span>
                </td>
                <td style={{ ...tdStyle(), paddingTop: '8px', paddingBottom: '8px' }}>
                  <MiniBarChart daily={person.daily} days={days} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const thStyle = (align?: string): React.CSSProperties => ({
  padding: '10px 14px',
  textAlign: align === '#' ? 'left' : 'right',
  fontSize: '11px',
  fontWeight: 700,
  color: colors.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
})

const tdStyle = (left?: boolean): React.CSSProperties => ({
  padding: '10px 14px',
  textAlign: left ? 'left' : 'right',
  fontSize: '13px',
  whiteSpace: 'nowrap',
})

// ─── Sort Toggle ──────────────────────────────────────────────────────────────

function SortToggle({ value, onChange }: { value: SortKey; onChange: (v: SortKey) => void }) {
  const options: { key: SortKey; label: string }[] = [
    { key: 'today', label: 'Today ↓' },
    { key: 'total', label: 'Total ↓' },
    { key: 'name', label: 'Name ↑' },
  ]
  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          style={{
            padding: '5px 12px',
            fontSize: '12px',
            fontWeight: 600,
            borderRadius: radius.md,
            border: `1.5px solid ${value === o.key ? '#3b82f6' : colors.border}`,
            background: value === o.key ? '#eff6ff' : colors.surface,
            color: value === o.key ? '#1d4ed8' : colors.textSecondary,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ─── Day Range Toggle ─────────────────────────────────────────────────────────

function DayRangeToggle({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
      <span style={{ fontSize: '12px', color: colors.textSecondary, fontWeight: 500, marginRight: '4px' }}>
        Range:
      </span>
      {[7, 14, 30].map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          style={{
            padding: '5px 12px',
            fontSize: '12px',
            fontWeight: 600,
            borderRadius: radius.md,
            border: `1.5px solid ${value === d ? '#6366f1' : colors.border}`,
            background: value === d ? '#eef2ff' : colors.surface,
            color: value === d ? '#4338ca' : colors.textSecondary,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {d}d
        </button>
      ))}
    </div>
  )
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.xl,
      boxShadow: shadow.card,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 20px',
        borderBottom: `1px solid ${colors.border}`,
        background: colors.surfaceAlt,
      }}>
        <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: colors.textPrimary }}>
          {title}
        </h2>
      </div>
      {children}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function ExportCsvButton({ type, days }: { type: 'picker' | 'packer'; days: number }) {
  const baseUrl = import.meta.env.VITE_API_URL || ''
  const href = `${baseUrl}/reports/performance/export?type=${type}&days=${days}`
  return (
    <a
      href={href}
      download
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '5px 12px',
        fontSize: '12px',
        fontWeight: 600,
        borderRadius: radius.md,
        border: `1.5px solid ${colors.border}`,
        background: colors.surface,
        color: colors.textSecondary,
        cursor: 'pointer',
        textDecoration: 'none',
        transition: 'all 0.15s',
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      Export CSV
    </a>
  )
}

export default function Reports() {
  const [days, setDays] = useState(30)
  const [pickerSort, setPickerSort] = useState<SortKey>('today')
  const [packerSort, setPackerSort] = useState<SortKey>('today')

  const { data, isLoading, isError } = useQuery<PerformanceData>({
    queryKey: ['reports', 'performance', days],
    queryFn: async () => {
      const res = await api.get<PerformanceData>(`/reports/performance?days=${days}`)
      return res.data
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  return (
    <PageShell
      title="Performance Reports"
      subtitle="Daily picker & packer completion stats"
      icon={<ReportsIcon />}
      stats={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <DayRangeToggle value={days} onChange={setDays} />
          {data && (
            <span style={{ fontSize: '12px', color: colors.textSecondary }}>
              {data.dateRange.from} → {data.dateRange.to}
            </span>
          )}
        </div>
      }
    >
      {isLoading && (
        <div style={{ textAlign: 'center', padding: '60px', color: colors.textSecondary }}>
          Loading performance data...
        </div>
      )}

      {isError && (
        <div style={{
          textAlign: 'center', padding: '40px',
          color: '#ef4444', background: '#fef2f2',
          borderRadius: radius.lg, border: '1px solid #fecaca',
        }}>
          Failed to load performance data. Please try again.
        </div>
      )}

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Picker Performance */}
          <SectionCard title={`Picker Performance — Last ${days} Days`}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderBottom: `1px solid ${colors.border}`,
              flexWrap: 'wrap', gap: '8px',
            }}>
              <span style={{ fontSize: '12px', color: colors.textSecondary }}>
                {data.pickers.length} picker{data.pickers.length !== 1 ? 's' : ''}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ExportCsvButton type="picker" days={days} />
                <SortToggle value={pickerSort} onChange={setPickerSort} />
              </div>
            </div>
            <PerformanceTable people={data.pickers} days={days} sort={pickerSort} />
          </SectionCard>

          {/* Packer Performance */}
          <SectionCard title={`Packer Performance — Last ${days} Days`}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderBottom: `1px solid ${colors.border}`,
              flexWrap: 'wrap', gap: '8px',
            }}>
              <span style={{ fontSize: '12px', color: colors.textSecondary }}>
                {data.packers.length} packer{data.packers.length !== 1 ? 's' : ''}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ExportCsvButton type="packer" days={days} />
                <SortToggle value={packerSort} onChange={setPackerSort} />
              </div>
            </div>
            <PerformanceTable people={data.packers} days={days} sort={packerSort} />
          </SectionCard>
        </div>
      )}
    </PageShell>
  )
}
