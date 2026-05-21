import { FormEvent, useEffect, useMemo, useState } from 'react'
import PageShell from '../../components/shared/PageShell'
import ConfirmModal from '../../components/shared/ConfirmModal'
import Pagination from '../../components/shared/Pagination'
import { colors } from '../../theme'
import { useAuthStore } from '../../stores/authStore'
import {
  useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct,
  useProductCategories, useCreateCategory, useDeleteCategory,
  type Product, type ProductInput,
} from '../../api/products'
import type { StockUnit } from '@dom/shared'

const StockIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
)

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: colors.textSecondary,
  textTransform: 'uppercase', letterSpacing: '0.06em',
}
const inputStyle: React.CSSProperties = {
  padding: '10px 14px', borderRadius: 8,
  border: `1.5px solid ${colors.border}`, fontSize: 14,
  outline: 'none', color: colors.textPrimary, background: '#f8fafc',
  boxSizing: 'border-box', width: '100%',
}
const cardStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 14,
  border: `1px solid ${colors.border}`,
  padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
}
const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 18px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
  border: 'none', borderRadius: 8,
  background: active ? colors.primary : 'transparent',
  color: active ? '#fff' : colors.textSecondary,
})
const toolbarInputStyle: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 8,
  border: `1.5px solid ${colors.border}`, fontSize: 13,
  background: '#f8fafc', color: colors.textPrimary, outline: 'none',
}

const PAGE_SIZE = 30

export default function Products() {
  const user = useAuthStore((s) => s.user)
  const [tab, setTab] = useState<'categories' | 'products'>('products')

  return (
    <PageShell
      icon={StockIcon}
      title="Products"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button style={tabStyle(tab === 'products')} onClick={() => setTab('products')}>Products</button>
        <button style={tabStyle(tab === 'categories')} onClick={() => setTab('categories')}>Categories</button>
      </div>
      {tab === 'categories' ? <CategoriesTab /> : <ProductsTab />}
    </PageShell>
  )
}

// ─── Categories tab ─────────────────────────────────────────────────────────

function CategoriesTab() {
  const { data: categories = [], isLoading } = useProductCategories()
  const create = useCreateCategory()
  const remove = useDeleteCategory()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await create.mutateAsync({ name: name.trim() })
      setName('')
    } catch (err) {
      setError(extractErr(err) ?? 'Failed to create category')
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await remove.mutateAsync(deleteTarget.id)
      setDeleteTarget(null)
    } catch (err) {
      setError(extractErr(err) ?? 'Failed to delete category')
      setDeleteTarget(null)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700 }}>Add Category</h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Name</label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              required maxLength={80} placeholder="e.g. Nuts" style={inputStyle}
            />
          </div>
          {error && <ErrorBox message={error} />}
          <button type="submit" className="btn btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Adding…' : 'Add Category'}
          </button>
        </form>
      </div>

      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700 }}>Categories ({categories.length})</h3>
        {isLoading ? <div style={{ color: colors.textSecondary }}>Loading…</div> : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {categories.length === 0 && <li style={{ color: colors.textMuted, fontSize: 13 }}>No categories yet.</li>}
            {categories.map((c) => (
              <li key={c.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', borderRadius: 8, background: '#f8fafc',
              }}>
                <span style={{ fontWeight: 600 }}>{c.name}</span>
                <button
                  onClick={() => setDeleteTarget({ id: c.id, name: c.name })}
                  style={{ background: 'transparent', border: 'none', color: colors.danger, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {deleteTarget && (
        <ConfirmModal
          title="Delete category"
          message={`This will permanently remove the category "${deleteTarget.name}".`}
          detail="Categories referenced by existing products cannot be deleted."
          confirmLabel="Delete"
          tone="danger"
          busy={remove.isPending}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

// ─── Products tab ───────────────────────────────────────────────────────────

function ProductsTab() {
  const { data: products = [], isLoading } = useProducts()
  const { data: categories = [] } = useProductCategories()
  const create = useCreateProduct()
  const update = useUpdateProduct()
  const remove = useDeleteProduct()

  const [editing, setEditing] = useState<Product | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  const [filterCategoryId, setFilterCategoryId] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter((p) => {
      if (filterCategoryId && p.categoryId !== filterCategoryId) return false
      if (q) {
        const haystack = `${p.name} ${p.productCode} ${p.category.name}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [products, filterCategoryId, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  useEffect(() => { setPage(1) }, [filterCategoryId, search])
  useEffect(() => { if (page > totalPages) setPage(totalPages) }, [page, totalPages])

  const pageStart = (page - 1) * PAGE_SIZE
  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE)

  const blankInput: ProductInput = {
    categoryId: categories[0]?.id ?? '',
    name: '',
    defaultUnit: 'KG',
    reservedThreshold: 0,
  }
  const [form, setForm] = useState<ProductInput>(blankInput)

  function startNew() {
    setEditing(null)
    setForm({ ...blankInput, categoryId: categories[0]?.id ?? '' })
    setShowForm(true)
    setError(null)
  }
  function startEdit(p: Product) {
    setEditing(p)
    setForm({
      categoryId: p.categoryId,
      name: p.name,
      defaultUnit: p.defaultUnit,
      reservedThreshold: p.reservedThreshold,
    })
    setShowForm(true)
    setError(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      if (editing) await update.mutateAsync({ id: editing.id, input: form })
      else await create.mutateAsync(form)
      setShowForm(false); setEditing(null)
    } catch (err) {
      setError(extractErr(err) ?? 'Failed to save product')
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await remove.mutateAsync(deleteTarget.id)
      setDeleteTarget(null)
    } catch (err) {
      setError(extractErr(err) ?? 'Failed to delete product')
      setDeleteTarget(null)
    }
  }

  if (categories.length === 0) {
    return (
      <div style={{ ...cardStyle, color: colors.textSecondary }}>
        Create a category first (Categories tab) before adding products.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <select
          value={filterCategoryId}
          onChange={(e) => setFilterCategoryId(e.target.value)}
          style={toolbarInputStyle}
        >
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product name or ID…"
          style={{ ...toolbarInputStyle, minWidth: 240, flex: '1 1 240px' }}
        />
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: colors.textSecondary }}>
          {filtered.length} / {products.length} products
        </h3>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn btn-primary" onClick={startNew}>+ Add Product</button>
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      {showForm && (
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700 }}>
            {editing ? `Edit ${editing.name}` : 'New Product'}
          </h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Category">
                <select
                  value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                  required style={inputStyle}
                >
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Product Name">
                <input
                  type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required maxLength={120} style={inputStyle}
                />
              </Field>
              <Field label="Product ID">
                {editing ? (
                  <div style={{ ...inputStyle, fontFamily: 'monospace', background: '#f1f5f9', color: colors.textSecondary }}>
                    {editing.productCode}
                  </div>
                ) : (
                  <div style={{ ...inputStyle, color: colors.textMuted, fontStyle: 'italic', background: '#f8fafc' }}>
                    Auto-generated on save (e.g. NUT-001)
                  </div>
                )}
              </Field>
              <Field label="Default Unit">
                <select
                  value={form.defaultUnit} onChange={(e) => setForm({ ...form, defaultUnit: e.target.value as StockUnit })}
                  style={inputStyle}
                >
                  <option value="KG">KG</option>
                  <option value="PCS">PCS</option>
                </select>
              </Field>
              <Field label="Reserved (low-stock threshold)">
                <input
                  type="number" min={0} step={0.1}
                  value={form.reservedThreshold}
                  onChange={(e) => setForm({ ...form, reservedThreshold: parseFloat(e.target.value) || 0 })}
                  style={inputStyle}
                />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={create.isPending || update.isPending}>
                {create.isPending || update.isPending ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button" onClick={() => { setShowForm(false); setEditing(null); setError(null) }}
                style={{ padding: '10px 18px', border: `1px solid ${colors.border}`, background: '#fff', borderRadius: 8, cursor: 'pointer' }}
              >Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div style={cardStyle}>
        {isLoading ? <div style={{ color: colors.textSecondary }}>Loading…</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: `1px solid ${colors.border}` }}>
                <th style={th}>Category</th>
                <th style={th}>Product Name</th>
                <th style={th}>Product ID</th>
                <th style={th}>Unit</th>
                <th style={th}>Reserved</th>
                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ ...td, color: colors.textMuted, textAlign: 'center' }}>
                  {products.length === 0 ? 'No products yet.' : 'No products match the current filters.'}
                </td></tr>
              )}
              {paged.map((p) => (
                <tr key={p.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <td style={td}>{p.category.name}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{p.name}</td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{p.productCode}</td>
                  <td style={td}>{p.defaultUnit}</td>
                  <td style={td}>{p.reservedThreshold}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <button onClick={() => startEdit(p)} style={btnLink}>Edit</button>
                    <button onClick={() => setDeleteTarget(p)} style={{ ...btnLink, color: colors.danger }}>Delete</button>
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

      {deleteTarget && (
        <ConfirmModal
          title="Delete product"
          message={`This will permanently remove "${deleteTarget.name}" from the product master list. Pending labels and used-stock history for this product will also be cleared. Deletion is blocked if any boxes are still IN STOCK.`}
          detail={`Product ID: ${deleteTarget.productCode} · Category: ${deleteTarget.category.name}`}
          confirmLabel="Delete"
          tone="danger"
          busy={remove.isPending}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '10px 8px', fontWeight: 700, color: colors.textSecondary, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }
const td: React.CSSProperties = { padding: '10px 8px', color: colors.textPrimary }
const btnLink: React.CSSProperties = { background: 'transparent', border: 'none', color: colors.primary, cursor: 'pointer', fontWeight: 600, fontSize: 12, padding: '4px 8px' }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 8,
      background: colors.dangerLight, border: `1px solid ${colors.dangerBorder}`,
      fontSize: 13, color: '#dc2626', fontWeight: 500,
    }}>{message}</div>
  )
}

function extractErr(err: unknown): string | null {
  const e = err as { response?: { data?: { error?: string } }; message?: string }
  return e?.response?.data?.error ?? e?.message ?? null
}
