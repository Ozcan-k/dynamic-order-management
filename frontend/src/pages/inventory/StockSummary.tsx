import { FormEvent, useMemo, useState } from 'react'
import PageShell from '../../components/shared/PageShell'
import ConfirmModal from '../../components/shared/ConfirmModal'
import { colors } from '../../theme'
import { useAuthStore } from '../../stores/authStore'
import { useStockSummary, type WarehouseBreakdown } from '../../api/stock'
import {
  useProductCategories,
  useUpdateProduct,
  useDeleteProduct,
  useProducts,
  type Product,
  type ProductInput,
} from '../../api/products'
import type { StockUnit } from '@dom/shared'

const StockIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
)

const cardStyle: React.CSSProperties = { background: '#fff', borderRadius: 14, border: `1px solid ${colors.border}`, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }
const inputStyle: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, border: `1.5px solid ${colors.border}`, fontSize: 13, background: '#f8fafc', color: colors.textPrimary, outline: 'none' }
const formInputStyle: React.CSSProperties = { padding: '10px 14px', borderRadius: 8, border: `1.5px solid ${colors.border}`, fontSize: 14, outline: 'none', color: colors.textPrimary, background: '#f8fafc', boxSizing: 'border-box', width: '100%' }
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }

export default function StockSummary() {
  const user = useAuthStore((s) => s.user)
  const { data: summary = [], isLoading } = useStockSummary()
  const { data: products = [] } = useProducts()
  const { data: categories = [] } = useProductCategories()

  const updateProduct = useUpdateProduct()
  const deleteProduct = useDeleteProduct()

  const [categoryId, setCategoryId] = useState<string>('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [editTarget, setEditTarget] = useState<Product | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; productCode: string; category: string } | null>(null)
  const [hoverProductId, setHoverProductId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return summary.filter((row) => {
      if (categoryId && row.categoryId !== categoryId) return false
      if (lowStockOnly && !row.lowStock) return false
      if (q) {
        const haystack = `${row.productName} ${row.productCode} ${row.categoryName}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [summary, categoryId, lowStockOnly, search])

  async function confirmDelete() {
    if (!deleteTarget) return
    setActionError(null)
    try {
      await deleteProduct.mutateAsync(deleteTarget.id)
      setDeleteTarget(null)
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } }; message?: string }
      setActionError(e?.response?.data?.error ?? e?.message ?? 'Failed to delete product')
      setDeleteTarget(null)
    }
  }

  return (
    <PageShell icon={StockIcon} title="Stock" subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: colors.textSecondary }}>
            <input type="checkbox" checked={lowStockOnly} onChange={(e) => setLowStockOnly(e.target.checked)} />
            Low stock only
          </label>
        </div>

        {actionError && (
          <div style={{
            padding: '10px 14px', borderRadius: 8,
            background: colors.dangerLight, border: `1px solid ${colors.dangerBorder}`,
            fontSize: 13, color: '#dc2626', fontWeight: 500,
          }}>{actionError}</div>
        )}

        <div style={cardStyle}>
          {isLoading ? <div style={{ color: colors.textSecondary }}>Loading…</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: `1px solid ${colors.border}` }}>
                  <th style={th}>Category</th>
                  <th style={th}>Product</th>
                  <th style={th}>Product ID</th>
                  <th style={{ ...th, textAlign: 'right' }}>In Stock</th>
                  <th style={{ ...th, textAlign: 'right' }}>Box Quantity</th>
                  <th style={{ ...th, textAlign: 'right' }}>Reserved</th>
                  <th style={th}>Status</th>
                  <th style={{ ...th, textAlign: 'right' }}>Actions</th>
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
                    <td
                      style={{ ...td, textAlign: 'right', fontWeight: 700, position: 'relative', cursor: row.boxCount > 0 ? 'help' : 'default' }}
                      onMouseEnter={() => row.boxCount > 0 && setHoverProductId(row.productId)}
                      onMouseLeave={() => setHoverProductId(null)}
                    >
                      {row.inStockQuantity} <span style={{ color: colors.textMuted, fontWeight: 400, fontSize: 11 }}>{row.defaultUnit === 'KG' ? 'kg' : 'pcs'}</span>
                      {hoverProductId === row.productId && row.byWarehouse.length > 0 && (
                        <WarehouseTooltip rows={row.byWarehouse} unit={row.defaultUnit} />
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>{row.boxCount}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{row.reservedThreshold}</td>
                    <td style={td}>
                      {row.lowStock ? <Badge color={colors.danger} bg={colors.dangerLight}>Low Stock</Badge>
                        : <Badge color="#15803d" bg="#dcfce7">OK</Badge>}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <button onClick={() => {
                        const p = productById.get(row.productId)
                        if (p) { setEditTarget(p); setActionError(null) }
                      }} style={btnLink}>Edit</button>
                      <button onClick={() => setDeleteTarget({
                        id: row.productId, name: row.productName,
                        productCode: row.productCode, category: row.categoryName,
                      })} style={{ ...btnLink, color: colors.danger }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editTarget && (
        <EditProductModal
          product={editTarget}
          categories={categories}
          busy={updateProduct.isPending}
          onSave={async (input) => {
            setActionError(null)
            try {
              await updateProduct.mutateAsync({ id: editTarget.id, input })
              setEditTarget(null)
            } catch (err) {
              const e = err as { response?: { data?: { error?: string } }; message?: string }
              setActionError(e?.response?.data?.error ?? e?.message ?? 'Failed to save product')
            }
          }}
          onCancel={() => setEditTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete product"
          message={`This will permanently remove "${deleteTarget.name}" from the product master list. Products with stock items cannot be deleted.`}
          detail={`Product ID: ${deleteTarget.productCode} · Category: ${deleteTarget.category}`}
          confirmLabel="Delete"
          tone="danger"
          busy={deleteProduct.isPending}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </PageShell>
  )
}

function WarehouseTooltip({ rows, unit }: { rows: WarehouseBreakdown[]; unit: StockUnit }) {
  const u = unit === 'KG' ? 'kg' : 'pcs'
  return (
    <div style={{
      position: 'absolute', top: '100%', right: 0, marginTop: 6,
      background: '#0f172a', color: '#fff', padding: '10px 12px',
      borderRadius: 8, fontSize: 12, fontWeight: 500,
      boxShadow: '0 8px 24px rgba(0,0,0,0.25)', zIndex: 30, minWidth: 220,
      textAlign: 'left',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase' }}>
        Warehouse breakdown
      </div>
      {rows.map((r) => (
        <div key={r.warehouseId} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0' }}>
          <span style={{ color: '#e2e8f0' }}>{r.warehouseName}</span>
          <span style={{ color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
            {r.boxes} box · {r.quantity} {u}
          </span>
        </div>
      ))}
    </div>
  )
}

function EditProductModal({
  product, categories, busy, onSave, onCancel,
}: {
  product: Product
  categories: { id: string; name: string }[]
  busy: boolean
  onSave: (input: Partial<ProductInput>) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState<Required<Omit<ProductInput, 'productCode'>>>({
    categoryId: product.categoryId,
    name: product.name,
    defaultUnit: product.defaultUnit,
    reservedThreshold: product.reservedThreshold,
  })

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    await onSave(form)
  }

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 9998,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
      >
        <div style={{ padding: '18px 24px', borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: colors.textPrimary }}>Edit product</div>
          <div style={{ fontSize: 12, color: colors.textMuted, fontFamily: 'monospace', marginTop: 2 }}>{product.productCode}</div>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>Category</label>
              <select
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                required style={formInputStyle}
              >
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>Product Name</label>
              <input
                type="text" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required maxLength={120} style={formInputStyle}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>Default Unit</label>
              <select
                value={form.defaultUnit}
                onChange={(e) => setForm({ ...form, defaultUnit: e.target.value as StockUnit })}
                style={formInputStyle}
              >
                <option value="KG">KG</option>
                <option value="PCS">PCS</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>Reserved (low-stock threshold)</label>
              <input
                type="number" min={0} step={0.1}
                value={form.reservedThreshold}
                onChange={(e) => setForm({ ...form, reservedThreshold: parseFloat(e.target.value) || 0 })}
                style={formInputStyle}
              />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
            <button type="button" onClick={onCancel} disabled={busy} style={{
              padding: '9px 18px', border: `1px solid ${colors.border}`, background: '#fff',
              borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer',
            }}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy} style={{
              padding: '9px 18px', fontSize: 13, fontWeight: 700, opacity: busy ? 0.7 : 1,
            }}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
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
const btnLink: React.CSSProperties = { background: 'transparent', border: 'none', color: colors.primary, cursor: 'pointer', fontWeight: 600, fontSize: 12, padding: '4px 8px' }
