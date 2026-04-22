import { useEffect, useState } from 'react'
import { SaleChannel, SALE_CHANNEL_LABELS, SALES_STORES, type SalesStore } from '@dom/shared'
import type { CreateDirectOrderPayload, DirectOrder, DirectOrderItem } from '../../api/sales'
import AutoSuggestInput from './AutoSuggestInput'

export type DirectOrderSubmitPayload = CreateDirectOrderPayload

interface DirectOrderFormModalProps {
  mode: 'create' | 'edit'
  /** When true, the date + store fields are readonly — used from the daily entry
   *  screen where both are fixed by the entry context. */
  lockDateStore: boolean
  /** Default or locked date (YYYY-MM-DD). Required when creating. */
  date: string
  /** Default or locked store. Required when creating. */
  store: SalesStore
  /** When editing, the order to prefill. Ignored in create mode. */
  initialOrder?: DirectOrder
  submitting: boolean
  onSubmit: (payload: DirectOrderSubmitPayload) => void
  onCancel: () => void
}

export default function DirectOrderFormModal({
  mode,
  lockDateStore,
  date,
  store,
  initialOrder,
  submitting,
  onSubmit,
  onCancel,
}: DirectOrderFormModalProps) {
  const isEdit = mode === 'edit'

  const [formDate, setFormDate] = useState<string>(initialOrder?.date ?? date)
  const [formStore, setFormStore] = useState<SalesStore>(
    (initialOrder?.store as SalesStore) ?? store,
  )
  const [channel, setChannel] = useState<SaleChannel>(
    initialOrder?.saleChannel ?? SaleChannel.FACEBOOK,
  )
  const [company, setCompany] = useState<string>(initialOrder?.companyName ?? '')
  const [customer, setCustomer] = useState<string>(initialOrder?.customerName ?? '')
  const [delivery, setDelivery] = useState<number>(initialOrder?.deliveryCost ?? 0)
  const [items, setItems] = useState<DirectOrderItem[]>(
    initialOrder
      ? initialOrder.items.map((it) => ({
          productName: it.productName,
          price: it.price,
          quantity: it.quantity,
        }))
      : [{ productName: '', price: 0, quantity: 1 }],
  )

  // Esc closes + scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onCancel, submitting])

  const subtotal = items.reduce((acc, it) => acc + it.price * it.quantity, 0)
  const total = subtotal + delivery

  const valid =
    formDate.length === 10 &&
    !!formStore &&
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
      date: formDate,
      store: formStore,
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
      onClick={() => { if (!submitting) onCancel() }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15,23,42,0.45)',
        zIndex: 300,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '40px 16px', overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', width: '100%', maxWidth: '760px',
          borderRadius: '14px',
          boxShadow: '0 20px 50px rgba(15,23,42,0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <strong style={{ fontSize: '15px', color: '#0f172a' }}>
            {isEdit ? 'Edit Direct Order' : 'Add Direct Order'}
          </strong>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            {lockDateStore ? `${formStore} · ${formDate}` : isEdit ? `#${initialOrder?.id.slice(0, 8)}` : ''}
          </span>
        </div>

        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Date + store (conditional on lock) */}
          {!lockDateStore && (
            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '12px' }}>
              <FieldShell label="Date">
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  style={inputStyle}
                />
              </FieldShell>
              <FieldShell label="Store">
                <select
                  value={formStore}
                  onChange={(e) => setFormStore(e.target.value as SalesStore)}
                  style={inputStyle}
                >
                  {SALES_STORES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </FieldShell>
            </div>
          )}

          {/* Channel + company + customer + delivery */}
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
                fontSize: '12px', fontWeight: 600,
                padding: '4px 10px', border: '1px solid #cbd5e1', borderRadius: '6px',
                background: '#fff', color: '#1d4ed8', cursor: 'pointer',
              }}>+ Item</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 110px 90px 110px 36px',
                gap: '8px',
                fontSize: '10px', fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.04em',
                color: '#94a3b8', paddingLeft: '2px',
              }}>
                <span>Product</span>
                <span>Price (PHP)</span>
                <span>Qty</span>
                <span style={{ textAlign: 'right' }}>Subtotal</span>
                <span />
              </div>
              {items.map((it, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 90px 110px 36px', gap: '8px', alignItems: 'center' }}>
                  <AutoSuggestInput
                    field="products"
                    value={it.productName}
                    onChange={(v) => updateItem(idx, { productName: v })}
                    placeholder="Product name"
                  />
                  <input
                    type="number" min={0} step={0.01}
                    value={it.price}
                    onChange={(e) => updateItem(idx, { price: Math.max(0, Number(e.target.value) || 0) })}
                    style={inputStyle}
                    placeholder="Price"
                  />
                  <input
                    type="number" min={1} step={1}
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
                      fontSize: '14px', padding: '6px 0',
                      border: '1px solid #e2e8f0', borderRadius: '6px',
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
            display: 'flex', justifyContent: 'flex-end', gap: '24px',
            padding: '10px 0', borderTop: '1px dashed #e2e8f0',
            fontSize: '13px', color: '#475569',
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
          display: 'flex', justifyContent: 'flex-end', gap: '8px',
        }}>
          <button type="button" onClick={onCancel} disabled={submitting} style={{
            fontSize: '13px', fontWeight: 600,
            padding: '8px 14px', border: '1px solid #cbd5e1', borderRadius: '8px',
            background: '#fff', color: '#475569',
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}>Cancel</button>
          <button type="button" onClick={submit} disabled={!valid || submitting} style={{
            fontSize: '13px', fontWeight: 600,
            padding: '8px 16px', border: 'none', borderRadius: '8px',
            background: !valid || submitting ? '#94a3b8' : '#1d4ed8',
            color: '#fff',
            cursor: !valid || submitting ? 'not-allowed' : 'pointer',
          }}>
            {submitting ? (isEdit ? 'Saving…' : 'Saving…') : isEdit ? 'Save Changes' : 'Save Order'}
          </button>
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
