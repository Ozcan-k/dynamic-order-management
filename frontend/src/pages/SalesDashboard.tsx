import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { SalesDayMetrics } from '@dom/shared'
import PageShell from '../components/shared/PageShell'
import MonthCalendar from '../components/sales/MonthCalendar'
import DaySummaryCell from '../components/sales/DaySummaryCell'
import { fetchCalendar } from '../api/sales'
import { useAuthStore } from '../stores/authStore'

function CalendarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function todayManila(): string {
  const ms = Date.now() + 8 * 60 * 60 * 1000
  return new Date(ms).toISOString().slice(0, 10)
}

export default function SalesDashboard() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()

  const today = todayManila()
  const [month, setMonth] = useState<string>(today.slice(0, 7))

  const { data, isLoading } = useQuery({
    queryKey: ['sales-calendar', month],
    queryFn: () => fetchCalendar(month),
    staleTime: 10_000,
  })

  // Index by date for fast cell lookup
  const metricsByDate = useMemo(() => {
    const map = new Map<string, SalesDayMetrics>()
    data?.days?.forEach((d) => map.set(d.date, d))
    return map
  }, [data])

  const todayMetrics = metricsByDate.get(today)
  const monthTotals = useMemo(() => {
    const days = data?.days ?? []
    return days.reduce(
      (acc, d) => ({
        posts: acc.posts + d.contentPostsCount,
        liveHours: acc.liveHours + d.liveSellingHours,
        sales: acc.sales + d.directSalesAmount,
        inquiries: acc.inquiries + d.marketplaceInquiries,
      }),
      { posts: 0, liveHours: 0, sales: 0, inquiries: 0 },
    )
  }, [data])

  function openDay(date: string) {
    navigate(`/sales/entry?date=${date}`)
  }

  return (
    <PageShell
      icon={<CalendarIcon />}
      title="Sales Dashboard"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
    >
      {/* Hero strip */}
      <div style={{
        background: 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)',
        color: '#fff',
        borderRadius: '14px',
        padding: '18px 20px',
        marginBottom: '14px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '14px',
        boxShadow: '0 4px 12px rgba(29,78,216,0.18)',
      }}>
        <div>
          <div style={{
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.85)',
            marginBottom: '4px',
          }}>Today · {today}</div>
          <div style={{ fontSize: '20px', fontWeight: 700 }}>Today's Snapshot</div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/sales/entry')}
          style={{
            fontSize: '14px',
            fontWeight: 700,
            padding: '10px 18px',
            border: 'none',
            borderRadius: '10px',
            background: '#fff',
            color: '#1d4ed8',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          }}
        >Enter Today's Report →</button>
      </div>

      {/* 4 stat cards — TODAY's metrics */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '12px',
        marginBottom: '16px',
      }}>
        <StatCard label="Posts" value={String(todayMetrics?.contentPostsCount ?? 0)} icon="📝" />
        <StatCard label="Live Hours" value={formatHours(todayMetrics?.liveSellingHours ?? 0)} icon="🔴" />
        <StatCard label="Direct Sales" value={formatPHP(todayMetrics?.directSalesAmount ?? 0)} icon="💰" highlight />
        <StatCard label="Inquiries" value={String(todayMetrics?.marketplaceInquiries ?? 0)} icon="🛒" />
      </div>

      {/* Month total chip */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '10px',
        fontSize: '12px',
        color: '#475569',
      }}>
        <strong style={{ color: '#0f172a' }}>This month:</strong>
        <Chip text={`📝 ${monthTotals.posts} posts`} />
        <Chip text={`🔴 ${formatHours(monthTotals.liveHours)}h live`} />
        <Chip text={`💰 ${formatPHP(monthTotals.sales)}`} />
        <Chip text={`🛒 ${monthTotals.inquiries} inquiries`} />
        {isLoading && <span style={{ color: '#94a3b8' }}>· loading…</span>}
      </div>

      {/* Calendar */}
      <MonthCalendar
        month={month}
        onMonthChange={setMonth}
        todayDate={today}
        renderCell={(date, ctx) => (
          <DaySummaryCell
            date={date}
            inMonth={ctx.inMonth}
            isToday={ctx.isToday}
            isFuture={ctx.isFuture}
            metrics={metricsByDate.get(date) ?? null}
            onClick={() => openDay(date)}
          />
        )}
      />
    </PageShell>
  )
}

function StatCard({ label, value, icon, highlight }: { label: string; value: string; icon: string; highlight?: boolean }) {
  return (
    <div style={{
      background: highlight ? 'linear-gradient(135deg, #15803d 0%, #22c55e 100%)' : '#fff',
      color: highlight ? '#fff' : '#0f172a',
      border: highlight ? 'none' : '1px solid #e2e8f0',
      borderRadius: '12px',
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    }}>
      <div style={{ fontSize: '24px' }}>{icon}</div>
      <div>
        <div style={{
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: highlight ? 'rgba(255,255,255,0.85)' : '#64748b',
          marginBottom: '4px',
        }}>{label}</div>
        <div style={{ fontSize: '20px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      </div>
    </div>
  )
}

function Chip({ text }: { text: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '4px 10px',
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: '9999px',
      fontSize: '12px',
      fontWeight: 600,
      color: '#475569',
    }}>{text}</span>
  )
}

function formatHours(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1)
}

function formatPHP(n: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(n)
}
