import { FormEvent, useEffect, useMemo, useState } from 'react'
import PageShell from '../../components/shared/PageShell'
import Pagination from '../../components/shared/Pagination'
import { colors } from '../../theme'
import { useAuthStore } from '../../stores/authStore'
import {
  useStockSummary,
  useAdjustStock,
  type WarehouseBreakdown,
  type StockSummaryRow,
  type AdjustmentOperation,
} from '../../api/stock'
import {
  useProductCategories,
  useUpdateProduct,
  useProducts,
  type Product,
  type ProductInput,
} from '../../api/products'
import { useWarehouses, type Warehouse } from '../../api/warehouses'
import { formatQty } from '../../lib/format'
import type { StockUnit } from '@dom/shared'

const StockIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
)

const PAGE_SIZE = 30

const cardStyle: React.CSSProperties = { background: '#fff', borderRadius: 14, border: `1px solid ${colors.border}`, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }
const inputStyle: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, border: `1.5px solid ${colors.border}`, fontSize: 13, background: '#f8fafc', color: colors.textPrimary, outline: 'none' }
const formInputStyle: React.CSSProperties = { padding: '10px 14px', borderRadius: 8, border: `1.5px solid ${colors.border}`, fontSize: 14, outline: 'none', color: colors.textPrimary, background: '#f8fafc', boxSizing: 'border-box', width: '100%' }
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }

export default function StockSummary() {
  const user = useAuthStore((s) => s.user)
  const { data: summary = [], isLoading } = useStockSummary()
  const { data: products = [] } = useProducts()
  const { data: categories = [] } = useProductCategories()
  const { data: warehouses = [] } = useWarehouses()

  const updateProduct = useUpdateProduct()
  const adjustStock = useAdjustStock()

  const [categoryId, setCategoryId] = useState<string>('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [editTarget, setEditTarget] = useState<Product | null>(null)
  const [hoverProductId, setHoverProductId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [page, setPage] = useState(1)

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

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

  useEffect(() => { setPage(1) }, [categoryId, lowStockOnly, search])
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const pageStart = (page - 1) * PAGE_SIZE
  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE)

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
                  <th style={{ ...th, width: 44, textAlign: 'right' }}>#</th>
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
                  <tr><td colSpan={9} style={{ ...td, color: colors.textMuted, textAlign: 'center' }}>
                    {summary.length === 0 ? 'No products yet.' : 'No products match the current filters.'}
                  </td></tr>
                )}
                {paged.map((row, i) => (
                  <tr key={row.productId} style={{
                    borderBottom: `1px solid ${colors.border}`,
                    background: row.lowStock ? '#fef2f2' : 'transparent',
                  }}>
                    <td style={{ ...td, textAlign: 'right', color: colors.textMuted, fontVariantNumeric: 'tabular-nums' }}>{pageStart + i + 1}</td>
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
                      {formatQty(row.inStockQuantity)} <span style={{ color: colors.textMuted, fontWeight: 400, fontSize: 11 }}>{row.defaultUnit === 'KG' ? 'kg' : 'pcs'}</span>
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

      {editTarget && (
        <EditProductModal
          product={editTarget}
          summaryRow={summary.find((s) => s.productId === editTarget.id) ?? null}
          warehouses={warehouses}
          categories={categories}
          saveBusy={updateProduct.isPending}
          adjustBusy={adjustStock.isPending}
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
          onAdjust={async (input) => {
            await adjustStock.mutateAsync(input)
          }}
          onCancel={() => setEditTarget(null)}
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
            {r.boxes} box · {formatQty(r.quantity)} {u}
          </span>
        </div>
      ))}
    </div>
  )
}

function EditProductModal({
  product, summaryRow, warehouses, categories, saveBusy, adjustBusy, onSave, onAdjust, onCancel,
}: {
  product: Product
  summaryRow: StockSummaryRow | null
  warehouses: Warehouse[]
  categories: { id: string; name: string }[]
  saveBusy: boolean
  adjustBusy: boolean
  onSave: (input: Partial<ProductInput>) => Promise<void>
  onAdjust: (input: {
    productId: string; warehouseId: string;
    operation: AdjustmentOperation; unit: StockUnit;
    quantity?: number; boxes: number;
  }) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState<Required<Omit<ProductInput, 'productCode'>>>({
    categoryId: product.categoryId,
    name: product.name,
    defaultUnit: product.defaultUnit,
    reservedThreshold: product.reservedThreshold,
  })

  // Stock adjustment form state — independent of product form.
  const [adjOp, setAdjOp] = useState<AdjustmentOperation>('ADD')
  const [adjWarehouseId, setAdjWarehouseId] = useState<string>(() => {
    return summaryRow?.byWarehouse[0]?.warehouseId ?? warehouses[0]?.id ?? ''
  })
  const [adjUnit, setAdjUnit] = useState<StockUnit>(product.defaultUnit)
  const [adjQuantity, setAdjQuantity] = useState<string>('')
  const [adjBoxes, setAdjBoxes] = useState<string>('1')
  const [adjError, setAdjError] = useState<string | null>(null)
  const [adjSuccess, setAdjSuccess] = useState<string | null>(null)

  const unitLabel = product.defaultUnit === 'KG' ? 'kg' : 'pcs'

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    await onSave(form)
  }

  async function handleApplyAdjustment() {
    setAdjError(null); setAdjSuccess(null)
    const boxes = parseInt(adjBoxes, 10)
    const qtyRaw = adjQuantity.trim()
    const qty = qtyRaw ? parseFloat(qtyRaw) : undefined
    if (!adjWarehouseId) { setAdjError('Pick a warehouse'); return }
    if (!boxes || boxes < 1) { setAdjError('Box count must be at least 1'); return }
    if (adjOp === 'ADD' && (!qty || qty <= 0)) { setAdjError('Quantity per box must be greater than 0'); return }
    if (adjOp === 'REMOVE' && qtyRaw && (!qty || qty <= 0)) { setAdjError('Qty per box must be greater than 0'); return }
    try {
      await onAdjust({
        productId: product.id,
        warehouseId: adjWarehouseId,
        operation: adjOp,
        unit: adjUnit,
        quantity: qty,
        boxes,
      })
      const whName = warehouses.find((w) => w.id === adjWarehouseId)?.name ?? 'warehouse'
      const u = adjUnit === 'KG' ? 'kg' : 'pcs'
      setAdjSuccess(adjOp === 'ADD'
        ? `Added ${boxes} box${boxes > 1 ? 'es' : ''} (${qty} ${u} each) at ${whName}.`
        : qty
          ? `Removed ${boxes} box${boxes > 1 ? 'es' : ''} of ${qty} ${u} from ${whName}.`
          : `Removed ${boxes} box${boxes > 1 ? 'es' : ''} (oldest first) from ${whName}.`)
      setAdjBoxes('1')
      setAdjQuantity('')
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } }; message?: string }
      setAdjError(e?.response?.data?.error ?? e?.message ?? 'Adjustment failed')
    }
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
        style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 720, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
      >
        <div style={{ padding: '18px 24px', borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: colors.textPrimary }}>Edit product</div>
          <div style={{ fontSize: 12, color: colors.textMuted, fontFamily: 'monospace', marginTop: 2 }}>{product.productCode}</div>
        </div>

        {/* ─── Section 1 · Product details (editable form) ──────────────── */}
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Product details
          </div>
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="submit" disabled={saveBusy} className="btn btn-primary" style={{
              padding: '9px 18px', fontSize: 13, fontWeight: 700, opacity: saveBusy ? 0.7 : 1,
            }}>{saveBusy ? 'Saving…' : 'Save details'}</button>
          </div>
        </form>

        <div style={{ height: 1, background: colors.border }} />

        {/* ─── Section 2 · Current stock (read-only breakdown) ──────────── */}
        <div style={{ padding: '20px 24px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Current stock
          </div>
          {summaryRow && summaryRow.byWarehouse.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: colors.textPrimary, padding: '6px 12px', background: '#f1f5f9', borderRadius: 8 }}>
                <span>Total</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {summaryRow.boxCount} box · {formatQty(summaryRow.inStockQuantity)} {unitLabel}
                </span>
              </div>
              {summaryRow.byWarehouse.map((b) => (
                <div key={b.warehouseId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: colors.textSecondary, padding: '4px 12px' }}>
                  <span>{b.warehouseName}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {b.boxes} box · {formatQty(b.quantity)} {unitLabel}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: colors.textMuted, fontStyle: 'italic', padding: '4px 12px' }}>
              No stock yet for this product.
            </div>
          )}
        </div>

        <div style={{ height: 1, background: colors.border }} />

        {/* ─── Section 3 · Stock adjustment (write) ─────────────────────── */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Adjust stock
            </div>
            <div style={{ fontSize: 11, color: colors.textMuted, fontStyle: 'italic' }}>
              Manual override · logs as <code>ADJ-YYYYMMDD-NNN</code> batch
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {(['ADD', 'REMOVE'] as AdjustmentOperation[]).map((op) => (
              <button
                key={op} type="button" onClick={() => setAdjOp(op)}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 8,
                  border: `1.5px solid ${adjOp === op
                    ? (op === 'ADD' ? '#16a34a' : '#dc2626')
                    : colors.border}`,
                  background: adjOp === op
                    ? (op === 'ADD' ? '#dcfce7' : '#fee2e2')
                    : '#fff',
                  color: adjOp === op
                    ? (op === 'ADD' ? '#15803d' : '#b91c1c')
                    : colors.textSecondary,
                  fontWeight: 700, fontSize: 13, cursor: 'pointer',
                }}
              >{op === 'ADD' ? '+ Add boxes' : '− Remove boxes'}</button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.8fr 1fr', gap: 12, alignItems: 'end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>Warehouse</label>
              <select
                value={adjWarehouseId}
                onChange={(e) => setAdjWarehouseId(e.target.value)}
                style={formInputStyle}
              >
                {warehouses.length === 0 && <option value="">No warehouses</option>}
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>Number of boxes</label>
              <input
                type="number" min={1} max={500} step={1}
                value={adjBoxes}
                onChange={(e) => setAdjBoxes(e.target.value)}
                style={formInputStyle}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>Unit</label>
              <select
                value={adjUnit}
                onChange={(e) => setAdjUnit(e.target.value as StockUnit)}
                style={formInputStyle}
              >
                <option value="KG">KG</option>
                <option value="PCS">PCS</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>
                Qty per box {adjOp === 'REMOVE' && <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: colors.textMuted }}>· optional</span>}
              </label>
              <input
                type="number" min={0.01} step="any"
                value={adjQuantity}
                onChange={(e) => setAdjQuantity(e.target.value)}
                placeholder={adjOp === 'ADD'
                  ? (adjUnit === 'KG' ? '5.0' : '24')
                  : 'any (oldest first)'}
                style={formInputStyle}
              />
            </div>
          </div>
          {adjOp === 'REMOVE' && (
            <div style={{ fontSize: 11, color: colors.textMuted, fontStyle: 'italic' }}>
              Boxes of the same product may differ in size. Specify the exact qty per box to only remove matching boxes; leave blank to remove the oldest N boxes regardless of size.
            </div>
          )}

          {adjError && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: colors.dangerLight, border: `1px solid ${colors.dangerBorder}`, fontSize: 12, color: '#dc2626' }}>
              {adjError}
            </div>
          )}
          {adjSuccess && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: '#dcfce7', border: '1px solid #86efac', fontSize: 12, color: '#166534' }}>
              {adjSuccess}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button" onClick={handleApplyAdjustment} disabled={adjustBusy}
              style={{
                padding: '10px 20px', borderRadius: 8,
                background: adjOp === 'ADD' ? '#16a34a' : '#dc2626',
                color: '#fff', border: 'none', fontSize: 13, fontWeight: 700,
                cursor: adjustBusy ? 'not-allowed' : 'pointer', opacity: adjustBusy ? 0.7 : 1,
              }}
            >{adjustBusy ? 'Applying…' : `Apply ${adjOp === 'ADD' ? 'addition' : 'removal'}`}</button>
          </div>
        </div>

        <div style={{ padding: '14px 24px', borderTop: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} style={{
            padding: '9px 18px', border: `1px solid ${colors.border}`, background: '#fff',
            borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>Close</button>
        </div>
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
