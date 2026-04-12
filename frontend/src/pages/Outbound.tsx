import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'
import { colors } from '../theme'
import DelayBadge from '../components/DelayBadge'
import PageShell from '../components/shared/PageShell'
import StatCard from '../components/shared/StatCard'
import PlatformBadge from '../components/shared/PlatformBadge'
import SectionHeader from '../components/shared/SectionHeader'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReadyOrder {
  id: string
  trackingNumber: string
  platform: string
  carrierName?: string | null
  shopName?: string | null
  delayLevel: number
  priority: number
  createdAt: string
  packerAssignments: Array<{
    completedAt: string | null
    packer: { username: string }
  }>
}

interface OutboundStats {
  waitingCount: number
  dispatchedToday: number
  inboundTotal: number
  outboundTotal: number
  missingCount: number
  d4Count: number
  pipeline: {
    inboundQueue: number
    pickerActive: number
    pickerComplete: number
    packerComplete: number
    dispatched: number
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatElapsed(from: string | Date): string {
  const ms = Date.now() - new Date(from).getTime()
  if (ms < 0) return '0m'
  const totalMins = Math.floor(ms / 60000)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

// ─── Dispatch Confirm Dialog ─────────────────────────────────────────────────

function DispatchDialog({
  target,
  isPending,
  onConfirm,
  onCancel,
}: {
  target: { id: string; tracking: string }
  isPending: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '420px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
          padding: '20px 24px',
        }}>
          <div style={{ fontWeight: 700, fontSize: '15px', color: '#fff' }}>Confirm Dispatch</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', marginTop: '4px' }}>
            This will mark the order as OUTBOUND and stop the SLA timer.
          </div>
        </div>
        {/* Body */}
        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: '13px', color: colors.textSecondary, marginBottom: '6px' }}>Tracking number</div>
          <div style={{
            fontFamily: 'monospace', fontWeight: 700, fontSize: '14px',
            color: colors.textPrimary, background: '#f8fafc',
            border: `1px solid ${colors.border}`, borderRadius: '8px',
            padding: '10px 14px', marginBottom: '20px',
          }}>
            {target.tracking}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={onCancel}
              style={{
                flex: 1, padding: '10px', fontSize: '13px', fontWeight: 600,
                background: '#f1f5f9', color: colors.textSecondary,
                border: 'none', borderRadius: '8px', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isPending}
              style={{
                flex: 1, padding: '10px', fontSize: '13px', fontWeight: 700,
                background: isPending ? '#bae6fd' : '#0ea5e9',
                color: '#fff', border: 'none', borderRadius: '8px',
                cursor: isPending ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}
            >
              {isPending && <span className="spinner spinner-sm" style={{ borderTopColor: '#fff' }} />}
              Dispatch
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 10

export default function Outbound() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [dispatchTarget, setDispatchTarget] = useState<{ id: string; tracking: string } | null>(null)
  const [actionFeedback, setActionFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null)

  // ── Queries ──────────────────────────────────────────────────────────────────
  const {
    data: orders,
    isLoading: ordersLoading,
    isError: ordersError,
  } = useQuery({
    queryKey: ['outbound-orders'],
    queryFn: async () => {
      const res = await api.get<{ orders: ReadyOrder[] }>('/outbound/orders')
      return res.data.orders
    },
    refetchInterval: 10_000,
  })

  const { data: statsData } = useQuery({
    queryKey: ['outbound-stats'],
    queryFn: async () => {
      const res = await api.get<OutboundStats>('/outbound/stats')
      return res.data
    },
    refetchInterval: 10_000,
  })

  const orderList = orders ?? []

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['outbound-orders'] })
    queryClient.invalidateQueries({ queryKey: ['outbound-stats'] })
  }

  // ── Mutations ────────────────────────────────────────────────────────────────
  const dispatchMutation = useMutation({
    mutationFn: (orderId: string) => api.post('/outbound/dispatch', { orderId }),
    onSuccess: () => {
      invalidateAll()
      setDispatchTarget(null)
      setSearchQuery('')
      setCurrentPage(1)
      setSelectedIds(new Set())
      setActionFeedback({ type: 'success', message: 'Order dispatched. SLA timer stopped.' })
      setTimeout(() => setActionFeedback(null), 4000)
    },
    onError: (err: any) => {
      setDispatchTarget(null)
      setActionFeedback({ type: 'error', message: err?.response?.data?.error ?? 'Dispatch failed' })
      setTimeout(() => setActionFeedback(null), 4000)
    },
  })

  const bulkDispatchMutation = useMutation({
    mutationFn: (orderIds: string[]) => api.post<{ dispatched: number; skipped: number }>('/outbound/bulk-dispatch', { orderIds }),
    onSuccess: (res) => {
      const { dispatched, skipped } = res.data
      invalidateAll()
      setSearchQuery('')
      setCurrentPage(1)
      setSelectedIds(new Set())
      const msg = skipped > 0
        ? `Dispatched ${dispatched} order${dispatched !== 1 ? 's' : ''}. ${skipped} skipped.`
        : `Dispatched ${dispatched} order${dispatched !== 1 ? 's' : ''}.`
      setActionFeedback({ type: 'success', message: msg })
      setTimeout(() => setActionFeedback(null), 4000)
    },
    onError: (err: any) => {
      setActionFeedback({ type: 'error', message: err?.response?.data?.error ?? 'Bulk dispatch failed' })
      setTimeout(() => setActionFeedback(null), 4000)
    },
  })

  const isBusy = dispatchMutation.isPending || bulkDispatchMutation.isPending

  // ── Search + Selection + Pagination ─────────────────────────────────────────
  const trimmed = searchQuery.trim().toUpperCase()
  const filteredList = trimmed
    ? orderList.filter((o) => o.trackingNumber.toUpperCase().includes(trimmed))
    : orderList

  const totalPages = Math.max(1, Math.ceil(filteredList.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const pagedOrders = filteredList.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const allSelected = filteredList.length > 0 && filteredList.every((o) => selectedIds.has(o.id))
  const someSelected = selectedIds.size > 0

  function toggleAll() {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(filteredList.map((o) => o.id)))
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ─── Header stats ─────────────────────────────────────────────────────────
  const headerStats = (
    <>
      <StatCard label="Total Inbound" value={statsData?.inboundTotal ?? 0} color={colors.primary} />
      <StatCard label="Dispatched" value={statsData?.outboundTotal ?? 0} color={colors.success} />
      <StatCard label="In Pipeline" value={statsData?.missingCount ?? 0} color="#f59e0b" />
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

  const OutboundIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" rx="2" />
      <path d="M16 8h4l3 5v3h-7V8z" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  )

  return (
    <PageShell
      icon={OutboundIcon}
      title="Outbound Panel"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
      stats={headerStats}
    >
      {/* Dispatch confirm dialog */}
      {dispatchTarget && (
        <DispatchDialog
          target={dispatchTarget}
          isPending={dispatchMutation.isPending}
          onConfirm={() => dispatchMutation.mutate(dispatchTarget.id)}
          onCancel={() => setDispatchTarget(null)}
        />
      )}

      {/* Feedback banner */}
      {actionFeedback && (
        <div className={[
          'feedback-banner',
          actionFeedback.type === 'error' ? 'feedback-banner--error' : 'feedback-banner--success',
        ].join(' ')} style={{ marginBottom: '16px' }}>
          {actionFeedback.message}
        </div>
      )}

      {/* ── Section 1: Ready to Dispatch ──────────────────────────────────── */}
      <SectionHeader
        title="Ready to Dispatch"
        count={filteredList.length}
      >
        {someSelected && (
          <button
            onClick={() => bulkDispatchMutation.mutate(Array.from(selectedIds))}
            disabled={isBusy}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '7px 14px', fontSize: '12px', fontWeight: 700,
              background: isBusy ? '#bae6fd' : '#0ea5e9',
              color: '#fff', border: 'none', borderRadius: '8px',
              cursor: isBusy ? 'not-allowed' : 'pointer',
            }}
          >
            {bulkDispatchMutation.isPending && <span className="spinner spinner-sm" style={{ borderTopColor: '#fff' }} />}
            Dispatch Selected ({selectedIds.size})
          </button>
        )}
      </SectionHeader>

      {/* Search */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '12px 16px', background: '#fff',
        border: `1px solid ${colors.border}`, borderRadius: '10px',
        marginBottom: '12px',
      }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="Search by tracking number..."
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
          style={{
            flex: 1, border: 'none', outline: 'none',
            fontSize: '13px', color: colors.textPrimary, background: 'transparent',
          }}
        />
        {searchQuery && (
          <button
            onClick={() => { setSearchQuery(''); setCurrentPage(1) }}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: colors.textMuted, padding: '2px 4px', fontSize: '13px' }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Orders table */}
      <div className="data-table-wrap" style={{ marginBottom: '28px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: `1px solid ${colors.border}` }}>
              <th style={{ padding: '10px 14px', width: '40px' }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  style={{ cursor: 'pointer' }}
                />
              </th>
              {['Tracking Number', 'Platform', 'Carrier', 'Shop', 'Packed By', 'Waiting Since', 'Delay', 'Action'].map((h) => (
                <th key={h} style={{
                  padding: '10px 14px', textAlign: 'left', fontSize: '11px',
                  fontWeight: 600, color: colors.textSecondary, textTransform: 'uppercase',
                  letterSpacing: '0.05em', whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordersLoading ? (
              <tr>
                <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: colors.textMuted }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                    <span className="spinner spinner-sm" />
                    Loading orders...
                  </div>
                </td>
              </tr>
            ) : pagedOrders.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: '40px', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>🚚</div>
                  <div style={{ fontWeight: 600, color: colors.textPrimary, fontSize: '14px' }}>
                    {trimmed ? 'No orders match your search' : 'No orders waiting to dispatch'}
                  </div>
                  <div style={{ color: colors.textMuted, fontSize: '12px', marginTop: '4px' }}>
                    {trimmed ? 'Try a different tracking number.' : 'All packed orders have been dispatched.'}
                  </div>
                </td>
              </tr>
            ) : (
              pagedOrders.map((order) => {
                const assignment = order.packerAssignments[0]
                const waitingSince = assignment?.completedAt ?? order.createdAt
                return (
                  <tr key={order.id} style={{
                    borderBottom: `1px solid #f1f5f9`,
                    background: selectedIds.has(order.id) ? '#f0f9ff' : undefined,
                  }}>
                    <td style={{ padding: '11px 14px' }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(order.id)}
                        onChange={() => toggleOne(order.id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontWeight: 600, fontSize: '12px', color: colors.textPrimary }}>
                      {order.trackingNumber}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <PlatformBadge platform={order.platform} />
                    </td>
                    <td style={{ padding: '11px 14px' }}>
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
                        <span style={{ padding: '11px 0px', fontSize: '12px', color: '#d1d5db' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: '13px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {order.shopName ?? <span style={{ color: '#d1d5db' }}>—</span>}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: '12px', color: colors.textSecondary, whiteSpace: 'nowrap' }}>
                      {assignment?.packer.username ?? '—'}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: '12px', color: colors.textSecondary, whiteSpace: 'nowrap' }}>
                      {formatElapsed(waitingSince)}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <DelayBadge level={order.delayLevel} />
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <button
                        onClick={() => setDispatchTarget({ id: order.id, tracking: order.trackingNumber })}
                        disabled={isBusy}
                        style={{
                          padding: '5px 12px', fontSize: '12px', fontWeight: 700,
                          background: '#0ea5e9', color: '#fff',
                          border: 'none', borderRadius: '6px',
                          cursor: isBusy ? 'not-allowed' : 'pointer',
                          opacity: isBusy ? 0.6 : 1,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Dispatch
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px', borderTop: `1px solid ${colors.border}`,
            fontSize: '12px', color: colors.textSecondary,
          }}>
            <span>
              {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredList.length)} of {filteredList.length}
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                style={{
                  padding: '4px 10px', borderRadius: '6px', border: `1px solid ${colors.border}`,
                  background: '#fff', cursor: safePage === 1 ? 'not-allowed' : 'pointer',
                  color: safePage === 1 ? colors.textMuted : colors.textPrimary, fontSize: '12px',
                }}
              >
                ‹ Prev
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                style={{
                  padding: '4px 10px', borderRadius: '6px', border: `1px solid ${colors.border}`,
                  background: '#fff', cursor: safePage === totalPages ? 'not-allowed' : 'pointer',
                  color: safePage === totalPages ? colors.textMuted : colors.textPrimary, fontSize: '12px',
                }}
              >
                Next ›
              </button>
            </div>
          </div>
        )}
      </div>

    </PageShell>
  )
}
