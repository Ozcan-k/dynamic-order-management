import { useEffect, useState } from 'react'
import { UserRole } from '@dom/shared'
import { useAuthStore } from '../stores/authStore'
import { useNotificationStore } from '../stores/notificationStore'
import { connectSocket } from '../lib/socket'

const ALLOWED_ROLES = [UserRole.ADMIN, UserRole.INBOUND_ADMIN]

const STATUS_LABELS: Record<string, string> = {
  INBOUND: 'Inbound',
  PICKER_ASSIGNED: 'Picker Assigned',
  PICKING: 'Picking',
  PICKER_COMPLETE: 'Picker Complete',
  PACKER_ASSIGNED: 'Packer Assigned',
  PACKING: 'Packing',
  PACKER_COMPLETE: 'Packer Complete',
  OUTBOUND: 'Outbound',
}

function formatStatus(status: string) {
  return STATUS_LABELS[status] ?? status
}

function formatAssignment(picker: string | null, packer: string | null): string | null {
  if (picker && packer) return `Picker: ${picker} · Packer: ${packer}`
  if (picker) return `Picker: ${picker}`
  if (packer) return `Packer: ${packer}`
  return null
}

export default function SlaAlertBanner() {
  const user = useAuthStore((s) => s.user)
  const { d4Alerts, addD4Alert, dismissD4Alert } = useNotificationStore()

  useEffect(() => {
    if (!user || !ALLOWED_ROLES.includes(user.role)) return

    // connectSocket() is idempotent — returns existing socket if already connected.
    // Must NOT use getSocket() here: child effects run before parent (AppLayout)
    // effects, so the socket hasn't been created yet on first mount.
    const socket = connectSocket()

    const handler = (payload: { orderId: string; trackingNumber: string; tenantId: string; status: string; assignedPicker: string | null; assignedPacker: string | null }) => {
      addD4Alert(payload)
    }

    socket.on('sla:d4_alert', handler)
    return () => {
      socket.off('sla:d4_alert', handler)
    }
  }, [user, addD4Alert])

  const { dismissAllD4Alerts } = useNotificationStore()
  const [expanded, setExpanded] = useState(false)

  if (!user || !ALLOWED_ROLES.includes(user.role) || d4Alerts.length === 0) return null

  const count = d4Alerts.length

  const btnStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.2)',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    padding: '2px 10px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  }

  // Single alert — show full detail, no expand needed
  if (count === 1) {
    const alert = d4Alerts[0]
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px 16px', background: '#dc2626', color: '#fff', fontSize: '13px', fontWeight: 500 }}>
        <span>
          <strong>D4 ALERT</strong> — Order{' '}
          <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{alert.trackingNumber}</span>
          {' '}has exceeded 16 hours.{' '}
          <span style={{ opacity: 0.85 }}>Stage: <strong>{formatStatus(alert.status)}</strong></span>
          {formatAssignment(alert.assignedPicker, alert.assignedPacker) && (
            <span style={{ opacity: 0.85 }}>{' '}· {formatAssignment(alert.assignedPicker, alert.assignedPacker)}</span>
          )}
        </span>
        <button onClick={() => dismissD4Alert(alert.id)} style={btnStyle}>Dismiss</button>
      </div>
    )
  }

  // Multiple alerts — summary bar + expandable list
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Summary row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px 16px', background: '#dc2626', color: '#fff', fontSize: '13px', fontWeight: 500 }}>
        <span>
          <strong>D4 ALERT</strong> — {count} orders have exceeded 16 hours. Immediate action required.
        </span>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button onClick={() => setExpanded((v) => !v)} style={btnStyle}>
            {expanded ? 'Hide ▲' : 'Show ▼'}
          </button>
          <button onClick={() => { dismissAllD4Alerts(); setExpanded(false) }} style={btnStyle}>
            Dismiss All
          </button>
        </div>
      </div>

      {/* Expanded list */}
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: '#b91c1c' }}>
          {d4Alerts.map((alert) => (
            <div key={alert.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '8px 16px 8px 28px', background: '#dc2626', color: '#fff', fontSize: '12px' }}>
              <span>
                Order{' '}
                <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{alert.trackingNumber}</span>
                {' '}— exceeded 16 hours —{' '}
                <span style={{ opacity: 0.85 }}>Stage: <strong>{formatStatus(alert.status)}</strong></span>
                {formatAssignment(alert.assignedPicker, alert.assignedPacker) && (
                  <span style={{ opacity: 0.85 }}>{' '}· {formatAssignment(alert.assignedPicker, alert.assignedPacker)}</span>
                )}
              </span>
              <button onClick={() => dismissD4Alert(alert.id)} style={{ ...btnStyle, fontSize: '11px', padding: '1px 8px' }}>
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
