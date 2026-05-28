import { useEffect, useMemo, useState } from 'react'
import PageShell from '../../components/shared/PageShell'
import Pagination from '../../components/shared/Pagination'
import { colors } from '../../theme'
import { useAuthStore } from '../../stores/authStore'
import { useStockOutSummary } from '../../api/stock'
import { useProductCategories } from '../../api/products'

const StockOutIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
    <line x1="9" y1="14" x2="15" y2="14" />
  </svg>
)

const PAGE_SIZE = 30

const cardStyle: React.CSSProperties = { background: '#fff', borderRadius: 14, border: `1px solid ${colors.border}`, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }
const inputStyle: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, border: `1.5px solid ${colors.border}`, fontSize: 13, background: '#f8fafc', color: colors.textPrimary, outline: 'none' }

function todayManila(): string {
  const ms = Date.now() + 8 * 60 * 60 * 1000
  return new Date(ms).toISOString().slice(0, 10)
}

function shiftDate(dateStr: string, days: number): string {
  const ms = new Date(`${dateStr}T00:00:00.000Z`).getTime() + days * 24 * 60 * 60 * 1000
  return new Date(ms).toISOString().slice(0, 10)
}

const PRESET_RANGES = [
  { id: 'today', label: 'Today', days: 1 },
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
] as const

export default function StockOut() {
  const user = useAuthStore((s) => s.user)
  const today = todayManila()

  const [presetId, setPresetId] = useState<string>('today')
  const [customFrom, setCustomFrom] = useState<string>(shiftDate(today, -29))
  const [customTo, setCustomTo] = useState<string>(today)

  const isToday = presetId === 'today'

  const { from, to } = useMemo(() => {
    if (presetId === 'custom') return { from: customFrom, to: customTo }
    const days = PRESET_RANGES.find((p) => p.id === presetId)?.days ?? 1
    return { from: shiftDate(today, -(days - 1)), to: today }
  }, [presetId, customFrom, customTo, today])

  const { data: summary = [], isLoading } = useStockOutSummary(from, to)
  const { data: categories = [] } = useProductCategories()

  const [categoryId, setCategoryId] = useState<string>('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return summary.filter((row) => {
      if (categoryId && row.categoryId !== categoryId) return false
      if (q) {
        const haystack = `${row.productName} ${row.productCode} ${row.categoryName}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [summary, categoryId, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

  useEffect(() => { setPage(1) }, [categoryId, search, from, to])
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const pageStart = (page - 1) * PAGE_SIZE
  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE)

  const totalBoxes = filtered.reduce((sum, r) => sum + r.boxCount, 0)

  return (
    <PageShell icon={StockOutIcon} title="Stock Out" subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="page-hero">
          <div className="page-hero-content">
            <div className="page-hero-label">
              <span>Date Range</span>
              {isToday && (
                <span className="live-pill">
                  <span className="live-pill-dot" />
                  LIVE
                </span>
              )}
            </div>
            <div className="page-hero-title">
              {isToday ? `Today · ${today}` : `${from} → ${to}`}
            </div>
          </div>
          <div className="page-hero-actions">
            <div className="preset-btn-group">
              {PRESET_RANGES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPresetId(p.id)}
                  className={`preset-btn${presetId === p.id ? ' preset-btn--active' : ''}`}
                >{p.label}</button>
              ))}
              <button
                type="button"
                onClick={() => setPresetId('custom')}
                className={`preset-btn${presetId === 'custom' ? ' preset-btn--active' : ''}`}
              >Custom</button>
            </div>
            {presetId === 'custom' && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: '8px', border: 'none', fontWeight: 600, color: '#0f172a' }} />
                <span>→</span>
                <input type="date" value={customTo} min={customFrom} max={today} onChange={(e) => setCustomTo(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: '8px', border: 'none', fontWeight: 600, color: '#0f172a' }} />
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product name or ID…"
            style={{ ...inputStyle, minWidth: 260, flex: '1 1 260px' }}
          />
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={inputStyle}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: colors.textSecondary, fontVariantNumeric: 'tabular-nums' }}>
            {filtered.length} product{filtered.length === 1 ? '' : 's'} · {totalBoxes} box{totalBoxes === 1 ? '' : 'es'} out
          </div>
        </div>

        <div style={cardStyle}>
          {isLoading ? <div style={{ color: colors.textSecondary }}>Loading…</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: `1px solid ${colors.border}` }}>
                  <th style={{ ...th, width: 44, textAlign: 'right' }}>#</th>
                  <th style={th}>Category</th>
                  <th style={th}>Product</th>
                  <th style={th}>Product ID</th>
                  <th style={{ ...th, textAlign: 'right' }}>Box Quantity</th>
                  <th style={{ ...th, textAlign: 'right' }}>Stock Out</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={6} style={{ ...td, color: colors.textMuted, textAlign: 'center' }}>
                    {summary.length === 0 ? 'No stock-out movements in the selected range.' : 'No products match the current filters.'}
                  </td></tr>
                )}
                {paged.map((row, i) => (
                  <tr key={row.productId} style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <td style={{ ...td, textAlign: 'right', color: colors.textMuted, fontVariantNumeric: 'tabular-nums' }}>{pageStart + i + 1}</td>
                    <td style={td}>{row.categoryName}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{row.productName}</td>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{row.productCode}</td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.boxCount}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {row.totalQuantity} <span style={{ color: colors.textMuted, fontWeight: 400, fontSize: 11 }}>{row.defaultUnit === 'KG' ? 'kg' : 'pcs'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {filtered.length > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            totalCount={filtered.length}
            pageStart={pageStart}
            pageEnd={Math.min(pageStart + PAGE_SIZE, filtered.length)}
            onChange={setPage}
          />
        )}
      </div>
    </PageShell>
  )
}

const th: React.CSSProperties = { padding: '10px 8px', fontWeight: 700, color: colors.textSecondary, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }
const td: React.CSSProperties = { padding: '10px 8px', color: colors.textPrimary }
