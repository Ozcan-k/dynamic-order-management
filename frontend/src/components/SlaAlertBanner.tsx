import { useEffect } from 'react'
import { UserRole } from '@dom/shared'
import { useAuthStore } from '../stores/authStore'
import { useNotificationStore } from '../stores/notificationStore'
import { getSocket } from '../lib/socket'

const ALLOWED_ROLES = [UserRole.ADMIN, UserRole.INBOUND_ADMIN]

export default function SlaAlertBanner() {
  const user = useAuthStore((s) => s.user)
  const { d4Alerts, addD4Alert, dismissD4Alert } = useNotificationStore()

  useEffect(() => {
    if (!user || !ALLOWED_ROLES.includes(user.role)) return

    const socket = getSocket()
    if (!socket) return

    const handler = (payload: { orderId: string; trackingNumber: string; tenantId: string }) => {
      addD4Alert(payload)
    }

    socket.on('sla:d4_alert', handler)
    return () => {
      socket.off('sla:d4_alert', handler)
    }
  }, [user, addD4Alert])

  if (!user || !ALLOWED_ROLES.includes(user.role) || d4Alerts.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {d4Alerts.map((alert) => (
        <div
          key={alert.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '10px 16px',
            background: '#dc2626',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          <span>
            <strong>D4 ALERT</strong> — Order{' '}
            <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
              {alert.trackingNumber}
            </span>{' '}
            has exceeded 16 hours. Immediate action required.
          </span>
          <button
            onClick={() => dismissD4Alert(alert.id)}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              padding: '2px 10px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  )
}
