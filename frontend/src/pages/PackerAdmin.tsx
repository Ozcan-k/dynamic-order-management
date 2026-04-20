import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'
import { colors } from '../theme'
import { getManilaDateString } from '../lib/manila'
import DelayBadge from '../components/DelayBadge'
import PageShell from '../components/shared/PageShell'
import StatCard from '../components/shared/StatCard'
import Avatar from '../components/shared/Avatar'
import PlatformBadge from '../components/shared/PlatformBadge'
import SectionHeader from '../components/shared/SectionHeader'
import SortableTh from '../components/shared/SortableTh'
import SlaHistoryModal from '../components/SlaHistoryModal'

type PackerSortKey = 'tracking' | 'platform' | 'carrier' | 'shop' | 'delay' | 'pickedBy' | 'arrivedAt'

// ─── Types ───────────────────────────────────────────────────────────────────

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
  pickerAssignments: Array<{
    completedAt: string | null
    picker: { username: string }
  }>
}

interface PackerStat {
  packer: { id: string; username: string }
  completed: number
  completedToday: number
}

interface PackerOrderRow {
  assignmentId: string
  completedAt: string | null
  id: string
  trackingNumber: string
  platform: string
  carrierName?: string | null
  shopName?: string | null
  status: string
  delayLevel: number
  priority: number
  createdAt: string
}

// ─── Packer orders modal ─────────────────────────────────────────────────────

function PackerOrdersModal({
  packer,
  onClose,
}: {
  packer: { id: string; username: string }
  onClose: () => void
}) {
  const [slaOrderId, setSlaOrderId] = useState<{ id: string; tracking: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['packer-orders-modal', packer.id],
    queryFn: async () => {
      const res = await api.get<{ orders: PackerOrderRow[] }>(`/packer-admin/packer/${packer.id}/orders`)
      return res.data.orders
    },
    refetchInterval: 10_000,
  })

  const orders = data ?? []

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '680px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden',
          maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '18px 24px', borderBottom: `1px solid ${colors.border}`,
        }}>
          <Avatar username={packer.username} size={36} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '15px', color: colors.textPrimary }}>
              {packer.username}
            </div>
            <div style={{ fontSize: '12px', color: colors.textMuted }}>
              {isLoading ? 'Loading...' : `${orders.length} completed order${orders.length !== 1 ? 's' : ''}`}
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

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {isLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: colors.textMuted, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              <span className="spinner spinner-sm" />
              Loading orders...
            </div>
          ) : orders.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📦</div>
              <div style={{ fontWeight: 600, color: colors.textPrimary, fontSize: '14px' }}>No completed orders</div>
              <div style={{ color: colors.textMuted, fontSize: '12px', marginTop: '4px' }}>This packer hasn't completed any orders yet.</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: `1px solid ${colors.border}` }}>
                  {['Tracking Number', 'Platform', 'Carrier', 'Shop', 'Delay', 'Completed At', ''].map(h => (
                    <th key={h} style={{
                      padding: '10px 16px', textAlign: 'left', fontSize: '11px',
                      fontWeight: 600, color: colors.textSecondary, textTransform: 'uppercase',
                      letterSpacing: '0.05em', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map(order => (
                  <tr key={order.assignmentId} style={{ borderBottom: `1px solid #f1f5f9` }}>
                    <td style={{ padding: '11px 16px', fontFamily: 'monospace', fontWeight: 600, fontSize: '12px' }}>
                      {order.trackingNumber}
                    </td>
                    <td style={{ padding: '11px 16px' }}>
                      <PlatformBadge platform={order.platform} />
                    </td>
                    <td style={{ padding: '11px 16px' }}>
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
                    <td style={{ padding: '11px 16px', fontSize: '13px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {order.shopName ?? <span style={{ color: '#d1d5db' }}>—</span>}
                    </td>
                    <td style={{ padding: '11px 16px' }}>
                      <DelayBadge level={order.delayLevel} />
                    </td>
                    <td style={{ padding: '11px 16px', color: colors.textSecondary, fontSize: '12px', whiteSpace: 'nowrap' }}>
                      {order.completedAt
                        ? new Date(order.completedAt).toLocaleString('en-GB', {
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila',
                          })
                        : '—'}
                    </td>
                    <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                      <button
                        onClick={() => setSlaOrderId({ id: order.id, tracking: order.trackingNumber })}
                        style={{
                          padding: '4px 10px', border: `1px solid ${colors.border}`,
                          borderRadius: '6px', background: '#fff', color: colors.textSecondary,
                          fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                        }}
                        title="View SLA escalation history"
                      >
                        SLA
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

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

// ─── Per-packer stat card ────────────────────────────────────────────────────

function PackerStatCard({ stat, onClick }: { stat: PackerStat; onClick: () => void }) {

  return (
    <div
      className="picker-stat-card"
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <Avatar username={stat.packer.username} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '13px', color: colors.textPrimary, lineHeight: 1.2 }}>
            {stat.packer.username}
          </div>
          <div style={{ fontSize: '11px', color: colors.textMuted, marginTop: '2px' }}>
            {stat.completedToday} packed today
          </div>
        </div>
        {stat.completedToday > 0 && (
          <span style={{
            background: '#d1fae5', color: '#065f46',
            borderRadius: '9999px', padding: '2px 8px',
            fontSize: '12px', fontWeight: 700, flexShrink: 0,
          }}>
            {stat.completedToday}
          </span>
        )}
      </div>

      {/* Status chip */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          background: '#d1fae5', color: '#065f46',
          borderRadius: '6px', padding: '4px 8px',
          fontSize: '11px', fontWeight: 600,
          opacity: stat.completedToday === 0 ? 0.45 : 1,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#059669', flexShrink: 0 }} />
          Done Today: {stat.completedToday}
        </div>
      </div>

      {stat.completedToday === 0 && (
        <div style={{ fontSize: '11px', color: colors.textMuted, marginTop: '8px', fontStyle: 'italic' }}>
          No orders packed yet
        </div>
      )}

    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 10

export default function PackerAdmin() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const [packerModal, setPackerModal] = useState<PackerStat | null>(null)
  const [completeTarget, setCompleteTarget] = useState<{ id: string; tracking: string } | null>(null)
  const [selectedPackerId, setSelectedPackerId] = useState<string>('')
  const [bulkPackerId, setBulkPackerId] = useState<string>('')
  const [removeTarget, setRemoveTarget] = useState<{ id: string; tracking: string } | null>(null)
  const [actionFeedback, setActionFeedback] = useState<{ type: 'error' | 'warning' | 'success'; message: string } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Sort + filter state (Phase C)
  const [sortKey, setSortKey] = useState<PackerSortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [platformFilter, setPlatformFilter] = useState<Set<string>>(new Set())
  const [delayFilter, setDelayFilter] = useState<Set<number>>(new Set())
  const [carrierFilter, setCarrierFilter] = useState('')
  const [shopFilter, setShopFilter] = useState('')

  // ── Queries ──────────────────────────────────────────────────────────────────
  const {
    data: orders,
    isLoading: ordersLoading,
    isError: ordersError,
  } = useQuery({
    queryKey: ['packer-admin-orders'],
    queryFn: async () => {
      const res = await api.get<{ orders: Order[] }>('/packer-admin/orders')
      return res.data.orders
    },
    refetchInterval: 10_000,
  })

  const { data: statsData } = useQuery({
    queryKey: ['packer-admin-stats'],
    queryFn: async () => {
      const res = await api.get<{ stats: PackerStat[]; totalCompleted: number; returnedCount: number }>('/packer-admin/stats')
      return res.data
    },
    staleTime: 0,
    refetchInterval: 10_000,
  })

  const { data: packersData } = useQuery({
    queryKey: ['packer-admin-packers'],
    queryFn: async () => {
      const res = await api.get<{ packers: { id: string; username: string }[] }>('/packer-admin/packers')
      return res.data.packers
    },
    staleTime: 60_000,
  })
  const packers = packersData ?? []

  const todayStr = getManilaDateString()
  const orderList = orders ?? []
  const carryoverCount = orderList.filter(o => getManilaDateString(new Date(o.workDate)) < todayStr).length
  const statsList = statsData?.stats ?? []
  const totalCompleted = statsData?.totalCompleted ?? 0
  const returnedCount = statsData?.returnedCount ?? 0

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['packer-admin-orders'] })
    queryClient.invalidateQueries({ queryKey: ['packer-admin-stats'] })
  }

  // ── Mutations ────────────────────────────────────────────────────────────────
  const completeMutation = useMutation({
    mutationFn: (vars: { orderId: string; packerId: string }) =>
      api.post('/packer-admin/complete', vars),
    onSuccess: () => {
      invalidateAll()
      setCompleteTarget(null)
      setSelectedPackerId('')
      setSearchQuery('')
      setCurrentPage(1)
      setActionFeedback({ type: 'success', message: 'Order marked as packed.' })
    },
    onError: (err: any) => {
      setCompleteTarget(null)
      setSelectedPackerId('')
      setActionFeedback({ type: 'error', message: err?.response?.data?.error ?? 'Complete failed' })
    },
  })

  const removeMutation = useMutation({
    mutationFn: (orderId: string) => api.post('/packer-admin/remove', { orderId }),
    onSuccess: () => {
      invalidateAll()
      setSearchQuery('')
      setCurrentPage(1)
      setActionFeedback({ type: 'success', message: 'Order returned and re-assigned to original picker.' })
    },
    onError: (err: any) => {
      setActionFeedback({ type: 'error', message: err?.response?.data?.error ?? 'Remove failed' })
    },
  })

  const [bulkConfirm, setBulkConfirm] = useState<null | 'complete' | 'remove'>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  const isBusy = completeMutation.isPending || removeMutation.isPending || bulkBusy

  // ── Search + Filters + Sort ──────────────────────────────────────────────────
  const trimmed = searchQuery.trim().toUpperCase()

  const availablePlatforms = useMemo(
    () => Array.from(new Set(orderList.map(o => o.platform))).sort(),
    [orderList],
  )

  const filteredList = useMemo(() => {
    let list = orderList
    if (trimmed) list = list.filter(o => o.trackingNumber.toUpperCase().includes(trimmed))
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
          case 'pickedBy':  return (a.pickerAssignments[0]?.picker.username ?? '').localeCompare(b.pickerAssignments[0]?.picker.username ?? '') * dir
          case 'arrivedAt': {
            const aTs = new Date(a.pickerAssignments[0]?.completedAt ?? a.createdAt).getTime()
            const bTs = new Date(b.pickerAssignments[0]?.completedAt ?? b.createdAt).getTime()
            return (aTs - bTs) * dir
          }
          default: return 0
        }
      })
      list = sorted
    }
    return list
  }, [orderList, trimmed, platformFilter, delayFilter, carrierFilter, shopFilter, sortKey, sortDir])

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
  function handleSort(key: PackerSortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const totalPages = Math.max(1, Math.ceil(filteredList.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const pagedOrders = filteredList.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const allSelected = filteredList.length > 0 && filteredList.every(o => selectedIds.has(o.id))
  const someSelected = selectedIds.size > 0

  function toggleAll() {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(filteredList.map(o => o.id)))
  }

  async function runBulk(action: 'complete' | 'remove') {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (action === 'complete' && !bulkPackerId) return
    setBulkBusy(true)
    let ok = 0
    let fail = 0
    const endpoint = action === 'complete' ? '/packer-admin/complete' : '/packer-admin/remove'
    for (const orderId of ids) {
      try {
        const body = action === 'complete' ? { orderId, packerId: bulkPackerId } : { orderId }
        await api.post(endpoint, body)
        ok++
      } catch {
        fail++
      }
    }
    setBulkBusy(false)
    setBulkConfirm(null)
    setBulkPackerId('')
    setSelectedIds(new Set())
    invalidateAll()
    setActionFeedback({
      type: fail === 0 ? 'success' : (ok === 0 ? 'error' : 'warning'),
      message:
        action === 'complete'
          ? `Packed ${ok} order${ok !== 1 ? 's' : ''}${fail > 0 ? `, ${fail} failed` : ''}.`
          : `Returned ${ok} order${ok !== 1 ? 's' : ''}${fail > 0 ? `, ${fail} failed` : ''}.`,
    })
  }

  function toggleOne(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function formatArrived(order: Order) {
    const ts = order.pickerAssignments[0]?.completedAt ?? order.createdAt
    return new Date(ts).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila',
    })
  }

  // ─── Header stats ─────────────────────────────────────────────────────────
  const headerStats = (
    <>
      <StatCard label="Waiting to Pack" value={orderList.length} color={colors.warning} />
      <StatCard label="Total Packed" value={totalCompleted} color={colors.success} />
      <StatCard label="Returned to Picker" value={returnedCount} color="#f59e0b" />
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

  const PackerAdminIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  )

  return (
    <PageShell
      icon={PackerAdminIcon}
      title="Packer Admin Panel"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
      stats={headerStats}
    >
      {/* Feedback banner */}
      {actionFeedback && (
        <div className={[
          'feedback-banner',
          actionFeedback.type === 'error' ? 'feedback-banner--error'
            : actionFeedback.type === 'warning' ? 'feedback-banner--warning'
            : 'feedback-banner--success',
        ].join(' ')} style={{ marginBottom: '16px' }}>
          {actionFeedback.message}
        </div>
      )}

      {/* Order search */}
      <div style={{
        background: '#fff', border: `1px solid ${colors.border}`, borderRadius: '10px',
        padding: '14px 16px', marginBottom: '12px',
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '380px' }}>
          <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search by tracking number..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1) }}
            style={{
              width: '100%', boxSizing: 'border-box',
              paddingLeft: '32px', paddingRight: searchQuery ? '32px' : '10px',
              paddingTop: '8px', paddingBottom: '8px',
              fontSize: '13px', border: `1px solid ${colors.border}`,
              borderRadius: '8px', outline: 'none', fontFamily: 'monospace',
              background: searchQuery ? '#fffbeb' : '#f8fafc',
              color: colors.textPrimary,
            }}
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setCurrentPage(1) }}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                color: colors.textMuted, display: 'flex', alignItems: 'center',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        {searchQuery && (
          <span style={{ fontSize: '12px', color: filteredList.length === 0 ? colors.danger : colors.textSecondary, fontWeight: 600 }}>
            {filteredList.length === 0 ? 'No orders found' : `${filteredList.length} match${filteredList.length !== 1 ? 'es' : ''}`}
          </span>
        )}
      </div>

      {/* Section heading */}
      <SectionHeader title="Orders Waiting to Pack" count={filteredList.length}>
        {(activeFilterCount > 0 || trimmed) && orderList.length !== filteredList.length && (
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: colors.textMuted }}>
            Orders arrive automatically when pickers complete them
          </span>
        </div>
      </div>

      {/* Order table */}
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
          <p className="empty-state-title">All packed!</p>
          <p className="empty-state-desc">No orders waiting in the packing queue.</p>
        </div>
      ) : (
        <>
          <div className="data-table-wrap">
            <table style={{ minWidth: '1100px' }}>
              <thead>
                <tr>
                  <th style={{ width: 40 }} />
                  <th style={{ width: 40 }}>#</th>
                  <SortableTh<PackerSortKey> label="Tracking Number" sortKey="tracking" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                  <SortableTh<PackerSortKey> label="Platform" sortKey="platform" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                  <SortableTh<PackerSortKey> label="Carrier" sortKey="carrier" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                  <SortableTh<PackerSortKey> label="Shop" sortKey="shop" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                  <SortableTh<PackerSortKey> label="Delay" sortKey="delay" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                  <SortableTh<PackerSortKey> label="Picked By" sortKey="pickedBy" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                  <SortableTh<PackerSortKey> label="Arrived At" sortKey="arrivedAt" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedOrders.map((order, i) => {
                  const globalIndex = (safePage - 1) * PAGE_SIZE + i + 1
                  const isSelected = selectedIds.has(order.id)
                  const delayClass =
                    order.delayLevel === 4 ? 'row-d4' :
                    order.delayLevel === 3 ? 'row-d3' :
                    order.delayLevel === 2 ? 'row-d2' : ''
                  const rowCls = isSelected ? 'row-selected' : delayClass

                  return (
                    <tr key={order.id} className={rowCls}>
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
                      <td>
                        {order.pickerAssignments[0]?.picker.username ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#374151', fontWeight: 500 }}>
                            <Avatar username={order.pickerAssignments[0].picker.username} size={24} />
                            {order.pickerAssignments[0].picker.username}
                          </span>
                        ) : (
                          <span style={{ color: colors.textMuted }}>—</span>
                        )}
                      </td>
                      <td style={{ color: '#6b7280', whiteSpace: 'nowrap' }}>
                        {formatArrived(order)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button
                            className="btn-assign"
                            onClick={() => setCompleteTarget({ id: order.id, tracking: order.trackingNumber })}
                            disabled={isBusy}
                            style={{ color: colors.success, borderColor: '#bbf7d0' }}
                          >
                            Complete
                          </button>
                          <button
                            className="btn-assign"
                            onClick={() => setRemoveTarget({ id: order.id, tracking: order.trackingNumber })}
                            disabled={isBusy}
                            style={{ color: colors.danger, borderColor: colors.dangerBorder }}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination-bar">
              <span className="pagination-info">
                Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredList.length)} of {filteredList.length} orders
              </span>
              <div className="pagination-controls">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                >
                  ← Prev
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={['pagination-page-btn', page === safePage ? 'pagination-page-btn--active' : ''].filter(Boolean).join(' ')}
                  >
                    {page}
                  </button>
                ))}
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

      {/* Packer workload section */}
      <div style={{ marginTop: '32px' }}>
        <SectionHeader title="Packer Workload" count={statsList.length} />
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
            <p className="empty-state-title">No packers found</p>
            <p className="empty-state-desc">Add packer users from the User Management panel.</p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '12px',
            marginTop: '12px',
          }}>
            {statsList.map((stat) => (
              <PackerStatCard
                key={stat.packer.id}
                stat={stat}
                onClick={() => setPackerModal(stat)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Complete confirmation dialog */}
      {completeTarget && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => { setCompleteTarget(null); setSelectedPackerId('') }}
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
                  Mark as Packed?
                </div>
                <div style={{ fontSize: '13px', color: colors.textSecondary, lineHeight: 1.5 }}>
                  This will mark the order as <strong>Packer Complete</strong> and send it to the outbound queue.
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
                marginBottom: '16px',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="3" width="15" height="13" rx="1" /><path d="M16 8h4l3 3v5h-7V8z" />
                  <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
                </svg>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '13px', color: colors.textPrimary }}>
                  {completeTarget.tracking}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                Packed by
              </div>
              <select
                value={selectedPackerId}
                onChange={(e) => setSelectedPackerId(e.target.value)}
                style={{
                  width: '100%', padding: '9px 12px',
                  border: `1px solid ${colors.border}`, borderRadius: '8px',
                  background: '#fff', fontSize: '13px', color: colors.textPrimary,
                  cursor: 'pointer',
                }}
              >
                <option value="" disabled>Select packer…</option>
                {packers.map((p) => (
                  <option key={p.id} value={p.id}>{p.username}</option>
                ))}
              </select>
            </div>
            <div style={{ padding: '16px 24px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setCompleteTarget(null); setSelectedPackerId('') }}
                style={{
                  padding: '9px 20px', border: `1px solid ${colors.border}`,
                  borderRadius: '8px', background: '#fff', color: colors.textSecondary,
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => completeMutation.mutate({ orderId: completeTarget.id, packerId: selectedPackerId })}
                disabled={completeMutation.isPending || !selectedPackerId}
                style={{
                  padding: '9px 20px', border: 'none',
                  borderRadius: '8px', background: '#16a34a', color: '#fff',
                  fontSize: '13px', fontWeight: 600,
                  cursor: (completeMutation.isPending || !selectedPackerId) ? 'not-allowed' : 'pointer',
                  opacity: (completeMutation.isPending || !selectedPackerId) ? 0.5 : 1,
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
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px', color: colors.textPrimary, marginBottom: '4px' }}>
                  Are you sure?
                </div>
                <div style={{ fontSize: '13px', color: colors.textSecondary, lineHeight: 1.5 }}>
                  This order will be <strong>returned and re-assigned</strong> to the original picker.
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
                  {removeTarget.tracking}
                </span>
              </div>
            </div>
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
                onClick={() => { removeMutation.mutate(removeTarget.id); setRemoveTarget(null) }}
                disabled={removeMutation.isPending}
                style={{
                  padding: '9px 20px', border: 'none',
                  borderRadius: '8px', background: colors.danger, color: '#fff',
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  opacity: removeMutation.isPending ? 0.7 : 1,
                }}
              >
                Yes, Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Packer orders modal */}
      {packerModal && (
        <PackerOrdersModal
          packer={packerModal.packer}
          onClose={() => setPackerModal(null)}
        />
      )}

      {/* Sticky bulk action bar */}
      {someSelected && (
        <div className="bulk-action-bar" role="region" aria-label="Bulk actions">
          <span className="bulk-action-bar-count">
            <span className="bulk-action-bar-count-pill">{selectedIds.size}</span>
            order{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <span className="bulk-action-bar-spacer" />
          <button
            type="button"
            className="bulk-action-bar-btn bulk-action-bar-btn--success"
            onClick={() => setBulkConfirm('complete')}
            disabled={isBusy}
          >
            Complete
          </button>
          <button
            type="button"
            className="bulk-action-bar-btn bulk-action-bar-btn--danger"
            onClick={() => setBulkConfirm('remove')}
            disabled={isBusy}
          >
            Remove
          </button>
          <button
            type="button"
            className="bulk-action-bar-btn bulk-action-bar-btn--ghost"
            onClick={() => setSelectedIds(new Set())}
            disabled={bulkBusy}
          >
            Clear
          </button>
        </div>
      )}

      {/* Bulk confirmation dialog */}
      {bulkConfirm && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => { if (!bulkBusy) { setBulkConfirm(null); setBulkPackerId('') } }}
        >
          <div
            style={{
              background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '460px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.25)', overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              background: bulkConfirm === 'complete'
                ? 'linear-gradient(135deg, #f0fdf4, #f7fef9)'
                : 'linear-gradient(135deg, #fef2f2, #fff5f5)',
              padding: '24px 24px 20px',
              borderBottom: `1px solid ${bulkConfirm === 'complete' ? '#bbf7d0' : colors.dangerBorder}`,
              display: 'flex', alignItems: 'flex-start', gap: '14px',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: '12px', flexShrink: 0,
                background: bulkConfirm === 'complete' ? '#dcfce7' : '#fee2e2',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {bulkConfirm === 'complete' ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={colors.danger} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                )}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px', color: colors.textPrimary, marginBottom: '4px' }}>
                  {bulkConfirm === 'complete' ? `Mark ${selectedIds.size} orders as packed?` : `Return ${selectedIds.size} orders to pickers?`}
                </div>
                <div style={{ fontSize: '13px', color: colors.textSecondary, lineHeight: 1.5 }}>
                  {bulkConfirm === 'complete'
                    ? 'Each order will be marked Packer Complete and sent to the outbound queue.'
                    : 'Each order will be re-assigned to its original picker.'}
                </div>
              </div>
            </div>
            {bulkConfirm === 'complete' && (
              <div style={{ padding: '16px 24px', background: '#fafafa', borderBottom: `1px solid ${colors.border}` }}>
                <div style={{ fontSize: '11px', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                  Packed by
                </div>
                <select
                  value={bulkPackerId}
                  onChange={(e) => setBulkPackerId(e.target.value)}
                  style={{
                    width: '100%', padding: '9px 12px',
                    border: `1px solid ${colors.border}`, borderRadius: '8px',
                    background: '#fff', fontSize: '13px', color: colors.textPrimary,
                    cursor: 'pointer',
                  }}
                >
                  <option value="" disabled>Select packer…</option>
                  {packers.map((p) => (
                    <option key={p.id} value={p.id}>{p.username}</option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ padding: '16px 24px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setBulkConfirm(null); setBulkPackerId('') }}
                disabled={bulkBusy}
                style={{
                  padding: '9px 20px', border: `1px solid ${colors.border}`,
                  borderRadius: '8px', background: '#fff', color: colors.textSecondary,
                  fontSize: '13px', fontWeight: 600, cursor: bulkBusy ? 'not-allowed' : 'pointer',
                  opacity: bulkBusy ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => runBulk(bulkConfirm)}
                disabled={bulkBusy || (bulkConfirm === 'complete' && !bulkPackerId)}
                style={{
                  padding: '9px 20px', border: 'none',
                  borderRadius: '8px',
                  background: bulkConfirm === 'complete' ? '#16a34a' : colors.danger,
                  color: '#fff',
                  fontSize: '13px', fontWeight: 600,
                  cursor: (bulkBusy || (bulkConfirm === 'complete' && !bulkPackerId)) ? 'not-allowed' : 'pointer',
                  opacity: (bulkBusy || (bulkConfirm === 'complete' && !bulkPackerId)) ? 0.5 : 1,
                }}
              >
                {bulkBusy
                  ? 'Working...'
                  : (bulkConfirm === 'complete' ? `Yes, pack ${selectedIds.size}` : `Yes, remove ${selectedIds.size}`)}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
