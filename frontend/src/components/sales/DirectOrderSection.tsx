import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SALE_CHANNEL_LABELS, SalesStore } from '@dom/shared'
import {
  createDirectOrder,
  deleteDirectOrder,
  fetchOwnDirectOrders,
  updateDirectOrder,
  type DirectOrder,
} from '../../api/sales'
import DirectOrderFormModal from './DirectOrderFormModal'

interface DirectOrderSectionProps {
  date: string
  store: SalesStore
}

type ModalState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; order: DirectOrder }

export default function DirectOrderSection({ date, store }: DirectOrderSectionProps) {
  const queryClient = useQueryClient()
  const queryKey = ['sales-orders', date, store] as const

  const { data: orders = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchOwnDirectOrders({ date, store }),
    staleTime: 5_000,
  })

  const [modal, setModal] = useState<ModalState>({ kind: 'closed' })

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey })
    queryClient.invalidateQueries({ queryKey: ['sales-calendar'] })
    queryClient.invalidateQueries({ queryKey: ['sales-day-detail'] })
    queryClient.invalidateQueries({ queryKey: ['sales-own-orders'] })
  }

  const createMutation = useMutation({
    mutationFn: createDirectOrder,
    onSuccess: () => { invalidateAll(); setModal({ kind: 'closed' }) },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof updateDirectOrder>[1] }) =>
      updateDirectOrder(id, payload),
    onSuccess: () => { invalidateAll(); setModal({ kind: 'closed' }) },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteDirectOrder,
    onSuccess: () => invalidateAll(),
  })

  const totalAmount = useMemo(
    () => orders.reduce((acc, o) => acc + o.totalAmount, 0),
    [orders],
  )

  function handleDelete(order: DirectOrder) {
    if (deleteMutation.isPending) return
    const ok = window.confirm(
      `Delete this order?\n\n${order.companyName} · ${order.customerName}\n${formatPHP(order.totalAmount)}`,
    )
    if (!ok) return
    deleteMutation.mutate(order.id)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ fontSize: '12px', color: '#64748b' }}>
          {orders.length} order{orders.length === 1 ? '' : 's'} · Total <strong style={{ color: '#0f172a' }}>{formatPHP(totalAmount)}</strong>
        </div>
        <button
          type="button"
          onClick={() => setModal({ kind: 'create' })}
          style={{
            fontSize: '13px', fontWeight: 600,
            padding: '8px 14px', border: 'none', borderRadius: '8px',
            background: '#1d4ed8', color: '#fff', cursor: 'pointer',
          }}
        >
          + Add Order
        </button>
      </div>

      {isLoading ? (
        <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Loading…</div>
      ) : orders.length === 0 ? (
        <div style={{
          padding: '24px', textAlign: 'center',
          background: '#fff', border: '1px dashed #cbd5e1',
          borderRadius: '10px',
          color: '#64748b', fontSize: '13px',
        }}>
          No direct orders for this day yet. Click <strong style={{ color: '#0f172a' }}>+ Add Order</strong> to record one.
        </div>
      ) : (
        <OrdersTable
          orders={orders}
          onEdit={(o) => setModal({ kind: 'edit', order: o })}
          onDelete={handleDelete}
          deletingId={deleteMutation.isPending ? deleteMutation.variables ?? null : null}
        />
      )}

      {modal.kind === 'create' && (
        <DirectOrderFormModal
          mode="create"
          lockDateStore
          date={date}
          store={store}
          submitting={createMutation.isPending}
          onSubmit={(payload) => createMutation.mutate(payload)}
          onCancel={() => setModal({ kind: 'closed' })}
        />
      )}
      {modal.kind === 'edit' && (
        <DirectOrderFormModal
          mode="edit"
          lockDateStore
          date={date}
          store={store}
          initialOrder={modal.order}
          submitting={updateMutation.isPending}
          onSubmit={(payload) => updateMutation.mutate({ id: modal.order.id, payload })}
          onCancel={() => setModal({ kind: 'closed' })}
        />
      )}
    </div>
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
            <Th align="right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <Td>
                <span style={{
                  display: 'inline-block', padding: '2px 8px',
                  fontSize: '11px', fontWeight: 600, borderRadius: '9999px',
                  background: '#eff6ff', color: '#1d4ed8',
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
                    style={iconBtnStyle('#1d4ed8')}
                  >Edit</button>
                  <button
                    type="button"
                    onClick={() => onDelete(o)}
                    disabled={deletingId === o.id}
                    title="Delete order"
                    style={iconBtnStyle('#dc2626', deletingId === o.id)}
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

function Th({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th style={{
      textAlign: align ?? 'left',
      padding: '10px 12px',
      fontSize: '11px', fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.04em',
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

function iconBtnStyle(color: string, disabled = false): React.CSSProperties {
  return {
    fontSize: '12px', fontWeight: 600,
    padding: '4px 10px',
    border: `1px solid ${color}`, borderRadius: '6px',
    background: '#fff', color,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  }
}

function formatPHP(n: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n)
}
