import { useState } from 'react'
import DelayBadge from './DelayBadge'
import ConfirmDialog from './ConfirmDialog'
import Avatar from './shared/Avatar'
import PlatformBadge from './shared/PlatformBadge'

interface Order {
  id: string
  trackingNumber: string
  platform: string
  carrierName?: string | null
  shopName?: string | null
  delayLevel: number
  createdAt: string
  scannedBy: { username: string }
}

interface OrderTableProps {
  orders: Order[]
  canDelete: boolean
  onDelete: (id: string) => void
}

export default function OrderTable({ orders, canDelete, onDelete }: OrderTableProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const confirmOrder = orders.find(o => o.id === confirmId)

  if (orders.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📦</div>
        <p className="empty-state-title">No orders yet</p>
        <p className="empty-state-desc">Start scanning to add inbound orders.</p>
      </div>
    )
  }

  return (
    <>
      {confirmId && confirmOrder && (
        <ConfirmDialog
          message={`Are you sure you want to delete order "${confirmOrder.trackingNumber}"? This action cannot be undone.`}
          onConfirm={() => { onDelete(confirmId); setConfirmId(null) }}
          onCancel={() => setConfirmId(null)}
        />
      )}

      <div className="data-table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Tracking Number</th>
              <th>Platform</th>
              <th>Carrier</th>
              <th>Shop</th>
              <th>Delay</th>
              <th>Scanned At</th>
              <th>Scanned By</th>
              {canDelete && <th style={{ textAlign: 'center' }}>Action</th>}
            </tr>
          </thead>
          <tbody>
            {orders.map((order, i) => {
              const delayClass =
                order.delayLevel === 4 ? 'row-d4' :
                order.delayLevel === 3 ? 'row-d3' :
                order.delayLevel === 2 ? 'row-d2' : ''

              return (
                <tr key={order.id} className={delayClass}>
                  <td style={{ color: '#9ca3af', width: 40 }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600, letterSpacing: '0.03em' }}>
                    {order.trackingNumber}
                  </td>
                  <td><PlatformBadge platform={order.platform} /></td>
                  <td>
                    {order.carrierName ? (
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: '9999px',
                        fontSize: '11px', fontWeight: 600,
                        background: '#f1f5f9', color: '#374151',
                        border: '1px solid #e2e8f0', whiteSpace: 'nowrap',
                      }}>
                        {order.carrierName.replace(/_/g, ' ')}
                      </span>
                    ) : (
                      <span style={{ color: '#d1d5db' }}>—</span>
                    )}
                  </td>
                  <td style={{ fontSize: '13px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {order.shopName ?? <span style={{ color: '#d1d5db' }}>—</span>}
                  </td>
                  <td><DelayBadge level={order.delayLevel} /></td>
                  <td style={{ color: '#6b7280', whiteSpace: 'nowrap' }}>
                    {new Date(order.createdAt).toLocaleString('en-GB', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#374151', fontWeight: 500 }}>
                      <Avatar username={order.scannedBy.username} size={24} />
                      {order.scannedBy.username}
                    </span>
                  </td>
                  {canDelete && (
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => setConfirmId(order.id)}
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
