import { FormEvent, useState } from 'react'
import PageShell from '../../components/shared/PageShell'
import { colors } from '../../theme'
import { useAuthStore } from '../../stores/authStore'
import {
  useWarehouses, useCreateWarehouse, useUpdateWarehouse, useDeleteWarehouse,
  type Warehouse, type WarehouseInput,
} from '../../api/warehouses'

const StockIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
)

const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }
const inputStyle: React.CSSProperties = { padding: '10px 14px', borderRadius: 8, border: `1.5px solid ${colors.border}`, fontSize: 14, outline: 'none', color: colors.textPrimary, background: '#f8fafc', boxSizing: 'border-box', width: '100%' }
const cardStyle: React.CSSProperties = { background: '#fff', borderRadius: 14, border: `1px solid ${colors.border}`, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }

export default function Warehouses() {
  const user = useAuthStore((s) => s.user)
  const { data: warehouses = [], isLoading } = useWarehouses()
  const create = useCreateWarehouse()
  const update = useUpdateWarehouse()
  const remove = useDeleteWarehouse()

  const [editing, setEditing] = useState<Warehouse | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<WarehouseInput>({ name: '', address: '' })
  const [error, setError] = useState<string | null>(null)

  function startNew() { setEditing(null); setForm({ name: '', address: '' }); setShowForm(true); setError(null) }
  function startEdit(w: Warehouse) { setEditing(w); setForm({ name: w.name, address: w.address }); setShowForm(true); setError(null) }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError(null)
    try {
      if (editing) await update.mutateAsync({ id: editing.id, input: form })
      else await create.mutateAsync(form)
      setShowForm(false); setEditing(null)
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } }; message?: string }
      setError(e?.response?.data?.error ?? e?.message ?? 'Failed to save warehouse')
    }
  }

  async function handleDelete(w: Warehouse) {
    if (!window.confirm(`Delete warehouse "${w.name}"?`)) return
    try { await remove.mutateAsync(w.id) }
    catch (err) {
      const e = err as { response?: { data?: { error?: string } }; message?: string }
      setError(e?.response?.data?.error ?? e?.message ?? 'Failed to delete warehouse')
    }
  }

  return (
    <PageShell icon={StockIcon} title="Warehouses" subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Warehouses ({warehouses.length})</h3>
          <button className="btn btn-primary" onClick={startNew}>+ Add Warehouse</button>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px', borderRadius: 8,
            background: colors.dangerLight, border: `1px solid ${colors.dangerBorder}`,
            fontSize: 13, color: '#dc2626', fontWeight: 500,
          }}>{error}</div>
        )}

        {showForm && (
          <div style={cardStyle}>
            <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700 }}>
              {editing ? `Edit ${editing.name}` : 'New Warehouse'}
            </h3>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="Warehouse Name">
                <input type="text" required maxLength={80}
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  style={inputStyle} placeholder="e.g. Main WH" />
              </Field>
              <Field label="Address">
                <input type="text" required maxLength={300}
                  value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                  style={inputStyle} placeholder="Street, City, Zip" />
              </Field>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={create.isPending || update.isPending}>
                  {create.isPending || update.isPending ? 'Saving…' : 'Save'}
                </button>
                <button type="button"
                  onClick={() => { setShowForm(false); setEditing(null); setError(null) }}
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
                  <th style={th}>Name</th>
                  <th style={th}>Address</th>
                  <th style={th}>In-stock items</th>
                  <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {warehouses.length === 0 && (
                  <tr><td colSpan={4} style={{ ...td, color: colors.textMuted }}>No warehouses yet.</td></tr>
                )}
                {warehouses.map((w) => (
                  <tr key={w.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <td style={{ ...td, fontWeight: 600 }}>{w.name}</td>
                    <td style={td}>{w.address}</td>
                    <td style={td}>{w.itemsCount ?? 0}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <button onClick={() => startEdit(w)} style={btnLink}>Edit</button>
                      <button onClick={() => handleDelete(w)} style={{ ...btnLink, color: colors.danger }}>Delete</button>
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
