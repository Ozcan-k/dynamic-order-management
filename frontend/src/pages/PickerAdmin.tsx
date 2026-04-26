import { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'
import { connectSocket } from '../lib/socket'
import { colors } from '../theme'
import { getManilaDateString } from '../lib/manila'
import DelayBadge from '../components/DelayBadge'
import ScanInput from '../components/ScanInput'
import PageShell from '../components/shared/PageShell'
import StatCard from '../components/shared/StatCard'
import Avatar from '../components/shared/Avatar'
import PlatformBadge from '../components/shared/PlatformBadge'
import SectionHeader from '../components/shared/SectionHeader'
import SortableTh from '../components/shared/SortableTh'
import SlaHistoryModal from '../components/SlaHistoryModal'

type PickerSortKey = 'tracking' | 'platform' | 'carrier' | 'shop' | 'delay' | 'scannedAt' | 'scannedBy'

interface Order {
  id: string
  trackingNumber: string
  platform: string
  carrierName?: string | null
  shopName?: string | null
  delayLevel: number
  priority: number
  workDate: string
  createdAt: string
  scannedBy: { username: string }
}

interface Picker {
  id: string
  username: string
}

interface PickerStat {
  picker: { id: string; username: string }
  statusCounts: {
    PICKER_ASSIGNED: number
    PICKING: number
    PICKER_COMPLETE: number
  }
  total: number
  completed: number
  completedToday: number
  returned: number
}

// ─── Picker orders modal ─────────────────────────────────────────────────────
interface PickerOrderRow {
  id: string
  assignmentId: string
  trackingNumber: string
  platform: string
  carrierName?: string | null
  shopName?: string | null
  status: string
  delayLevel: number
  priority: number
  createdAt: string
  assignedAt: string
}

function PickerOrdersModal({
  picker,
  onClose,
  onComplete,
}: {
  picker: { id: string; username: string }
  onClose: () => void
  onComplete: () => void
}) {
  const queryClient = useQueryClient()
  const [removeTarget, setRemoveTarget] = useState<{ id: string; tracking: string } | null>(null)
  const [completeTarget, setCompleteTarget] = useState<{ id: string; tracking: string } | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<'remove' | 'complete' | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [slaOrderId, setSlaOrderId] = useState<{ id: string; tracking: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['picker-orders', picker.id],
    queryFn: async () => {
      const res = await api.get<{ orders: PickerOrderRow[] }>(`/picker-admin/picker/${picker.id}/orders`)
      return res.data.orders
    },
    refetchInterval: 10_000,
  })

  const completeMutation = useMutation({
    mutationFn: ({ orderId }: { orderId: string }) =>
      api.post('/picker-admin/complete', { orderId, pickerId: picker.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['picker-orders', picker.id] })
      onComplete()
    },
    onError: (err: any) => setModalError(err?.response?.data?.error ?? 'Complete failed'),
  })

  const unassignMutation = useMutation({
    mutationFn: ({ orderId }: { orderId: string }) =>
      api.post('/picker-admin/unassign', { orderId, pickerId: picker.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['picker-orders', picker.id] })
      queryClient.invalidateQueries({ queryKey: ['picker-admin-orders'] })
      onComplete()
    },
    onError: (err: any) => setModalError(err?.response?.data?.error ?? 'Remove failed'),
  })

  const orders = data ?? []
  // Only non-completed orders are selectable
  const selectableOrders = orders.filter(o => o.status !== 'PICKER_COMPLETE')
  const allSelected = selectableOrders.length > 0 && selectableOrders.every(o => selectedIds.has(o.id))
  const someSelected = selectedIds.size > 0

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(selectableOrders.map(o => o.id)))
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function executeBulkAction(action: 'remove' | 'complete') {
    setBulkBusy(true)
    setModalError(null)
    const orderIds = Array.from(selectedIds)
    try {
      if (action === 'complete') {
        await api.post('/picker-admin/bulk-complete', { orderIds, pickerId: picker.id })
      } else {
        await api.post('/picker-admin/bulk-unassign', { orderIds, pickerId: picker.id })
      }
      setSelectedIds(new Set())
      queryClient.invalidateQueries({ queryKey: ['picker-orders', picker.id] })
      queryClient.invalidateQueries({ queryKey: ['picker-admin-orders'] })
      onComplete()
    } catch (err: any) {
      setModalError(err?.response?.data?.error ?? `Bulk ${action} failed`)
    } finally {
      setBulkBusy(false)
      setBulkAction(null)
    }
  }

  function handleComplete(orderId: string, tracking: string) {
    setCompleteTarget({ id: orderId, tracking })
  }

  function confirmComplete() {
    if (!completeTarget) return
    completeMutation.mutate({ orderId: completeTarget.id })
    setCompleteTarget(null)
  }

  function handleRemove(orderId: string, tracking: string) {
    setRemoveTarget({ id: orderId, tracking })
  }

  function confirmRemove() {
    if (!removeTarget) return
    unassignMutation.mutate({ orderId: removeTarget.id })
    setRemoveTarget(null)
  }

  const isBusy = completeMutation.isPending || unassignMutation.isPending || bulkBusy

  const statusChip = (status: string) => {
    const map: Record<string, { label: string; bg: string; color: string }> = {
      PICKER_ASSIGNED: { label: 'Assigned', bg: '#dbeafe', color: '#1e40af' },
      PICKING:         { label: 'Picking',  bg: '#fef3c7', color: '#92400e' },
      PICKER_COMPLETE: { label: 'Done',     bg: '#d1fae5', color: '#065f46' },
    }
    const s = map[status] ?? { label: status, bg: '#f1f5f9', color: '#64748b' }
    return (
      <span style={{
        display: 'inline-block', padding: '2px 10px', borderRadius: '9999px',
        fontSize: '11px', fontWeight: 600, background: s.bg, color: s.color,
      }}>
        {s.label}
      </span>
    )
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
        animation: 'modalBackdropIn 180ms ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '720px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden',
          maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '18px 24px', borderBottom: `1px solid ${colors.border}`,
        }}>
          <Avatar username={picker.username} size={36} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '15px', color: colors.textPrimary }}>
              {picker.username}
            </div>
            <div style={{ fontSize: '12px', color: colors.textMuted }}>
              {isLoading ? 'Loading...' : `${orders.length} active order${orders.length !== 1 ? 's' : ''}`}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: '8px', border: 'none',
              background: '#f1f5f9', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: colors.textSecondary,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Bulk action bar — visible only when items are selected */}
        {someSelected && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '10px 20px',
            background: '#eff6ff',
            borderBottom: `1px solid #bfdbfe`,
          }}>
            <span style={{
              fontSize: '13px', fontWeight: 600, color: '#1d4ed8', flex: 1,
            }}>
              {selectedIds.size} order{selectedIds.size !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={() => setSelectedIds(new Set())}
              style={{
                padding: '5px 12px', border: `1px solid #93c5fd`,
                borderRadius: '6px', background: '#fff', color: '#3b82f6',
                fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              Deselect All
            </button>
            <button
              onClick={() => setBulkAction('remove')}
              disabled={isBusy}
              style={{
                padding: '5px 14px', border: 'none',
                borderRadius: '6px', background: colors.danger, color: '#fff',
                fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                opacity: isBusy ? 0.6 : 1,
                display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              </svg>
              Remove Selected
            </button>
            <button
              onClick={() => setBulkAction('complete')}
              disabled={isBusy}
              style={{
                padding: '5px 14px', border: 'none',
                borderRadius: '6px', background: colors.success, color: '#fff',
                fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                opacity: isBusy ? 0.6 : 1,
                display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Complete Selected
            </button>
          </div>
        )}

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {modalError && (
            <div className="feedback-banner feedback-banner--error" style={{ margin: '12px 16px 0' }}>
              {modalError}
              <button
                onClick={() => setModalError(null)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700, fontSize: '14px', padding: '0 4px' }}
              >
                ×
              </button>
            </div>
          )}
          {isLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: colors.textMuted, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              <span className="spinner spinner-sm" />
              Loading orders...
            </div>
          ) : orders.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎉</div>
              <div style={{ fontWeight: 600, color: colors.textPrimary, fontSize: '14px' }}>No active orders</div>
              <div style={{ color: colors.textMuted, fontSize: '12px', marginTop: '4px' }}>All orders completed for this picker.</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: `1px solid ${colors.border}` }}>
                  {/* Select All checkbox */}
                  <th style={{ padding: '10px 8px 10px 16px', width: 36 }}>
                    {selectableOrders.length > 0 && (
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        title={allSelected ? 'Deselect all' : 'Select all'}
                        style={{ width: 16, height: 16, cursor: 'pointer', accentColor: colors.primary }}
                      />
                    )}
                  </th>
                  {['Tracking Number', 'Platform', 'Carrier', 'Shop', 'Status', 'Delay', 'Assigned At', ''].map(h => (
                    <th key={h} style={{
                      padding: '10px 16px 10px 8px', textAlign: 'left', fontSize: '11px',
                      fontWeight: 600, color: colors.textSecondary, textTransform: 'uppercase',
                      letterSpacing: '0.05em', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map(order => {
                  const isSelectable = order.status !== 'PICKER_COMPLETE'
                  const isSelected = selectedIds.has(order.id)
                  return (
                    <tr
                      key={order.id}
                      style={{
                        borderBottom: `1px solid #f1f5f9`,
                        background: isSelected ? '#eff6ff' : undefined,
                        transition: 'background 0.1s',
                      }}
                    >
                      {/* Row checkbox */}
                      <td style={{ padding: '11px 8px 11px 16px' }}>
                        {isSelectable && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(order.id)}
                            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: colors.primary }}
                          />
                        )}
                      </td>
                      <td style={{ padding: '11px 16px 11px 8px', fontFamily: 'monospace', fontWeight: 600, fontSize: '12px' }}>
                        {order.trackingNumber}
                      </td>
                      <td style={{ padding: '11px 16px 11px 8px' }}>
                        <PlatformBadge platform={order.platform} />
                      </td>
                      <td style={{ padding: '11px 16px 11px 8px' }}>
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
                      <td style={{ padding: '11px 16px 11px 8px', fontSize: '13px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {order.shopName ?? <span style={{ color: '#d1d5db' }}>—</span>}
                      </td>
                      <td style={{ padding: '11px 16px 11px 8px' }}>
                        {statusChip(order.status)}
                      </td>
                      <td style={{ padding: '11px 16px 11px 8px' }}>
                        <DelayBadge level={order.delayLevel} />
                      </td>
                      <td style={{ padding: '11px 16px 11px 8px', color: colors.textSecondary, fontSize: '12px', whiteSpace: 'nowrap' }}>
                        {new Date(order.assignedAt).toLocaleString('en-GB', {
                          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila',
                        })}
                      </td>
                      <td style={{ padding: '11px 16px 11px 8px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => setSlaOrderId({ id: order.id, tracking: order.trackingNumber })}
                            style={{
                              padding: '4px 10px', border: `1px solid ${colors.border}`,
                              borderRadius: '6px', background: '#fff', color: colors.textSecondary,
                              fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                              transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => {
                              (e.currentTarget as HTMLButtonElement).style.background = colors.surfaceAlt
                              ;(e.currentTarget as HTMLButtonElement).style.color = colors.textPrimary
                            }}
                            onMouseLeave={e => {
                              (e.currentTarget as HTMLButtonElement).style.background = '#fff'
                              ;(e.currentTarget as HTMLButtonElement).style.color = colors.textSecondary
                            }}
                            title="View SLA escalation history"
                          >
                            SLA
                          </button>
                          {isSelectable && (
                            <>
                              <button
                                onClick={() => handleRemove(order.id, order.trackingNumber)}
                                disabled={isBusy}
                                style={{
                                  padding: '4px 12px', border: `1px solid ${colors.dangerBorder}`,
                                  borderRadius: '6px', background: '#fff', color: colors.danger,
                                  fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                                  transition: 'all 0.15s',
                                }}
                                onMouseEnter={e => {
                                  (e.currentTarget as HTMLButtonElement).style.background = colors.danger
                                  ;(e.currentTarget as HTMLButtonElement).style.color = '#fff'
                                }}
                                onMouseLeave={e => {
                                  (e.currentTarget as HTMLButtonElement).style.background = '#fff'
                                  ;(e.currentTarget as HTMLButtonElement).style.color = colors.danger
                                }}
                              >
                                Remove
                              </button>
                              <button
                                onClick={() => handleComplete(order.id, order.trackingNumber)}
                                disabled={isBusy}
                                style={{
                                  padding: '4px 12px', border: `1px solid ${colors.success}`,
                                  borderRadius: '6px', background: '#fff', color: colors.success,
                                  fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                                  transition: 'all 0.15s',
                                }}
                                onMouseEnter={e => {
                                  (e.currentTarget as HTMLButtonElement).style.background = colors.success
                                  ;(e.currentTarget as HTMLButtonElement).style.color = '#fff'
                                }}
                                onMouseLeave={e => {
                                  (e.currentTarget as HTMLButtonElement).style.background = '#fff'
                                  ;(e.currentTarget as HTMLButtonElement).style.color = colors.success
                                }}
                              >
                                Complete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Bulk action confirmation dialog */}
      {bulkAction && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
            zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
            animation: 'modalBackdropIn 180ms ease-out',
          }}
          onClick={() => !bulkBusy && setBulkAction(null)}
        >
          <div
            style={{
              background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '400px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.25)', overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              background: bulkAction === 'complete'
                ? 'linear-gradient(135deg, #f0fdf4, #f7fef9)'
                : 'linear-gradient(135deg, #fef2f2, #fff5f5)',
              padding: '22px 24px 18px',
              borderBottom: `1px solid ${bulkAction === 'complete' ? '#bbf7d0' : colors.dangerBorder}`,
              display: 'flex', alignItems: 'flex-start', gap: '14px',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: '12px',
                background: bulkAction === 'complete' ? '#dcfce7' : '#fee2e2',
                flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {bulkAction === 'complete' ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={colors.danger} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                )}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px', color: colors.textPrimary, marginBottom: '4px' }}>
                  {bulkAction === 'complete' ? 'Complete Selected Orders?' : 'Remove Selected Orders?'}
                </div>
                <div style={{ fontSize: '13px', color: colors.textSecondary, lineHeight: 1.5 }}>
                  {bulkAction === 'complete'
                    ? <>This will mark <strong>{selectedIds.size} order{selectedIds.size !== 1 ? 's' : ''}</strong> as Picker Complete for <strong>{picker.username}</strong>.</>
                    : <>This will unassign <strong>{selectedIds.size} order{selectedIds.size !== 1 ? 's' : ''}</strong> from <strong>{picker.username}</strong> and return them to the inbound queue.</>
                  }
                </div>
              </div>
            </div>
            <div style={{ padding: '16px 24px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setBulkAction(null)}
                disabled={bulkBusy}
                style={{
                  padding: '9px 20px', border: `1px solid ${colors.border}`,
                  borderRadius: '8px', background: '#fff', color: colors.textSecondary,
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => executeBulkAction(bulkAction)}
                disabled={bulkBusy}
                style={{
                  padding: '9px 20px', border: 'none',
                  borderRadius: '8px',
                  background: bulkAction === 'complete' ? '#16a34a' : colors.danger,
                  color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  opacity: bulkBusy ? 0.7 : 1,
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}
              >
                {bulkBusy
                  ? <><span className="spinner spinner-sm" style={{ borderColor: 'rgba(255,255,255,0.4)', borderTopColor: '#fff' }} /> Processing...</>
                  : bulkAction === 'complete' ? `✓ Complete ${selectedIds.size}` : `Remove ${selectedIds.size}`
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete confirmation dialog */}
      {completeTarget && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
            animation: 'modalBackdropIn 180ms ease-out',
          }}
          onClick={() => setCompleteTarget(null)}
        >
          <div
            style={{
              background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '420px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.25)', overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              background: 'linear-gradient(135deg, #f0fdf4, #f7fef9)',
              padding: '24px 24px 20px',
              borderBottom: '1px solid #bbf7d0',
              display: 'flex', alignItems: 'flex-start', gap: '14px',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: '12px',
                background: '#dcfce7', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px', color: colors.textPrimary, marginBottom: '4px' }}>
                  Mark as Complete?
                </div>
                <div style={{ fontSize: '13px', color: colors.textSecondary, lineHeight: 1.5 }}>
                  This will mark the order as <strong>Picker Complete</strong> for <strong>{picker.username}</strong>.
                </div>
              </div>
            </div>
            <div style={{ padding: '16px 24px', background: '#fafafa', borderBottom: `1px solid ${colors.border}` }}>
              <div style={{ fontSize: '11px', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                Order
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                background: '#fff', border: `1px solid ${colors.border}`,
                borderRadius: '8px', padding: '8px 14px',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="3" width="15" height="13" rx="1" /><path d="M16 8h4l3 3v5h-7V8z" />
                  <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
                </svg>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '13px', color: colors.textPrimary }}>
                  {completeTarget.tracking}
                </span>
              </div>
            </div>
            <div style={{ padding: '16px 24px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setCompleteTarget(null)}
                style={{
                  padding: '9px 20px', border: `1px solid ${colors.border}`,
                  borderRadius: '8px', background: '#fff', color: colors.textSecondary,
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmComplete}
                disabled={completeMutation.isPending}
                style={{
                  padding: '9px 20px', border: 'none',
                  borderRadius: '8px', background: '#16a34a', color: '#fff',
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  opacity: completeMutation.isPending ? 0.7 : 1,
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}
              >
                {completeMutation.isPending ? 'Completing...' : '✓ Yes, Complete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove confirmation dialog */}
      {removeTarget && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
            animation: 'modalBackdropIn 180ms ease-out',
          }}
          onClick={() => setRemoveTarget(null)}
        >
          <div
            style={{
              background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '420px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.25)', overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Dialog header */}
            <div style={{
              background: 'linear-gradient(135deg, #fef2f2, #fff5f5)',
              padding: '24px 24px 20px',
              borderBottom: `1px solid ${colors.dangerBorder}`,
              display: 'flex', alignItems: 'flex-start', gap: '14px',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: '12px',
                background: '#fee2e2', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={colors.danger} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px', color: colors.textPrimary, marginBottom: '4px' }}>
                  Remove Order?
                </div>
                <div style={{ fontSize: '13px', color: colors.textSecondary, lineHeight: 1.5 }}>
                  This will unassign the order from <strong>{picker.username}</strong> and return it to the inbound queue.
                </div>
              </div>
            </div>

            {/* Tracking number pill */}
            <div style={{ padding: '16px 24px', background: '#fafafa', borderBottom: `1px solid ${colors.border}` }}>
              <div style={{ fontSize: '11px', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                Order
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                background: '#fff', border: `1px solid ${colors.border}`,
                borderRadius: '8px', padding: '8px 14px',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="3" width="15" height="13" rx="1" /><path d="M16 8h4l3 3v5h-7V8z" />
                  <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
                </svg>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '13px', color: colors.textPrimary }}>
                  {removeTarget.tracking}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ padding: '16px 24px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setRemoveTarget(null)}
                style={{
                  padding: '9px 20px', border: `1px solid ${colors.border}`,
                  borderRadius: '8px', background: '#fff', color: colors.textSecondary,
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmRemove}
                disabled={unassignMutation.isPending}
                style={{
                  padding: '9px 20px', border: 'none',
                  borderRadius: '8px', background: colors.danger, color: '#fff',
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  opacity: unassignMutation.isPending ? 0.7 : 1,
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}
              >
                {unassignMutation.isPending ? 'Removing...' : 'Yes, Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {slaOrderId && (
        <SlaHistoryModal
          orderId={slaOrderId.id}
          trackingNumber={slaOrderId.tracking}
          onClose={() => setSlaOrderId(null)}
        />
      )}
    </div>
  )
}

// ─── Per-picker stat card ────────────────────────────────────────────────────
function PickerStatCard({ stat, onClick }: { stat: PickerStat; onClick: () => void }) {
  const hasOrders = stat.total > 0 || stat.completed > 0

  return (
    <div
      className="picker-stat-card"
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <Avatar username={stat.picker.username} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '13px', color: colors.textPrimary, lineHeight: 1.2 }}>
            {stat.picker.username}
          </div>
          <div style={{ fontSize: '11px', color: colors.textMuted, marginTop: '2px' }}>
            {stat.total} active · {stat.completedToday} done today
          </div>
        </div>
        {/* Total active badge */}
        {stat.total > 0 && (
          <span style={{
            background: '#dbeafe',
            color: '#1d4ed8',
            borderRadius: '9999px',
            padding: '2px 8px',
            fontSize: '12px',
            fontWeight: 700,
            flexShrink: 0,
          }}>
            {stat.total}
          </span>
        )}
      </div>

      {/* Status breakdown */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <StatusChip
          label="Assigned"
          count={stat.statusCounts.PICKER_ASSIGNED}
          bg="#dbeafe"
          color="#1e40af"
          dot="#3b82f6"
        />
        <StatusChip
          label="Done Today"
          count={stat.completedToday}
          bg="#d1fae5"
          color="#065f46"
          dot="#10b981"
        />
        {stat.returned > 0 && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            background: '#fef3c7', color: '#92400e',
            borderRadius: '6px', padding: '4px 8px',
            fontSize: '11px', fontWeight: 600,
          }}>
            ↩ Returned: {stat.returned}
          </div>
        )}
      </div>

      {/* Completion progress bar */}
      {hasOrders && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ height: '4px', borderRadius: '9999px', background: colors.border, overflow: 'hidden', display: 'flex', gap: '2px' }}>
            {stat.statusCounts.PICKER_ASSIGNED > 0 && (
              <div style={{
                flex: stat.statusCounts.PICKER_ASSIGNED,
                background: '#3b82f6',
                transition: 'flex 0.4s ease',
              }} />
            )}
            {stat.completedToday > 0 && (
              <div style={{
                flex: stat.completedToday,
                background: '#10b981',
                transition: 'flex 0.4s ease',
              }} />
            )}
          </div>
        </div>
      )}

      {!hasOrders && (
        <div style={{ fontSize: '11px', color: colors.textMuted, marginTop: '8px', fontStyle: 'italic' }}>
          No orders assigned
        </div>
      )}

    </div>
  )
}

function StatusChip({ label, count, bg, color, dot }: {
  label: string; count: number; bg: string; color: string; dot: string
}) {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      background: bg,
      color,
      borderRadius: '6px',
      padding: '4px 8px',
      fontSize: '11px',
      fontWeight: 600,
      opacity: count === 0 ? 0.45 : 1,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      {label}: {count}
    </div>
  )
}

// ─── Custom picker dropdown ──────────────────────────────────────────────────
function PickerSelect({
  pickers,
  value,
  onChange,
}: {
  pickers: Picker[]
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selected = pickers.find(p => p.id === value) ?? null

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: '220px' }}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '8px 12px',
          background: selected ? '#eff6ff' : '#fff',
          border: `1.5px solid ${selected ? colors.primary : colors.borderStrong}`,
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: selected ? 600 : 400,
          color: selected ? colors.primary : colors.textSecondary,
          transition: 'all 0.15s',
          textAlign: 'left',
        }}
      >
        {selected ? (
          <>
            <Avatar username={selected.username} size={24} />
            <span style={{ flex: 1 }}>{selected.username}</span>
            {/* Selected checkmark */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </>
        ) : (
          <>
            <span style={{
              width: 24, height: 24, borderRadius: '50%',
              background: '#e5e7eb', display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            <span style={{ flex: 1 }}>Select a picker...</span>
          </>
        )}
        {/* Chevron */}
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke={selected ? colors.primary : '#9ca3af'}
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s', flexShrink: 0 }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown list */}
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          right: 0,
          background: '#fff',
          border: `1px solid ${colors.border}`,
          borderRadius: '10px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          zIndex: 50,
          overflow: 'hidden',
          maxHeight: '320px',
          overflowY: 'auto',
        }}>
          {pickers.map(p => {
            const isActive = p.id === value
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => { onChange(p.id); setOpen(false) }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '9px 14px',
                  background: isActive ? '#eff6ff' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? colors.primary : colors.textPrimary,
                  textAlign: 'left',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = '#f8fafc' }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                <Avatar username={p.username} size={26} />
                <span style={{ flex: 1 }}>{p.username}</span>
                {isActive && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function PickerAdmin() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectedPickerId, setSelectedPickerId] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 10
  const [modalPicker, setModalPicker] = useState<{ id: string; username: string } | null>(null)

  // Sort + filter state (Phase C)
  const [sortKey, setSortKey] = useState<PickerSortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [platformFilter, setPlatformFilter] = useState<Set<string>>(new Set())
  const [delayFilter, setDelayFilter] = useState<Set<number>>(new Set())
  const [carrierFilter, setCarrierFilter] = useState('')
  const [shopFilter, setShopFilter] = useState('')

  // Staging state
  const [stagedOrders, setStagedOrders] = useState<Order[]>([])
  const [scanFeedback, setScanFeedback] = useState<{ type: 'error' | 'warning' | 'success'; message: string } | null>(null)

  // On mount: check Redis-backed pending staged orders (catches events sent before page opened)
  useEffect(() => {
    api.get<{ orders: Order[] }>('/picker-admin/pending-staged')
      .then(res => {
        if (res.data.orders.length > 0) {
          setStagedOrders(prev => {
            const existing = new Set(prev.map(o => o.id))
            const fresh = res.data.orders.filter(o => !existing.has(o.id))
            if (fresh.length === 0) return prev
            setScanFeedback({ type: 'success', message: `${fresh.length} handheld scan${fresh.length !== 1 ? 's' : ''} loaded` })
            setTimeout(() => setScanFeedback(null), 3000)
            return [...prev, ...fresh]
          })
        }
      })
      .catch(() => {})
  }, [])

  // Real-time: handheld scan event → auto-add order to staging area
  useEffect(() => {
    const socket = connectSocket()
    socket.on('order:staged', (data: { order: Order }) => {
      // Clear Redis-backed pending so it's not shown twice on next page load
      api.get('/picker-admin/pending-staged').catch(() => {})
      setStagedOrders(prev => {
        if (prev.find(o => o.id === data.order.id)) return prev
        return [...prev, data.order]
      })
      setScanFeedback({ type: 'success', message: `Handheld staged: ${data.order.trackingNumber}` })
      setTimeout(() => setScanFeedback(null), 3000)
    })
    return () => { socket.off('order:staged') }
  }, [])

  // Orders query — refetch every 5 s
  const {
    data: orders,
    isLoading: ordersLoading,
    isError: ordersError,
  } = useQuery({
    queryKey: ['picker-admin-orders'],
    queryFn: async () => {
      const res = await api.get<{ orders: Order[] }>('/picker-admin/orders')
      return res.data.orders
    },
    refetchInterval: 10_000,
  })

  // Pickers query — refetchOnMount: 'always' bypasses global staleTime:30s
  const { data: pickers } = useQuery({
    queryKey: ['picker-admin-pickers'],
    queryFn: async () => {
      const res = await api.get<{ pickers: Picker[] }>('/picker-admin/pickers')
      return res.data.pickers
    },
    staleTime: 0,
    refetchOnMount: 'always',
  })

  // Stats query
  const { data: statsData } = useQuery({
    queryKey: ['picker-admin-stats'],
    queryFn: async () => {
      const res = await api.get<{ stats: PickerStat[]; returnedCount: number; totalCompleted: number }>('/picker-admin/stats')
      return res.data
    },
    staleTime: 0,
    refetchInterval: 10_000,
  })

  // Order balance stats — order-status-based counts so header equation always holds
  const { data: orderStats } = useQuery({
    queryKey: ['orders-stats'],
    queryFn: async () => {
      const res = await api.get<{ totalScanned: number; pendingInbound: number; inProgressCount: number; pickerDoneCount: number }>('/orders/stats')
      return res.data
    },
    refetchInterval: 10_000,
  })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['picker-admin-orders'] })
    queryClient.invalidateQueries({ queryKey: ['picker-admin-stats'] })
  }

  // Single assign mutation
  const assignMutation = useMutation({
    mutationFn: ({ orderId, pickerId }: { orderId: string; pickerId: string }) =>
      api.post('/picker-admin/assign', { orderId, pickerId }),
    onSuccess: () => { invalidateAll() },
    onError: (err: any) => {
      const msg = err?.response?.data?.error ?? 'Assign failed'
      setScanFeedback({ type: 'error', message: msg })
    },
  })

  // Bulk assign mutation (manual checkbox flow)
  const bulkAssignMutation = useMutation({
    mutationFn: ({ orderIds, pickerId }: { orderIds: string[]; pickerId: string }) =>
      api.post('/picker-admin/bulk-assign', { orderIds, pickerId }),
    onSuccess: (res: any) => {
      setSelectedIds(new Set())
      invalidateAll()
      const assigned = res?.data?.assigned ?? selectedIds.size
      setScanFeedback({ type: 'success', message: `Successfully assigned ${assigned} order${assigned !== 1 ? 's' : ''}.` })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error ?? 'Bulk assign failed'
      setScanFeedback({ type: 'error', message: msg })
    },
  })

  // Scan lookup mutation — finds an INBOUND order by tracking number, adds to staging
  const scanStageMutation = useMutation({
    mutationFn: (trackingNumber: string) =>
      api.post<{ order: Order }>('/picker-admin/scan', { trackingNumber }),
    onSuccess: (res) => {
      const order = res.data.order
      setStagedOrders(prev => {
        if (prev.find(o => o.id === order.id)) return prev  // socket already added it
        return [...prev, order]
      })
      setScanFeedback({ type: 'success', message: `Staged: ${order.trackingNumber}` })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error ?? 'Order not found'
      const isAssigned = msg.toLowerCase().includes('assigned to')
      setScanFeedback({ type: isAssigned ? 'warning' : 'error', message: msg })
    },
  })

  // Staged assign mutation — bulk-assigns all staged orders to selected picker
  const assignStagedMutation = useMutation({
    mutationFn: ({ orderIds, pickerId }: { orderIds: string[]; pickerId: string }) =>
      api.post<{ assigned: number; skipped: number }>('/picker-admin/bulk-assign', { orderIds, pickerId }),
    onSuccess: (res) => {
      const { assigned, skipped } = res.data
      setStagedOrders([])
      invalidateAll()
      if (skipped > 0) {
        setScanFeedback({ type: 'warning', message: `Assigned ${assigned} order${assigned !== 1 ? 's' : ''}. ${skipped} skipped (already assigned).` })
      } else {
        setScanFeedback({ type: 'success', message: `Successfully assigned ${assigned} order${assigned !== 1 ? 's' : ''}.` })
      }
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error ?? 'Assign failed'
      setScanFeedback({ type: 'error', message: msg })
    },
  })

  function handleAssignStaged() {
    if (!selectedPickerId) { setScanFeedback({ type: 'error', message: 'Please select a picker first' }); return }
    assignStagedMutation.mutate({ orderIds: stagedOrders.map(o => o.id), pickerId: selectedPickerId })
  }

  const todayStr = getManilaDateString()
  const orderList = orders ?? []
  const carryoverCount = orderList.filter(o => getManilaDateString(new Date(o.workDate)) < todayStr).length
  const pickerList = pickers ?? []
  const statsList = statsData?.stats ?? []
  const returnedFromPacker = statsData?.returnedCount ?? 0

  // Distinct platforms present in current data — drives filter chips
  const availablePlatforms = useMemo(
    () => Array.from(new Set(orderList.map(o => o.platform))).sort(),
    [orderList],
  )

  // Apply filters + sort before paginating
  const visibleOrders = useMemo(() => {
    let list = orderList
    if (platformFilter.size > 0) list = list.filter(o => platformFilter.has(o.platform))
    if (delayFilter.size > 0) list = list.filter(o => delayFilter.has(o.delayLevel))
    const carrierTrim = carrierFilter.trim().toLowerCase()
    if (carrierTrim) list = list.filter(o => (o.carrierName ?? '').toLowerCase().includes(carrierTrim))
    const shopTrim = shopFilter.trim().toLowerCase()
    if (shopTrim) list = list.filter(o => (o.shopName ?? '').toLowerCase().includes(shopTrim))

    if (sortKey) {
      const dir = sortDir === 'asc' ? 1 : -1
      const sorted = [...list].sort((a, b) => {
        switch (sortKey) {
          case 'tracking':  return a.trackingNumber.localeCompare(b.trackingNumber) * dir
          case 'platform':  return a.platform.localeCompare(b.platform) * dir
          case 'carrier':   return (a.carrierName ?? '').localeCompare(b.carrierName ?? '') * dir
          case 'shop':      return (a.shopName ?? '').localeCompare(b.shopName ?? '') * dir
          case 'delay':     return (a.delayLevel - b.delayLevel) * dir
          case 'scannedAt': return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir
          case 'scannedBy': return a.scannedBy.username.localeCompare(b.scannedBy.username) * dir
          default:          return 0
        }
      })
      list = sorted
    }
    return list
  }, [orderList, platformFilter, delayFilter, carrierFilter, shopFilter, sortKey, sortDir])

  const activeFilterCount =
    platformFilter.size + delayFilter.size +
    (carrierFilter.trim() ? 1 : 0) + (shopFilter.trim() ? 1 : 0)

  function togglePlatformFilter(p: string) {
    setCurrentPage(1)
    setPlatformFilter(prev => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p); else next.add(p)
      return next
    })
  }
  function toggleDelayFilter(level: number) {
    setCurrentPage(1)
    setDelayFilter(prev => {
      const next = new Set(prev)
      if (next.has(level)) next.delete(level); else next.add(level)
      return next
    })
  }
  function resetFilters() {
    setPlatformFilter(new Set())
    setDelayFilter(new Set())
    setCarrierFilter('')
    setShopFilter('')
    setCurrentPage(1)
  }
  function handleSort(key: PickerSortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  // Pagination over filtered+sorted list
  const totalPages = Math.max(1, Math.ceil(visibleOrders.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const pagedOrders = visibleOrders.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // Select / deselect helpers — operate on visible list
  const allSelected = visibleOrders.length > 0 && visibleOrders.every(o => selectedIds.has(o.id))
  const someSelected = selectedIds.size > 0

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(visibleOrders.map(o => o.id)))
    }
  }

  function toggleOne(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  function handleAssignSelected() {
    if (!selectedPickerId) { setScanFeedback({ type: 'error', message: 'Please select a picker first' }); return }
    if (selectedIds.size === 0) { setScanFeedback({ type: 'warning', message: 'No orders selected' }); return }
    bulkAssignMutation.mutate({ orderIds: Array.from(selectedIds), pickerId: selectedPickerId })
  }

  function handleAssignAll() {
    if (!selectedPickerId) { setScanFeedback({ type: 'error', message: 'Please select a picker first' }); return }
    const allIds = orderList.map(o => o.id)
    if (allIds.length === 0) { setScanFeedback({ type: 'warning', message: 'No orders to assign' }); return }
    bulkAssignMutation.mutate({ orderIds: allIds, pickerId: selectedPickerId })
  }

  function handleAssignSingle(orderId: string) {
    if (!selectedPickerId) { setScanFeedback({ type: 'error', message: 'Please select a picker first' }); return }
    assignMutation.mutate({ orderId, pickerId: selectedPickerId })
  }

  const isBusy = assignMutation.isPending || bulkAssignMutation.isPending || assignStagedMutation.isPending

  // ─── Header stats ──────────────────────────────────────────────────────────
  const headerStats = (
    <>
      <StatCard label="In Queue" value={orderStats?.pendingInbound ?? orderList.length} color={colors.primary} />
      <StatCard label="In Progress" value={orderStats?.inProgressCount ?? 0} color={colors.success} />
      <StatCard label="Total Completed" value={orderStats?.pickerDoneCount ?? 0} color="#10b981" />
      <StatCard label="Returned from Packer" value={returnedFromPacker} color="#f59e0b" />
      {/* Delay breakdown */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        background: '#f8fafc', border: '1px solid #e2e8f0',
        borderRadius: '10px', padding: '6px 12px',
      }}>
        {[0, 1, 2, 3, 4].map((level) => {
          const count = orderList.filter(o => o.delayLevel === level).length
          const delayColors = ['#64748b', '#eab308', '#f97316', '#ef4444', '#991b1b']
          return (
            <div key={level} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: '20px', height: '20px', borderRadius: '5px',
                background: delayColors[level], color: '#fff',
                fontSize: '10px', fontWeight: 700, padding: '0 4px',
              }}>
                D{level}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', minWidth: '18px' }}>
                {count}
              </span>
              {level < 4 && <span style={{ color: '#cbd5e1', fontSize: '12px' }}>·</span>}
            </div>
          )
        })}
      </div>
      {ordersLoading && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: colors.textMuted }}>
          <span className="spinner spinner-sm" />
          Syncing
        </span>
      )}
      {ordersError && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: colors.danger, fontWeight: 600 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Connection error
        </span>
      )}
    </>
  )

  // ─── Render ────────────────────────────────────────────────────────────────
  const PickerAdminIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <polyline points="16 11 18 13 22 9" />
    </svg>
  )

  return (
    <PageShell
      icon={PickerAdminIcon}
      title="Picker Admin Panel"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
      stats={headerStats}
    >
      {/* ── Scan & Stage ── */}
      <div style={{ marginBottom: '28px' }}>
        <SectionHeader title="Scan & Stage" count={stagedOrders.length} />

        {/* Main scan row */}
        <div style={{ display: 'flex', gap: '16px', marginTop: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

          {/* Left: scan input + feedback */}
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <ScanInput
              onScan={(tn) => {
                setScanFeedback(null)
                scanStageMutation.mutate(tn)
              }}
              disabled={scanStageMutation.isPending}
            />
            {scanFeedback && (
              <div className={[
                'feedback-banner',
                scanFeedback.type === 'error' ? 'feedback-banner--error'
                  : scanFeedback.type === 'warning' ? 'feedback-banner--warning'
                  : 'feedback-banner--success',
              ].join(' ')} style={{ marginTop: '8px' }}>
                {scanFeedback.message}
              </div>
            )}
          </div>

          {/* Right: picker select + assign staged button */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '230px' }}>
            <PickerSelect
              pickers={pickerList}
              value={selectedPickerId}
              onChange={setSelectedPickerId}
            />
            <button
              className="btn btn-primary"
              onClick={handleAssignStaged}
              disabled={stagedOrders.length === 0 || !selectedPickerId || assignStagedMutation.isPending}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {assignStagedMutation.isPending
                ? 'Assigning...'
                : `Assign ${stagedOrders.length > 0 ? stagedOrders.length + ' ' : ''}Staged Orders →`}
            </button>
          </div>
        </div>

        {/* Staged orders list */}
        {stagedOrders.length > 0 && (
          <div style={{ marginTop: '12px', border: `1px solid #bbf7d0`, borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{
              background: '#f0fdf4', padding: '8px 16px', borderBottom: `1px solid #bbf7d0`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: colors.success }}>
                {stagedOrders.length} order{stagedOrders.length !== 1 ? 's' : ''} ready to assign
              </span>
              <button
                onClick={() => { setStagedOrders([]); setScanFeedback(null) }}
                style={{
                  fontSize: '12px', color: colors.textMuted, background: 'none',
                  border: 'none', cursor: 'pointer', fontWeight: 600,
                }}
              >
                Clear all
              </button>
            </div>
            <div style={{ background: '#fff' }}>
              {stagedOrders.map((order, i) => (
                <div key={order.id} style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '9px 16px',
                  borderBottom: i < stagedOrders.length - 1 ? `1px solid ${colors.border}` : 'none',
                }}>
                  <span style={{ fontSize: '11px', color: colors.textMuted, width: 20, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '13px', flex: 1 }}>
                    {order.trackingNumber}
                  </span>
                  <PlatformBadge platform={order.platform} />
                  <DelayBadge level={order.delayLevel} />
                  <span style={{ fontSize: '12px', color: colors.textSecondary, fontWeight: 600, minWidth: 40 }}>
                    P{order.priority}
                  </span>
                  <button
                    onClick={() => setStagedOrders(prev => prev.filter(o => o.id !== order.id))}
                    style={{
                      width: 26, height: 26, borderRadius: '6px', border: 'none',
                      background: '#f1f5f9', cursor: 'pointer', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: colors.textSecondary, fontSize: '16px', lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Section heading */}
      <SectionHeader title="Inbound Orders" count={visibleOrders.length}>
        {activeFilterCount > 0 && orderList.length !== visibleOrders.length && (
          <span style={{ fontSize: '12px', color: colors.textMuted, fontWeight: 600 }}>
            · filtered from {orderList.length}
          </span>
        )}
        {carryoverCount > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#d97706', fontWeight: 600 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            {carryoverCount} carryover
          </span>
        )}
      </SectionHeader>

      {/* Filter bar */}
      <div className="filter-bar">
        {availablePlatforms.length > 0 && (
          <div className="filter-bar-group">
            <span className="filter-bar-label">Platform</span>
            {availablePlatforms.map(p => (
              <button
                key={p}
                type="button"
                className={['filter-chip', platformFilter.has(p) ? 'filter-chip--active' : ''].filter(Boolean).join(' ')}
                onClick={() => togglePlatformFilter(p)}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        <div className="filter-bar-group">
          <span className="filter-bar-label">Delay</span>
          {[0, 1, 2, 3, 4].map(level => (
            <button
              key={level}
              type="button"
              className={['filter-chip', delayFilter.has(level) ? 'filter-chip--active' : ''].filter(Boolean).join(' ')}
              onClick={() => toggleDelayFilter(level)}
              style={
                delayFilter.has(level)
                  ? { background: colors.delayBg[level], borderColor: colors.delay[level], color: colors.delayText[level] }
                  : undefined
              }
            >
              D{level}
            </button>
          ))}
        </div>

        <div className="filter-bar-group">
          <span className="filter-bar-label">Carrier</span>
          <input
            type="text"
            className="filter-bar-input"
            placeholder="contains..."
            value={carrierFilter}
            onChange={e => { setCarrierFilter(e.target.value); setCurrentPage(1) }}
          />
        </div>

        <div className="filter-bar-group">
          <span className="filter-bar-label">Shop</span>
          <input
            type="text"
            className="filter-bar-input"
            placeholder="contains..."
            value={shopFilter}
            onChange={e => { setShopFilter(e.target.value); setCurrentPage(1) }}
          />
        </div>

        {activeFilterCount > 0 && (
          <button type="button" className="filter-bar-reset" onClick={resetFilters}>
            Reset filters ({activeFilterCount})
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="toolbar-card">
        {/* Left: select-all checkbox + selection count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              style={{ accentColor: colors.primary, width: 16, height: 16, cursor: 'pointer' }}
            />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>Select All</span>
          </label>
          {someSelected && (
            <span className="count-badge" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
              {selectedIds.size} selected
            </span>
          )}
        </div>

        {/* Right: action buttons (picker selected above in scan area) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            onClick={handleAssignSelected}
            disabled={!someSelected || !selectedPickerId || isBusy}
          >
            Assign Selected
          </button>

          <button
            className="btn btn-outline"
            onClick={handleAssignAll}
            disabled={orderList.length === 0 || !selectedPickerId || isBusy}
          >
            Assign All
          </button>
        </div>
      </div>

      {/* Order table / loading / error / empty states */}
      {ordersLoading ? (
        <div className="loading-state">
          <span className="spinner spinner-lg" />
          <span>Loading orders...</span>
        </div>
      ) : ordersError ? (
        <div className="empty-state" style={{ borderColor: colors.dangerBorder }}>
          <div className="empty-state-icon">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={colors.danger} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <p className="empty-state-title" style={{ color: colors.danger }}>Failed to load orders</p>
          <p className="empty-state-desc">Please check your connection and try again.</p>
        </div>
      ) : orderList.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p className="empty-state-title">All orders assigned!</p>
          <p className="empty-state-desc">No inbound orders are waiting for assignment.</p>
        </div>
      ) : visibleOrders.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <p className="empty-state-title">No orders match your filters</p>
          <p className="empty-state-desc">
            <button className="filter-bar-reset" onClick={resetFilters} style={{ marginLeft: 0 }}>
              Reset filters
            </button>
          </p>
        </div>
      ) : (
        <>
        <div className="data-table-wrap">
          <table style={{ minWidth: '1100px' }}>
            <thead>
              <tr>
                <th style={{ width: 40 }} />
                <th style={{ width: 40 }}>#</th>
                <SortableTh<PickerSortKey> label="Tracking Number" sortKey="tracking" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                <SortableTh<PickerSortKey> label="Platform" sortKey="platform" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                <SortableTh<PickerSortKey> label="Carrier" sortKey="carrier" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                <SortableTh<PickerSortKey> label="Shop" sortKey="shop" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                <SortableTh<PickerSortKey> label="Delay" sortKey="delay" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                <SortableTh<PickerSortKey> label="Scanned At" sortKey="scannedAt" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                <SortableTh<PickerSortKey> label="Scanned By" sortKey="scannedBy" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                <th style={{ textAlign: 'center' }}>Assign</th>
              </tr>
            </thead>
            <tbody>
              {pagedOrders.map((order, i) => {
                const globalIndex = (safePage - 1) * PAGE_SIZE + i + 1
                const isSelected = selectedIds.has(order.id)
                const isStaged = stagedOrders.some(o => o.id === order.id)
                const delayClass =
                  order.delayLevel === 4 ? 'row-d4' :
                  order.delayLevel === 3 ? 'row-d3' :
                  order.delayLevel === 2 ? 'row-d2' : ''
                const rowClass = [isSelected ? 'row-selected' : delayClass].filter(Boolean).join(' ')

                return (
                  <tr key={order.id} className={rowClass} style={isStaged ? { background: '#f0fdf4' } : undefined}>
                    <td style={{ textAlign: 'center', width: 40 }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(order.id)}
                        style={{ accentColor: colors.primary, cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ color: '#9ca3af', width: 40 }}>{globalIndex}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600, letterSpacing: '0.03em' }}>
                      {order.trackingNumber}
                      {isStaged && (
                        <span style={{
                          marginLeft: '8px', fontSize: '10px', fontWeight: 700,
                          background: '#dcfce7', color: colors.success,
                          padding: '1px 7px', borderRadius: '9999px', fontFamily: 'sans-serif',
                          verticalAlign: 'middle',
                        }}>
                          STAGED
                        </span>
                      )}
                      {order.workDate && getManilaDateString(new Date(order.workDate)) < todayStr && (
                        <span style={{
                          marginLeft: '6px', fontSize: '10px', fontWeight: 700,
                          background: '#fef3c7', color: '#d97706',
                          padding: '1px 6px', borderRadius: '9999px', fontFamily: 'sans-serif',
                          verticalAlign: 'middle', border: '1px solid #fcd34d',
                        }}>
                          CARRY
                        </span>
                      )}
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
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila',
                      })}
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#374151', fontWeight: 500 }}>
                        <Avatar username={order.scannedBy.username} size={24} />
                        {order.scannedBy.username}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="btn-assign"
                        onClick={() => handleAssignSingle(order.id)}
                        disabled={isBusy}
                      >
                        Assign
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="pagination-bar">
            <span className="pagination-info">
              Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, visibleOrders.length)} of {visibleOrders.length} orders
            </span>
            <div className="pagination-controls">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
              >
                ← Prev
              </button>
              {(() => {
                const delta = 2
                const start = Math.max(1, safePage - delta)
                const end = Math.min(totalPages, safePage + delta)
                const pages: (number | 'ellipsis-start' | 'ellipsis-end')[] = []
                if (start > 1) { pages.push(1); if (start > 2) pages.push('ellipsis-start') }
                for (let p = start; p <= end; p++) pages.push(p)
                if (end < totalPages) { if (end < totalPages - 1) pages.push('ellipsis-end'); pages.push(totalPages) }
                return pages.map((page) =>
                  typeof page === 'string'
                    ? <span key={page} style={{ padding: '0 4px', color: '#94a3b8', alignSelf: 'center' }}>…</span>
                    : <button key={page} onClick={() => setCurrentPage(page)} className={['pagination-page-btn', page === safePage ? 'pagination-page-btn--active' : ''].filter(Boolean).join(' ')}>{page}</button>
                )
              })()}
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
              >
                Next →
              </button>
            </div>
          </div>
        )}
        </>
      )}

      {/* Picker workload section */}
      <div style={{ marginTop: '32px' }}>
        <SectionHeader title="Picker Workload" count={statsList.length} />
        {statsList.length === 0 ? (
          <div className="empty-state" style={{ marginTop: '12px' }}>
            <div className="empty-state-icon">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <p className="empty-state-title">No pickers found</p>
            <p className="empty-state-desc">Run the seed script to create picker accounts.</p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '12px',
            marginTop: '12px',
          }}>
            {statsList.map(stat => (
              <PickerStatCard
                key={stat.picker.id}
                stat={stat}
                onClick={() => setModalPicker({ id: stat.picker.id, username: stat.picker.username })}
              />
            ))}
          </div>
        )}
      </div>

      {modalPicker && (
        <PickerOrdersModal
          picker={modalPicker}
          onClose={() => setModalPicker(null)}
          onComplete={() => {
            queryClient.invalidateQueries({ queryKey: ['picker-admin-stats'] })
          }}
        />
      )}

      {/* Sticky bulk action bar */}
      {someSelected && (
        <div className="bulk-action-bar" role="region" aria-label="Bulk actions">
          <span className="bulk-action-bar-count">
            <span className="bulk-action-bar-count-pill">{selectedIds.size}</span>
            order{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            {selectedPickerId
              ? `Picker: ${pickerList.find(p => p.id === selectedPickerId)?.username ?? '—'}`
              : 'Select a picker above'}
          </span>
          <span className="bulk-action-bar-spacer" />
          <button
            type="button"
            className="bulk-action-bar-btn bulk-action-bar-btn--primary"
            onClick={handleAssignSelected}
            disabled={!selectedPickerId || isBusy}
          >
            Assign Selected
          </button>
          <button
            type="button"
            className="bulk-action-bar-btn bulk-action-bar-btn--ghost"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </button>
        </div>
      )}
    </PageShell>
  )
}
