import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SaleChannel, SALE_CHANNEL_LABELS, SalesStore } from '@dom/shared'
import {
  createDirectOrder,
  fetchOwnDirectOrders,
  type DirectOrder,
  type DirectOrderItem,
} from '../../api/sales'
import AutoSuggestInput from './AutoSuggestInput'

interface DirectOrderSectionProps {
  date: string
  store: SalesStore
}

export default function DirectOrderSection({ date, store }: DirectOrderSectionProps) {
  const queryClient = useQueryClient()
  const queryKey = ['sales-orders', date, store] as const

  const { data: orders = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchOwnDirectOrders({ date, store }),
    staleTime: 5_000,
  })

  const [modalOpen, setModalOpen] = useState(false)

  const createMutation = useMutation({
    mutationFn: createDirectOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      queryClient.invalidateQueries({ queryKey: ['sales-calendar'] })
      setModalOpen(false)
    },
  })

  const totalAmount = useMemo(
    () => orders.reduce((acc, o) => acc + o.totalAmount, 0),
    [orders],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ fontSize: '12px', color: '#64748b' }}>
          {orders.length} order{orders.length === 1 ? '' : 's'} · Total <strong style={{ color: '#0f172a' }}>{formatPHP(totalAmount)}</strong>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          style={{
            fontSize: '13px',
            fontWeight: 600,
            padding: '8px 14px',
            border: 'none',
            borderRadius: '8px',
            background: '#1d4ed8',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          + Add Order
        </button>
      </div>

      {isLoading ? (
        <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Loading…</div>
      ) : orders.length === 0 ? (
        <div style={{
          padding: '24px',
          textAlign: 'center',
          background: '#fff',
          border: '1px dashed #cbd5e1',
          borderRadius: '10px',
          color: '#64748b',
          fontSize: '13px',
        }}>
          No direct orders for this day yet. Click <strong style={{ color: '#0f172a' }}>+ Add Order</strong> to record one.
        </div>
      ) : (
        <OrdersTable orders={orders} />
      )}

      {modalOpen && (
        <AddOrderModal
          date={date}
          store={store}
          onCancel={() => setModalOpen(false)}
          onSubmit={(payload) => createMutation.mutate(payload)}
          submitting={createMutation.isPending}
        />
      )}
    </div>
  )
}

function OrdersTable({ orders }: { orders: DirectOrder[] }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: '10px',
      overflow: 'hidden',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <Th>Channel</Th>
            <Th>Company</Th>
            <Th>Customer</Th>
            <Th>Items</Th>
            <Th align="right">Delivery</Th>
            <Th align="right">Total</Th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
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
            </tr>
          ))}
        </tbody>
      </table>
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

// ─── Add Order Modal ────────────────────────────────────────────────────────

interface AddOrderModalProps {
  date: string
  store: SalesStore
  onCancel: () => void
  onSubmit: (payload: {
    date: string
    store: string
    saleChannel: SaleChannel
    companyName: string
    customerName: string
    deliveryCost: number
    items: DirectOrderItem[]
  }) => void
  submitting: boolean
}

function AddOrderModal({ date, store, onCancel, onSubmit, submitting }: AddOrderModalProps) {
  const [channel, setChannel] = useState<SaleChannel>(SaleChannel.FACEBOOK)
  const [company, setCompany] = useState('')
  const [customer, setCustomer] = useState('')
  const [delivery, setDelivery] = useState(0)
  const [items, setItems] = useState<DirectOrderItem[]>([{ productName: '', price: 0, quantity: 1 }])

  const subtotal = items.reduce((acc, it) => acc + it.price * it.quantity, 0)
  const total = subtotal + delivery

  const valid =
    company.trim().length > 0 &&
    customer.trim().length > 0 &&
    items.length > 0 &&
    items.every((it) => it.productName.trim().length > 0 && it.price >= 0 && it.quantity >= 1)

  function updateItem(idx: number, patch: Partial<DirectOrderItem>) {
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }
  function addItem() {
    setItems((arr) => [...arr, { productName: '', price: 0, quantity: 1 }])
  }
  function removeItem(idx: number) {
    setItems((arr) => (arr.length > 1 ? arr.filter((_, i) => i !== idx) : arr))
  }

  function submit() {
    if (!valid || submitting) return
    onSubmit({
      date,
      store,
      saleChannel: channel,
      companyName: company.trim(),
      customerName: customer.trim(),
      deliveryCost: delivery,
      items: items.map((it) => ({
        productName: it.productName.trim(),
        price: it.price,
        quantity: it.quantity,
      })),
    })
  }

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.45)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '40px 16px',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          width: '100%',
          maxWidth: '720px',
          borderRadius: '14px',
          boxShadow: '0 20px 50px rgba(15,23,42,0.25)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <strong style={{ fontSize: '15px', color: '#0f172a' }}>Add Direct Order</strong>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            {store} · {date}
          </span>
        </div>

        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Top row — channel + company + customer + delivery */}
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr 130px', gap: '12px' }}>
            <FieldShell label="Channel">
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as SaleChannel)}
                style={inputStyle}
              >
                {Object.values(SaleChannel).map((c) => (
                  <option key={c} value={c}>{SALE_CHANNEL_LABELS[c]}</option>
                ))}
              </select>
            </FieldShell>
            <FieldShell label="Company">
              <AutoSuggestInput field="companies" value={company} onChange={setCompany} placeholder="e.g. Acme Co" />
            </FieldShell>
            <FieldShell label="Customer">
              <AutoSuggestInput field="customers" value={customer} onChange={setCustomer} placeholder="e.g. John Doe" />
            </FieldShell>
            <FieldShell label="Delivery (PHP)">
              <input
                type="number"
                min={0}
                step={1}
                value={delivery}
                onChange={(e) => setDelivery(Math.max(0, Number(e.target.value) || 0))}
                style={inputStyle}
              />
            </FieldShell>
          </div>

          {/* Items */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Items
              </span>
              <button type="button" onClick={addItem} style={{
                fontSize: '12px',
                fontWeight: 600,
                padding: '4px 10px',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                background: '#fff',
                color: '#1d4ed8',
                cursor: 'pointer',
              }}>+ Item</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {items.map((it, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 90px 110px 36px', gap: '8px', alignItems: 'center' }}>
                  <AutoSuggestInput
                    field="products"
                    value={it.productName}
                    onChange={(v) => updateItem(idx, { productName: v })}
                    placeholder="Product name"
                  />
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={it.price}
                    onChange={(e) => updateItem(idx, { price: Math.max(0, Number(e.target.value) || 0) })}
                    style={inputStyle}
                    placeholder="Price"
                  />
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={it.quantity}
                    onChange={(e) => updateItem(idx, { quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                    style={inputStyle}
                    placeholder="Qty"
                  />
                  <div style={{ fontSize: '13px', textAlign: 'right', color: '#0f172a', fontWeight: 600 }}>
                    {formatPHP(it.price * it.quantity)}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    disabled={items.length === 1}
                    title="Remove"
                    style={{
                      fontSize: '14px',
                      padding: '6px 0',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      background: '#fff',
                      color: items.length === 1 ? '#cbd5e1' : '#dc2626',
                      cursor: items.length === 1 ? 'not-allowed' : 'pointer',
                    }}
                  >×</button>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '24px',
            padding: '10px 0',
            borderTop: '1px dashed #e2e8f0',
            fontSize: '13px',
            color: '#475569',
          }}>
            <span>Subtotal: <strong style={{ color: '#0f172a' }}>{formatPHP(subtotal)}</strong></span>
            <span>Delivery: <strong style={{ color: '#0f172a' }}>{formatPHP(delivery)}</strong></span>
            <span style={{ fontSize: '15px' }}>Total: <strong style={{ color: '#0f172a' }}>{formatPHP(total)}</strong></span>
          </div>
        </div>

        <div style={{
          padding: '12px 18px',
          borderTop: '1px solid #e2e8f0',
          background: '#f8fafc',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '8px',
        }}>
          <button type="button" onClick={onCancel} disabled={submitting} style={{
            fontSize: '13px',
            fontWeight: 600,
            padding: '8px 14px',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            background: '#fff',
            color: '#475569',
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}>Cancel</button>
          <button type="button" onClick={submit} disabled={!valid || submitting} style={{
            fontSize: '13px',
            fontWeight: 600,
            padding: '8px 16px',
            border: 'none',
            borderRadius: '8px',
            background: !valid || submitting ? '#94a3b8' : '#1d4ed8',
            color: '#fff',
            cursor: !valid || submitting ? 'not-allowed' : 'pointer',
          }}>{submitting ? 'Saving…' : 'Save Order'}</button>
        </div>
      </div>
    </div>
  )
}

function FieldShell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </span>
      {children}
    </label>
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
