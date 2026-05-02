import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { colors } from '../theme'
import PageShell from '../components/shared/PageShell'
import { useCreateBulkItems } from '../api/stock'

const StockIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
)

const labelStyle: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, color: colors.textSecondary,
  textTransform: 'uppercase', letterSpacing: '0.06em',
}

const inputStyle: React.CSSProperties = {
  padding: '10px 14px', borderRadius: '8px',
  border: `1.5px solid ${colors.border}`, fontSize: '14px',
  outline: 'none', color: colors.textPrimary, background: '#f8fafc',
  boxSizing: 'border-box', width: '100%',
}

export default function StockCreate() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const [productType, setProductType] = useState('')
  const [category, setCategory] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [quantity, setQuantity] = useState('10')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ count: number; url: string } | null>(null)

  const mutation = useCreateBulkItems()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    try {
      const payload = {
        productType: productType.trim(),
        category: category.trim(),
        weightKg: parseFloat(weightKg),
        quantity: parseInt(quantity, 10),
      }
      const { blob, count } = await mutation.mutateAsync(payload)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setSuccess({ count, url })
      // Reset form for next batch
      setProductType('')
      setCategory('')
      setWeightKg('')
      setQuantity('10')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? (err instanceof Error ? err.message : 'Failed to create labels')
      setError(msg)
    }
  }

  return (
    <PageShell
      icon={StockIcon}
      title="Create Stock Labels"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
    >
      <div style={{ maxWidth: '560px' }}>
        <button
          onClick={() => navigate('/stock')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: 'transparent', border: 'none',
            color: colors.primary, fontSize: '13px', fontWeight: 600,
            cursor: 'pointer', padding: '4px 0', marginBottom: '14px',
          }}
        >
          ← Back to Dashboard
        </button>

        <div style={{
          background: '#fff', borderRadius: '14px',
          border: `1px solid ${colors.border}`,
          padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}>
          <h2 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 700, color: colors.textPrimary }}>
            Generate QR Labels
          </h2>
          <p style={{ margin: '0 0 20px', fontSize: '13px', color: colors.textSecondary }}>
            Print on Avery L7173 / J8173 sticker paper (A4, 10 labels per sheet, 99.1 × 57 mm).
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={labelStyle}>Product Type</label>
              <input
                type="text"
                value={productType}
                onChange={(e) => setProductType(e.target.value)}
                required maxLength={100}
                placeholder="e.g. Apple"
                style={inputStyle}
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={labelStyle}>Category</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required maxLength={100}
                placeholder="e.g. Fruit"
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <label style={labelStyle}>Weight (kg)</label>
                <input
                  type="number"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  required min={0.1} max={10000} step={0.1}
                  placeholder="e.g. 25.5"
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <label style={labelStyle}>Quantity</label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required min={1} max={500} step={1}
                  placeholder="1–500"
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{
              padding: '10px 14px', borderRadius: '8px',
              background: '#f0f9ff', border: '1px solid #bae6fd',
              fontSize: '12px', color: '#075985',
            }}>
              <strong>Layout:</strong> 10 labels per A4 sheet (2 columns × 5 rows). Each label contains a QR code + product info. {Math.ceil(parseInt(quantity || '0', 10) / 10) || 0} sheet(s) will be generated.
            </div>

            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: '8px',
                background: colors.dangerLight, border: `1px solid ${colors.dangerBorder}`,
                fontSize: '13px', color: '#dc2626', fontWeight: 500,
              }}>
                {error}
              </div>
            )}

            {success && (
              <div style={{
                padding: '12px 14px', borderRadius: '8px',
                background: '#dcfce7', border: '1px solid #86efac',
                fontSize: '13px', color: '#166534', fontWeight: 500,
              }}>
                ✓ {success.count} label(s) created and PDF opened in a new tab.{' '}
                <a href={success.url} target="_blank" rel="noreferrer" style={{ color: '#166534', fontWeight: 700 }}>
                  Reopen PDF
                </a>
              </div>
            )}

            <button
              type="submit"
              disabled={mutation.isPending}
              className="btn btn-primary"
              style={{
                marginTop: '4px', padding: '12px 18px', fontWeight: 700,
                opacity: mutation.isPending ? 0.7 : 1,
                cursor: mutation.isPending ? 'not-allowed' : 'pointer',
              }}
            >
              {mutation.isPending ? 'Generating PDF…' : 'Generate & Download PDF'}
            </button>
          </form>
        </div>
      </div>
    </PageShell>
  )
}
