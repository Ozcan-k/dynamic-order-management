import { FormEvent, useEffect, useState } from 'react'
import PageShell from '../../components/shared/PageShell'
import { colors } from '../../theme'
import { useAuthStore } from '../../stores/authStore'
import { useGenerateLabels } from '../../api/stock'
import { useProducts } from '../../api/products'
import { useWarehouses } from '../../api/warehouses'
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

function todayBatchPreview(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-NNN`
}

export default function InventoryItems() {
  const user = useAuthStore((s) => s.user)
  const { data: products = [] } = useProducts()
  const { data: warehouses = [] } = useWarehouses()

  const [productId, setProductId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [unit, setUnit] = useState<StockUnit>('KG')
  const [quantity, setQuantity] = useState('')
  const [count, setCount] = useState('10')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ count: number; batchNumber: string; url: string } | null>(null)

  const mutation = useGenerateLabels()

  useEffect(() => {
    if (!productId && products.length) setProductId(products[0].id)
  }, [products, productId])
  useEffect(() => {
    if (!warehouseId && warehouses.length) setWarehouseId(warehouses[0].id)
  }, [warehouses, warehouseId])
  useEffect(() => {
    const product = products.find((p) => p.id === productId)
    if (product) setUnit(product.defaultUnit)
  }, [productId, products])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null); setSuccess(null)
    try {
      const { blob, count: created, batchNumber } = await mutation.mutateAsync({
        productId, warehouseId, unit,
        quantity: parseFloat(quantity),
        count: parseInt(count, 10),
      })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setSuccess({ count: created, batchNumber, url })
      setQuantity('')
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } }; message?: string }
      setError(e?.response?.data?.error ?? e?.message ?? 'Failed to generate labels')
    }
  }

  if (products.length === 0) {
    return (
      <PageShell icon={StockIcon} title="Inventory — Create Labels" subtitle={`${user?.username}`}>
        <div style={{ ...cardStyle, color: colors.textSecondary }}>
          You need at least one product before creating labels. Go to <strong>Inventory → Product</strong> first.
        </div>
      </PageShell>
    )
  }
  if (warehouses.length === 0) {
    return (
      <PageShell icon={StockIcon} title="Inventory — Create Labels" subtitle={`${user?.username}`}>
        <div style={{ ...cardStyle, color: colors.textSecondary }}>
          You need at least one warehouse before creating labels. Go to <strong>Inventory → Warehouse</strong> first.
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell
      icon={StockIcon}
      title="Inventory — Create Labels"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
    >
      <div style={{ ...cardStyle, maxWidth: 720, margin: '0 auto' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700 }}>Generate QR Labels</h3>
        <p style={{ margin: '0 0 8px', fontSize: 13, color: colors.textSecondary }}>
          Each printed label corresponds to one physical box. Avery L7173 / J8173 (A4, 10 per sheet).
        </p>
        <p style={{ margin: '0 0 18px', fontSize: 12, color: colors.textMuted, fontStyle: 'italic' }}>
          Printed labels are pending until a Stock Keeper scans them into a warehouse.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Product">
            <select value={productId} onChange={(e) => setProductId(e.target.value)} required style={inputStyle}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {p.category.name} (#{p.productCode})</option>
              ))}
            </select>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Unit">
              <div style={{ display: 'flex', gap: 6 }}>
                {(['KG', 'PCS'] as StockUnit[]).map((u) => (
                  <button
                    key={u} type="button" onClick={() => setUnit(u)}
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13,
                      border: `1.5px solid ${unit === u ? colors.primary : colors.border}`,
                      background: unit === u ? colors.primary : '#fff',
                      color: unit === u ? '#fff' : colors.textSecondary,
                      cursor: 'pointer',
                    }}
                  >{u}</button>
                ))}
              </div>
            </Field>
            <Field label={unit === 'KG' ? 'Weight per label (kg)' : 'Count per label (pcs)'}>
              <input
                type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)}
                required min={0} step="any" style={inputStyle}
                placeholder={unit === 'KG' ? '5.0' : '24'}
              />
            </Field>
          </div>

          <Field label="Warehouse (printed on label — destination)">
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required style={inputStyle}>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>

          <Field label="Number of labels">
            <input
              type="number" value={count} onChange={(e) => setCount(e.target.value)}
              required min={1} max={500} step={1} style={inputStyle}
            />
          </Field>

          <Field label="Batch number (auto)">
            <div style={{ ...inputStyle, fontFamily: 'monospace', color: colors.textSecondary, background: '#f1f5f9' }}>
              {todayBatchPreview()}
            </div>
          </Field>

          {error && <ErrorBox message={error} />}

          {success && (
            <div style={{
              padding: '12px 14px', borderRadius: 8,
              background: '#dcfce7', border: '1px solid #86efac',
              fontSize: 13, color: '#166534', fontWeight: 500,
            }}>
              ✓ {success.count} label(s) created · Batch <strong>{success.batchNumber}</strong>{' '}
              <a href={success.url} target="_blank" rel="noreferrer" style={{ color: '#166534', fontWeight: 700 }}>Reopen PDF</a>
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={mutation.isPending}
            style={{ marginTop: 4, padding: '12px 18px', fontWeight: 700,
              opacity: mutation.isPending ? 0.7 : 1, cursor: mutation.isPending ? 'not-allowed' : 'pointer' }}>
            {mutation.isPending ? 'Generating PDF…' : 'Generate Labels PDF'}
          </button>
        </form>
      </div>
    </PageShell>
  )
}

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
