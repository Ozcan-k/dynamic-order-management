import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { colors } from '../theme'
import PageShell from '../components/shared/PageShell'
import StatCard from '../components/shared/StatCard'
import SectionHeader from '../components/shared/SectionHeader'
import { useStockItems, useStockStats, useStockMovements } from '../api/stock'
import type { StockStatus } from '@dom/shared'

const StockIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
)

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

function StatusPill({ status }: { status: StockStatus }) {
  const inStock = status === 'IN_STOCK'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '3px 10px', borderRadius: '9999px',
      background: inStock ? '#dcfce7' : '#fee2e2',
      color: inStock ? '#166534' : '#991b1b',
      fontSize: '11px', fontWeight: 700,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: inStock ? '#16a34a' : '#dc2626',
      }} />
      {inStock ? 'IN STOCK' : 'OUT'}
    </span>
  )
}

function DirectionPill({ direction }: { direction: 'IN' | 'OUT' }) {
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: '9999px',
      background: direction === 'IN' ? '#dcfce7' : '#fee2e2',
      color: direction === 'IN' ? '#166534' : '#991b1b',
      fontSize: '11px', fontWeight: 700,
    }}>
      {direction === 'IN' ? '↓ IN' : '↑ OUT'}
    </span>
  )
}

export default function StockDashboard() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [tab, setTab] = useState<'items' | 'movements'>('items')
  const [statusFilter, setStatusFilter] = useState<StockStatus | ''>('')
  const [search, setSearch] = useState('')

  const { data: stats } = useStockStats()
  const { data: items = [], isLoading: itemsLoading } = useStockItems({
    status: statusFilter || undefined,
    productType: search.trim() || undefined,
  })
  const { data: movements = [], isLoading: movementsLoading } = useStockMovements(200)

  return (
    <PageShell
      icon={StockIcon}
      title="Stock Control"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
      stats={
        <>
          <StatCard label="In Stock" value={stats?.totalInStock ?? 0} color={colors.success} animate />
          <StatCard label="Out of Stock" value={stats?.totalOutOfStock ?? 0} color={colors.danger} animate />
          <StatCard label="Total Items" value={stats?.totalItems ?? 0} color={colors.primary} animate />
          <StatCard label="Categories" value={stats?.categoriesCount ?? 0} color="#7c3aed" animate />
        </>
      }
    >
      {/* Top action row */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
        <button
          className="btn btn-primary"
          onClick={() => navigate('/stock/create')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <PlusIcon /> Create Labels
        </button>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: '6px', marginBottom: '14px',
        borderBottom: `1px solid ${colors.border}`, paddingBottom: '0',
      }}>
        {(['items', 'movements'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 18px', border: 'none', background: 'transparent',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              color: tab === t ? colors.primary : colors.textSecondary,
              borderBottom: tab === t ? `2px solid ${colors.primary}` : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {t === 'items' ? 'Items' : 'Movements'}
          </button>
        ))}
      </div>

      {tab === 'items' && (
        <>
          {/* Filters */}
          <div className="toolbar-card" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search by product type..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex: 1, minWidth: '180px',
                padding: '8px 12px', borderRadius: '8px',
                border: `1px solid ${colors.border}`,
                fontSize: '13px', outline: 'none',
              }}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StockStatus | '')}
              className="styled-select"
              style={{ minWidth: '160px' }}
            >
              <option value="">All Statuses</option>
              <option value="IN_STOCK">In Stock</option>
              <option value="OUT_OF_STOCK">Out of Stock</option>
            </select>
          </div>

          <SectionHeader title="Items" count={items.length} />

          <div className="data-table-wrap" style={{ marginTop: '10px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead style={{ background: colors.surfaceAlt }}>
                <tr>
                  <th style={th}>ID</th>
                  <th style={th}>Product Type</th>
                  <th style={th}>Category</th>
                  <th style={{ ...th, textAlign: 'right' }}>Weight (kg)</th>
                  <th style={th}>Status</th>
                  <th style={th}>Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {itemsLoading ? (
                  <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: colors.textMuted }}>Loading…</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: colors.textMuted }}>No items match your filters.</td></tr>
                ) : (
                  items.map((it) => (
                    <tr key={it.id} style={{ borderTop: `1px solid ${colors.border}` }}>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: '11px', color: colors.textSecondary }}>
                        {it.id.slice(0, 8)}
                      </td>
                      <td style={{ ...td, fontWeight: 600 }}>{it.productType}</td>
                      <td style={td}>{it.category}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{it.weightKg}</td>
                      <td style={td}><StatusPill status={it.status} /></td>
                      <td style={{ ...td, color: colors.textSecondary, fontSize: '12px' }}>
                        {new Date(it.updatedAt).toLocaleString('en-GB', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'movements' && (
        <>
          <SectionHeader title="Recent Movements" count={movements.length} />
          <div className="data-table-wrap" style={{ marginTop: '10px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead style={{ background: colors.surfaceAlt }}>
                <tr>
                  <th style={th}>Time</th>
                  <th style={th}>Direction</th>
                  <th style={th}>Item</th>
                  <th style={th}>Category</th>
                  <th style={{ ...th, textAlign: 'right' }}>Weight (kg)</th>
                  <th style={th}>Scanned By</th>
                </tr>
              </thead>
              <tbody>
                {movementsLoading ? (
                  <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: colors.textMuted }}>Loading…</td></tr>
                ) : movements.length === 0 ? (
                  <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: colors.textMuted }}>No movements yet.</td></tr>
                ) : (
                  movements.map((m) => (
                    <tr key={m.id} style={{ borderTop: `1px solid ${colors.border}` }}>
                      <td style={{ ...td, color: colors.textSecondary, fontSize: '12px' }}>
                        {new Date(m.scannedAt).toLocaleString('en-GB', { timeZone: 'Asia/Manila', dateStyle: 'short', timeStyle: 'medium' })}
                      </td>
                      <td style={td}><DirectionPill direction={m.direction} /></td>
                      <td style={{ ...td, fontWeight: 600 }}>{m.item.productType}</td>
                      <td style={td}>{m.item.category}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{m.item.weightKg}</td>
                      <td style={td}>{m.scannedBy}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </PageShell>
  )
}

const th: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left',
  fontSize: '11px', fontWeight: 700, color: colors.textSecondary,
  textTransform: 'uppercase', letterSpacing: '0.05em',
}

const td: React.CSSProperties = {
  padding: '10px 12px', color: colors.textPrimary,
}
