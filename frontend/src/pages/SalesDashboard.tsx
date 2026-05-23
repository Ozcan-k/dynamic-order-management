import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { SalesDayMetrics } from '@dom/shared'
import PageShell from '../components/shared/PageShell'
import MonthCalendar from '../components/sales/MonthCalendar'
import DaySummaryCell from '../components/sales/DaySummaryCell'
import DayDetailModal from '../components/sales/DayDetailModal'
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

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
    setSelectedDate(date)
  }

  return (
    <PageShell
      icon={<CalendarIcon />}
      title="Sales Dashboard"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
    >
      {/* Hero strip — uses shared .page-hero family (Phase F) */}
      <div className="page-hero">
        <div className="page-hero-content">
          <div className="page-hero-label">Today · {today}</div>
          <div className="page-hero-title">Today's Snapshot</div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/sales/entry')}
          className="page-hero-cta"
        >Enter Today's Report →</button>
      </div>

      {/* 4 stat cards — TODAY's metrics */}
      <div className="sales-stats-grid">
        <StatCard label="Posts" value={String(todayMetrics?.contentPostsCount ?? 0)} icon="📝" />
        <StatCard label="Live Hours" value={formatHours(todayMetrics?.liveSellingHours ?? 0)} icon="🔴" />
        <StatCard label="Direct Sales" value={formatPHP(todayMetrics?.directSalesAmount ?? 0)} icon="💰" highlight />
        <StatCard label="Inquiries" value={String(todayMetrics?.marketplaceInquiries ?? 0)} icon="🛒" />
      </div>

      {/* Month total chip */}
      <div className="sales-month-chips">
        <strong className="sales-month-chips-strong">This month:</strong>
        <Chip text={`📝 ${monthTotals.posts} posts`} />
        <Chip text={`🔴 ${formatHours(monthTotals.liveHours)}h live`} />
        <Chip text={`💰 ${formatPHP(monthTotals.sales)}`} />
        <Chip text={`🛒 ${monthTotals.inquiries} inquiries`} />
        {isLoading && <span className="sales-month-chips-loading">· loading…</span>}
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

      {selectedDate && (
        <DayDetailModal
          date={selectedDate}
          isToday={selectedDate === today}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </PageShell>
  )
}

function StatCard({ label, value, icon, highlight }: { label: string; value: string; icon: string; highlight?: boolean }) {
  return (
    <div className={`sales-stat-card${highlight ? ' sales-stat-card--highlight' : ''}`}>
      <div className="sales-stat-card-icon">{icon}</div>
      <div>
        <div className="sales-stat-card-label">{label}</div>
        <div className="sales-stat-card-value">{value}</div>
      </div>
    </div>
  )
}

function Chip({ text }: { text: string }) {
  return <span className="sales-month-chip">{text}</span>
}

function formatHours(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1)
}

function formatPHP(n: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(n)
}
