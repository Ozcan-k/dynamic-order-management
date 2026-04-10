import { useState } from 'react'
import DelayBadge from './DelayBadge'
import ConfirmDialog from './ConfirmDialog'

interface Order {
  id: string
  trackingNumber: string
  platform: string
  delayLevel: number
  createdAt: string
  scannedBy: { username: string }
}

interface OrderTableProps {
  orders: Order[]
  canDelete: boolean
  onDelete: (id: string) => void
}

const PLATFORM_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  SHOPEE:  { bg: '#fff4ed', text: '#c2410c', dot: '#f97316' },
  LAZADA:  { bg: '#eff6ff', text: '#1d4ed8', dot: '#3b82f6' },
  TIKTOK:  { bg: '#fdf4ff', text: '#7e22ce', dot: '#a855f7' },
  OTHER:   { bg: '#f9fafb', text: '#374151', dot: '#9ca3af' },
}

const ROW_TINT: Record<number, string> = {
  0: '#ffffff', 1: '#ffffff',
  2: '#fffbeb', 3: '#fef2f2', 4: '#fef2f2',
}

function PlatformBadge({ platform }: { platform: string }) {
  const c = PLATFORM_COLORS[platform] ?? PLATFORM_COLORS.OTHER
  const label = platform.charAt(0) + platform.slice(1).toLowerCase()
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      backgroundColor: c.bg, color: c.text,
      padding: '3px 10px', borderRadius: '9999px', fontSize: '12px', fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: c.dot, display: 'inline-block', flexShrink: 0 }} />
      {label}
    </span>
  )
}

export default function OrderTable({ orders, canDelete, onDelete }: OrderTableProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const confirmOrder = orders.find(o => o.id === confirmId)

  if (orders.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '60px 20px',
        background: '#f9fafb', borderRadius: '12px',
        border: '2px dashed #e5e7eb',
      }}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>📦</div>
        <p style={{ color: '#9ca3af', fontSize: '15px', margin: 0 }}>No orders yet. Start scanning.</p>
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

      <div className="order-table-wrap">
        <table>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
              <th style={th}>#</th>
              <th style={th}>Tracking Number</th>
              <th style={th}>Platform</th>
              <th style={th}>Delay</th>
              <th style={th}>Scanned At</th>
              <th style={th}>Scanned By</th>
              {canDelete && <th style={{ ...th, textAlign: 'center' }}>Action</th>}
            </tr>
          </thead>
          <tbody>
            {orders.map((order, i) => (
              <tr key={order.id} style={{
                backgroundColor: ROW_TINT[order.delayLevel] ?? '#fff',
                borderBottom: '1px solid #f1f5f9',
              }}>
                <td style={{ ...td, color: '#9ca3af', width: 40 }}>{i + 1}</td>
                <td style={{ ...td, fontFamily: 'monospace', fontWeight: 600, letterSpacing: '0.03em' }}>
                  {order.trackingNumber}
                </td>
                <td style={td}><PlatformBadge platform={order.platform} /></td>
                <td style={td}><DelayBadge level={order.delayLevel} /></td>
                <td style={{ ...td, color: '#6b7280', whiteSpace: 'nowrap' }}>
                  {new Date(order.createdAt).toLocaleString('en-GB', {
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </td>
                <td style={td}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#374151', fontWeight: 500 }}>
                    <span style={{
                      width: 24, height: 24, borderRadius: '50%', background: '#e0e7ff',
                      color: '#4f46e5', fontSize: '10px', fontWeight: 700,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {order.scannedBy.username.charAt(0).toUpperCase()}
                    </span>
                    {order.scannedBy.username}
                  </span>
                </td>
                {canDelete && (
                  <td style={{ ...td, textAlign: 'center' }}>
                    <button
                      onClick={() => setConfirmId(order.id)}
                      style={{
                        padding: '4px 12px', border: '1px solid #fca5a5',
                        borderRadius: '6px', cursor: 'pointer',
                        background: '#fff', color: '#ef4444',
                        fontSize: '12px', fontWeight: 600,
                        transition: 'all 0.15s', whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={e => {
                        (e.target as HTMLButtonElement).style.background = '#ef4444';
                        (e.target as HTMLButtonElement).style.color = '#fff'
                      }}
                      onMouseLeave={e => {
                        (e.target as HTMLButtonElement).style.background = '#fff';
                        (e.target as HTMLButtonElement).style.color = '#ef4444'
                      }}
                    >
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

const th: React.CSSProperties = {
  padding: '11px 14px', textAlign: 'left',
  fontWeight: 600, fontSize: '11px',
  color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
}

const td: React.CSSProperties = {
  padding: '12px 14px', color: '#111827',
}
