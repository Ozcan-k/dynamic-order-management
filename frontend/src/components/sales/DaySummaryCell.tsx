import type { SalesDayMetrics } from '@dom/shared'

interface DaySummaryCellProps {
  date: string                    // YYYY-MM-DD
  inMonth: boolean
  isToday: boolean
  isFuture: boolean
  metrics: SalesDayMetrics | null
  onClick: () => void
}

// Activity score (0-10+) → background gradient tone. Higher = bluer.
function activityScore(m: SalesDayMetrics | null): number {
  if (!m) return 0
  return (
    m.contentPostsCount +
    Math.round(m.liveSellingHours) +
    (m.directSalesAmount > 0 ? 2 : 0) +
    (m.marketplaceInquiries > 0 ? 1 : 0)
  )
}

function bgForScore(score: number, inMonth: boolean): string {
  if (!inMonth) return '#f8fafc'
  if (score === 0) return '#f1f5f9'
  if (score <= 2) return '#dbeafe'
  if (score <= 5) return '#bfdbfe'
  if (score <= 9) return '#93c5fd'
  return '#3b82f6'
}

function textForScore(score: number): string {
  return score > 9 ? '#fff' : '#0f172a'
}

export default function DaySummaryCell({ date, inMonth, isToday, isFuture, metrics, onClick }: DaySummaryCellProps) {
  const score = activityScore(metrics)
  const bg = bgForScore(score, inMonth)
  const fg = textForScore(score)
  const dimmed = !inMonth || isFuture
  const dayNum = Number(date.slice(8, 10))

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isFuture || !inMonth}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        textAlign: 'left',
        padding: '8px 10px',
        minHeight: '92px',
        background: bg,
        color: dimmed ? '#94a3b8' : fg,
        border: isToday ? '2px solid #1d4ed8' : '1px solid #e2e8f0',
        borderRadius: '10px',
        cursor: isFuture || !inMonth ? 'default' : 'pointer',
        opacity: dimmed ? 0.55 : 1,
        transition: 'transform 0.12s ease, box-shadow 0.12s ease',
      }}
      onMouseEnter={(e) => {
        if (dimmed) return
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 6px 14px rgba(15,23,42,0.08)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'none'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '6px',
      }}>
        <span style={{
          fontSize: '13px',
          fontWeight: 700,
          color: isToday ? '#1d4ed8' : (score > 9 ? '#fff' : '#0f172a'),
        }}>
          {dayNum}
        </span>
        {isToday && (
          <span style={{
            fontSize: '9px',
            fontWeight: 700,
            padding: '1px 6px',
            background: '#1d4ed8',
            color: '#fff',
            borderRadius: '9999px',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}>Today</span>
        )}
      </div>
      {metrics && score > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '10px', lineHeight: 1.3 }}>
          {metrics.contentPostsCount > 0 && <Line text={`📝 ${metrics.contentPostsCount} posts`} bright={score > 9} />}
          {metrics.liveSellingHours > 0 && <Line text={`🔴 ${formatHours(metrics.liveSellingHours)}h live`} bright={score > 9} />}
          {metrics.directSalesAmount > 0 && <Line text={`💰 ${formatPHPCompact(metrics.directSalesAmount)}`} bright={score > 9} />}
          {metrics.marketplaceInquiries > 0 && <Line text={`🛒 ${metrics.marketplaceInquiries} inq`} bright={score > 9} />}
        </div>
      )}
    </button>
  )
}

function Line({ text, bright }: { text: string; bright: boolean }) {
  return (
    <span style={{
      color: bright ? 'rgba(255,255,255,0.95)' : '#475569',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    }}>
      {text}
    </span>
  )
}

function formatHours(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1)
}

function formatPHPCompact(n: number): string {
  if (n >= 1000) return `₱${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return `₱${Math.round(n)}`
}
