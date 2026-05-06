import { useMemo, useState } from 'react'
import PageShell from '../../components/shared/PageShell'
import { colors } from '../../theme'
import { useAuthStore } from '../../stores/authStore'
import { useStockStats, useStockSummary } from '../../api/stock'
import { useProductCategories } from '../../api/products'

const StockIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
)

const cardStyle: React.CSSProperties = { background: '#fff', borderRadius: 14, border: `1px solid ${colors.border}`, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }
const inputStyle: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, border: `1.5px solid ${colors.border}`, fontSize: 13, background: '#f8fafc', color: colors.textPrimary, outline: 'none' }

export default function StockSummary() {
  const user = useAuthStore((s) => s.user)
  const { data: stats } = useStockStats()
  const { data: summary = [], isLoading } = useStockSummary()
  const { data: categories = [] } = useProductCategories()
  const [categoryId, setCategoryId] = useState<string>('')
  const [lowStockOnly, setLowStockOnly] = useState(false)

  const filtered = useMemo(() => {
    return summary.filter((row) => {
      if (categoryId && row.categoryId !== categoryId) return false
      if (lowStockOnly && !row.lowStock) return false
      return true
    })
  }, [summary, categoryId, lowStockOnly])

  return (
    <PageShell icon={StockIcon} title="Stock" subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <KpiCard title="Products" value={stats?.totalProducts ?? 0} />
          <KpiCard title="Low stock" value={stats?.lowStockProducts ?? 0} accent={(stats?.lowStockProducts ?? 0) > 0 ? colors.danger : undefined} />
          <KpiCard title="Transfers (30d)" value={stats?.transfers30d ?? 0} />
          <KpiCard title="Used (30d)" value={stats?.used30d ?? 0} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={inputStyle}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: colors.textSecondary }}>
            <input type="checkbox" checked={lowStockOnly} onChange={(e) => setLowStockOnly(e.target.checked)} />
            Low stock only
          </label>
        </div>

        <div style={cardStyle}>
          {isLoading ? <div style={{ color: colors.textSecondary }}>Loading…</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: `1px solid ${colors.border}` }}>
                  <th style={th}>Category</th>
                  <th style={th}>Product</th>
                  <th style={th}>Product ID</th>
                  <th style={{ ...th, textAlign: 'right' }}>In Stock</th>
                  <th style={{ ...th, textAlign: 'right' }}>Reserved</th>
                  <th style={{ ...th, textAlign: 'right' }}>Transfer</th>
                  <th style={{ ...th, textAlign: 'right' }}>Used</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={8} style={{ ...td, color: colors.textMuted, textAlign: 'center' }}>
                    {summary.length === 0 ? 'No products yet.' : 'No products match the current filters.'}
                  </td></tr>
                )}
                {filtered.map((row) => (
                  <tr key={row.productId} style={{
                    borderBottom: `1px solid ${colors.border}`,
                    background: row.lowStock ? '#fef2f2' : 'transparent',
                  }}>
                    <td style={td}>{row.categoryName}</td>
                    <td style={{ ...td, fontWeight: 600 }}>
                      {row.productName}
                      {row.lowStock && <span style={{ marginLeft: 8, fontSize: 11 }}>⚠️</span>}
                    </td>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{row.productCode}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                      {row.inStockCount} <span style={{ color: colors.textMuted, fontWeight: 400, fontSize: 11 }}>{row.defaultUnit}</span>
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>{row.reservedThreshold}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{row.transferCount}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{row.usedCount}</td>
                    <td style={td}>
                      {row.lowStock ? <Badge color={colors.danger} bg={colors.dangerLight}>Low Stock</Badge>
                        : <Badge color="#15803d" bg="#dcfce7">OK</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </PageShell>
  )
}

function KpiCard({ title, value, accent }: { title: string; value: number; accent?: string }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 11, fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {title}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, color: accent ?? colors.textPrimary }}>
        {value}
      </div>
    </div>
  )
}

function Badge({ color, bg, children }: { color: string; bg: string; children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 999,
      fontSize: 11, fontWeight: 700, color, background: bg, border: `1px solid ${color}33`,
    }}>{children}</span>
  )
}

const th: React.CSSProperties = { padding: '10px 8px', fontWeight: 700, color: colors.textSecondary, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }
const td: React.CSSProperties = { padding: '10px 8px', color: colors.textPrimary }
