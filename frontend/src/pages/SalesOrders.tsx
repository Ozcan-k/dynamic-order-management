import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  SaleChannel,
  SALE_CHANNEL_LABELS,
  SALES_STORES,
  type SalesStore,
} from '@dom/shared'
import PageShell from '../components/shared/PageShell'
import DirectOrderFormModal from '../components/sales/DirectOrderFormModal'
import { useAuthStore } from '../stores/authStore'
import {
  deleteDirectOrder,
  fetchOwnDirectOrders,
  updateDirectOrder,
  type DirectOrder,
} from '../api/sales'

function CartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  )
}

function todayManila(): string {
  const ms = Date.now() + 8 * 60 * 60 * 1000
  return new Date(ms).toISOString().slice(0, 10)
}

function daysAgoManila(n: number): string {
  const ms = Date.now() + 8 * 60 * 60 * 1000 - n * 24 * 60 * 60 * 1000
  return new Date(ms).toISOString().slice(0, 10)
}

export default function SalesOrders() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const [from, setFrom] = useState<string>(daysAgoManila(30))
  const [to, setTo] = useState<string>(todayManila())
  const [store, setStore] = useState<SalesStore | ''>('')
  const [channel, setChannel] = useState<SaleChannel | ''>('')
  const [editingOrder, setEditingOrder] = useState<DirectOrder | null>(null)

  const queryKey = ['sales-own-orders', from, to, store, channel] as const
  const { data: orders = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchOwnDirectOrders({
      from,
      to,
      store: store || undefined,
      channel: channel || undefined,
    }),
    staleTime: 5_000,
  })

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['sales-own-orders'] })
    queryClient.invalidateQueries({ queryKey: ['sales-orders'] })
    queryClient.invalidateQueries({ queryKey: ['sales-calendar'] })
    queryClient.invalidateQueries({ queryKey: ['sales-day-detail'] })
  }

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof updateDirectOrder>[1] }) =>
      updateDirectOrder(id, payload),
    onSuccess: () => { invalidateAll(); setEditingOrder(null) },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteDirectOrder,
    onSuccess: () => invalidateAll(),
  })

  function handleDelete(order: DirectOrder) {
    if (deleteMutation.isPending) return
    const ok = window.confirm(
      `Delete this order?\n\n${order.date} · ${order.companyName} · ${order.customerName}\n${formatPHP(order.totalAmount)}`,
    )
    if (!ok) return
    deleteMutation.mutate(order.id)
  }

  const totals = useMemo(() => {
    const amount = orders.reduce((acc, o) => acc + o.totalAmount, 0)
    const itemCount = orders.reduce((acc, o) => acc + o.items.reduce((s, it) => s + it.quantity, 0), 0)
    return { count: orders.length, amount, itemCount }
  }, [orders])

  return (
    <PageShell
      icon={<CartIcon />}
      title="My Direct Orders"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
    >
      {/* Filters */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '12px',
        marginBottom: '14px',
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '14px',
      }}>
        <Field label="From">
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="To">
          <input type="date" value={to} min={from} max={todayManila()} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Store">
          <select value={store} onChange={(e) => setStore(e.target.value as SalesStore | '')} style={inputStyle}>
            <option value="">All stores</option>
            {SALES_STORES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Channel">
          <select value={channel} onChange={(e) => setChannel(e.target.value as SaleChannel | '')} style={inputStyle}>
            <option value="">All channels</option>
            {Object.values(SaleChannel).map((c) => (
              <option key={c} value={c}>{SALE_CHANNEL_LABELS[c]}</option>
            ))}
          </select>
        </Field>
      </div>

      {/* Summary */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '12px',
        marginBottom: '14px',
      }}>
        <StatCard label="Orders" value={totals.count.toString()} />
        <StatCard label="Items Sold" value={totals.itemCount.toString()} />
        <StatCard label="Total Sales" value={formatPHP(totals.amount)} highlight />
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading…</div>
      ) : orders.length === 0 ? (
        <div style={{
          padding: '40px 20px',
          textAlign: 'center',
          background: '#fff',
          border: '1px dashed #cbd5e1',
          borderRadius: '12px',
          color: '#64748b',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🛒</div>
          <strong style={{ display: 'block', color: '#0f172a', marginBottom: '4px' }}>No orders found</strong>
          <span style={{ fontSize: '13px' }}>Try widening the date range or clearing the filters.</span>
        </div>
      ) : (
        <OrdersTable
          orders={orders}
          onEdit={setEditingOrder}
          onDelete={handleDelete}
          deletingId={deleteMutation.isPending ? deleteMutation.variables ?? null : null}
        />
      )}

      {editingOrder && (
        <DirectOrderFormModal
          mode="edit"
          lockDateStore={false}
          date={editingOrder.date}
          store={editingOrder.store as SalesStore}
          initialOrder={editingOrder}
          submitting={updateMutation.isPending}
          onSubmit={(payload) => updateMutation.mutate({ id: editingOrder.id, payload })}
          onCancel={() => setEditingOrder(null)}
        />
      )}
    </PageShell>
  )
}

function OrdersTable({
  orders,
  onEdit,
  onDelete,
  deletingId,
}: {
  orders: DirectOrder[]
  onEdit: (order: DirectOrder) => void
  onDelete: (order: DirectOrder) => void
  deletingId: string | null
}) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      overflow: 'hidden',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <Th>Date</Th>
            <Th>Store</Th>
            <Th>Channel</Th>
            <Th>Company</Th>
            <Th>Customer</Th>
            <Th>Items</Th>
            <Th align="right">Delivery</Th>
            <Th align="right">Total</Th>
            <Th align="right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <Td>{o.date}</Td>
              <Td>{o.store}</Td>
              <Td>
                <span style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  borderRadius: '9999px',
                  background: '#eff6ff',
                  color: '#1d4ed8',
                }}>
                  {SALE_CHANNEL_LABELS[o.saleChannel]}
                </span>
              </Td>
              <Td>{o.companyName}</Td>
              <Td>{o.customerName}</Td>
              <Td>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {o.items.map((it) => (
                    <span key={it.id} style={{ color: '#475569', fontSize: '12px' }}>
                      {it.productName} × {it.quantity} @ {formatPHP(it.price)}
                    </span>
                  ))}
                </div>
              </Td>
              <Td align="right">{formatPHP(o.deliveryCost)}</Td>
              <Td align="right"><strong style={{ color: '#0f172a' }}>{formatPHP(o.totalAmount)}</strong></Td>
              <Td align="right">
                <div style={{ display: 'inline-flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => onEdit(o)}
                    title="Edit order"
                    style={actionBtnStyle('#1d4ed8')}
                  >Edit</button>
                  <button
                    type="button"
                    onClick={() => onDelete(o)}
                    disabled={deletingId === o.id}
                    title="Delete order"
                    style={actionBtnStyle('#dc2626', deletingId === o.id)}
                  >
                    {deletingId === o.id ? '…' : 'Delete'}
                  </button>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function actionBtnStyle(color: string, disabled = false): React.CSSProperties {
  return {
    fontSize: '12px', fontWeight: 600,
    padding: '5px 10px',
    border: `1px solid ${color}`, borderRadius: '6px',
    background: '#fff', color,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </span>
      {children}
    </label>
  )
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{
      background: highlight ? 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)' : '#fff',
      color: highlight ? '#fff' : '#0f172a',
      border: highlight ? 'none' : '1px solid #e2e8f0',
      borderRadius: '12px',
      padding: '14px 16px',
    }}>
      <div style={{
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        color: highlight ? 'rgba(255,255,255,0.85)' : '#64748b',
        marginBottom: '6px',
      }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th style={{
      textAlign: align ?? 'left',
      padding: '10px 12px',
      fontSize: '11px',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      color: '#64748b',
    }}>
      {children}
    </th>
  )
}

function Td({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <td style={{ textAlign: align ?? 'left', padding: '10px 12px', verticalAlign: 'top', color: '#0f172a' }}>
      {children}
    </td>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  fontSize: '13px',
  padding: '8px 10px',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  background: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
}

function formatPHP(n: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n)
}
