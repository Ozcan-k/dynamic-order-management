import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'
import ScanInput from '../components/ScanInput'
import PlatformBadge from '../components/shared/PlatformBadge'
import DelayBadge from '../components/DelayBadge'

interface PickerOrder {
  assignmentId: string
  assignedAt: string
  id: string
  trackingNumber: string
  platform: string
  status: 'PICKER_ASSIGNED' | 'PICKING'
  delayLevel: number
  priority: number
  createdAt: string
}

export default function PickerMobile() {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const queryClient = useQueryClient()

  const [pendingOrder, setPendingOrder] = useState<PickerOrder | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Clear error toast after 4s
  useEffect(() => {
    if (!errorMsg) return
    const t = setTimeout(() => setErrorMsg(null), 4000)
    return () => clearTimeout(t)
  }, [errorMsg])

  // Clear success toast after 3s
  useEffect(() => {
    if (!successMsg) return
    const t = setTimeout(() => setSuccessMsg(null), 3000)
    return () => clearTimeout(t)
  }, [successMsg])

  // ── Orders ──────────────────────────────────────────────────────────────────
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['picker-orders'],
    queryFn: async () => {
      const res = await api.get<{ orders: PickerOrder[] }>('/picker/orders')
      return res.data.orders
    },
    enabled: true,
    refetchInterval: 15_000,
  })

  // ── Complete mutation ────────────────────────────────────────────────────────
  const completeMutation = useMutation({
    mutationFn: (trackingNumber: string) =>
      api.post('/picker/complete', { trackingNumber }),
    onSuccess: (_, trackingNumber) => {
      queryClient.invalidateQueries({ queryKey: ['picker-orders'] })
      setPendingOrder(null)
      setSuccessMsg(`Completed: ${trackingNumber}`)
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      setPendingOrder(null)
      setErrorMsg(err?.response?.data?.error ?? 'Complete failed. Try again.')
    },
  })

  function handleScan(raw: string) {
    setErrorMsg(null)
    const normalized = raw.trim().toUpperCase()
    const match = orders.find((o) => o.trackingNumber.toUpperCase() === normalized)
    if (!match) {
      setErrorMsg(`"${raw}" not found in your assigned orders`)
      return
    }
    setPendingOrder(match)
  }

  async function handleLogout() {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
    setUser(null)
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // ── Order List Screen ────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      {/* Header */}
      <div style={{
        background: '#1e293b',
        padding: '14px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 10,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: 36, height: 36, borderRadius: '10px',
            background: 'linear-gradient(135deg, #2563eb, #4f46e5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <polyline points="16 11 18 13 22 9" />
            </svg>
          </div>
          <div>
            <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '15px', lineHeight: 1.2 }}>
              {user.username}
            </div>
            <div style={{ color: '#64748b', fontSize: '12px', marginTop: '1px' }}>
              {isLoading ? 'Loading...' : `${orders.length} order${orders.length !== 1 ? 's' : ''} assigned`}
            </div>
          </div>
        </div>
        <button onClick={handleLogout} style={{
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '8px', color: '#94a3b8', fontSize: '13px', fontWeight: 600,
          padding: '8px 14px', cursor: 'pointer', minHeight: '44px',
          transition: 'background 0.15s, color 0.15s',
        }}>
          Sign Out
        </button>
      </div>

      <div style={{ padding: '16px', maxWidth: '600px', margin: '0 auto' }}>
        {/* Success toast */}
        {successMsg && (
          <div style={{
            background: '#d1fae5', color: '#065f46',
            border: '1px solid #a7f3d0',
            borderRadius: '10px', padding: '12px 16px', marginBottom: '12px',
            fontWeight: 600, fontSize: '14px',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {successMsg}
          </div>
        )}

        {/* Error toast */}
        {errorMsg && (
          <div style={{
            background: '#fee2e2', color: '#991b1b',
            border: '1px solid #fecaca',
            borderRadius: '10px', padding: '12px 16px', marginBottom: '12px',
            fontWeight: 600, fontSize: '14px',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {errorMsg}
          </div>
        )}

        {/* Scan input */}
        <ScanInput
          onScan={handleScan}
          disabled={completeMutation.isPending}
          buttonLabel="Scan Order"
        />

        {/* Order list */}
        {isLoading ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
            padding: '48px 20px', background: '#fff', borderRadius: '14px',
            border: '1px solid #e2e8f0',
          }}>
            <div style={{
              width: 28, height: 28, border: '3px solid #e2e8f0', borderTopColor: '#3b82f6',
              borderRadius: '50%', animation: 'spin 0.7s linear infinite',
            }} />
            <span style={{ color: '#64748b', fontSize: '14px' }}>Loading orders...</span>
          </div>
        ) : orders.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '48px 24px',
            background: '#fff', borderRadius: '14px',
            border: '2px dashed #e2e8f0',
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%', background: '#f1f5f9',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 14px',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              </svg>
            </div>
            <div style={{ fontWeight: 600, color: '#374151', fontSize: '15px', marginBottom: '4px' }}>No orders assigned</div>
            <div style={{ fontSize: '13px', color: '#9ca3af' }}>Check back soon</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {orders.map((order) => {
              const borderColor =
                order.delayLevel >= 3 ? '#ef4444' :
                order.delayLevel >= 1 ? '#f59e0b' : '#3b82f6'
              return (
                <div key={order.assignmentId} style={{
                  background: '#fff', borderRadius: '14px', padding: '16px 18px',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
                  borderLeft: `4px solid ${borderColor}`,
                  transition: 'box-shadow 0.15s',
                }}>
                  <div style={{
                    fontFamily: 'monospace', fontWeight: 700, fontSize: '15px',
                    color: '#0f172a', marginBottom: '10px', wordBreak: 'break-all',
                    letterSpacing: '0.02em',
                  }}>
                    {order.trackingNumber}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <PlatformBadge platform={order.platform} />
                    <DelayBadge level={order.delayLevel} />
                    <span style={{ fontSize: '12px', color: '#64748b', marginLeft: 'auto' }}>
                      {formatTime(order.assignedAt)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Confirm Dialog — slides up from bottom on mobile */}
      {pendingOrder && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          zIndex: 100, padding: '0',
        }}>
          <div style={{
            background: '#fff', borderRadius: '24px 24px 0 0', padding: '28px 24px 36px',
            width: '100%', maxWidth: '480px',
          }}>
            {/* Drag handle */}
            <div style={{
              width: 40, height: 4, borderRadius: '9999px', background: '#e2e8f0',
              margin: '0 auto 24px',
            }} />
            <h2 style={{ margin: '0 0 12px', fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
              Complete this order?
            </h2>
            <div style={{
              fontFamily: 'monospace', fontSize: '14px', fontWeight: 700,
              color: '#1e40af', background: '#eff6ff', borderRadius: '10px',
              padding: '12px 16px', marginBottom: '14px', wordBreak: 'break-all',
              border: '1px solid #bfdbfe',
            }}>
              {pendingOrder.trackingNumber}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
              <PlatformBadge platform={pendingOrder.platform} />
              <DelayBadge level={pendingOrder.delayLevel} />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setPendingOrder(null)}
                disabled={completeMutation.isPending}
                style={{
                  flex: 1, padding: '16px', border: '2px solid #e2e8f0',
                  borderRadius: '14px', background: '#fff', cursor: 'pointer',
                  fontSize: '16px', fontWeight: 600, color: '#475569',
                  minHeight: '56px',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => completeMutation.mutate(pendingOrder.trackingNumber)}
                disabled={completeMutation.isPending}
                style={{
                  flex: 2, padding: '16px', border: 'none',
                  borderRadius: '14px',
                  background: completeMutation.isPending ? '#86efac' : '#22c55e',
                  cursor: completeMutation.isPending ? 'not-allowed' : 'pointer',
                  fontSize: '16px', fontWeight: 700, color: '#fff',
                  transition: 'background 0.15s',
                  minHeight: '56px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}
              >
                {completeMutation.isPending ? (
                  <>
                    <div style={{
                      width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)',
                      borderTopColor: '#fff', borderRadius: '50%',
                      animation: 'spin 0.7s linear infinite',
                    }} />
                    Completing...
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Confirm Complete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
