import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserRole } from '@dom/shared'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'
import { colors } from '../theme'
import DelayBadge from '../components/DelayBadge'
import PageShell from '../components/shared/PageShell'
import StatCard from '../components/shared/StatCard'
import Avatar from '../components/shared/Avatar'
import PlatformBadge from '../components/shared/PlatformBadge'
import SectionHeader from '../components/shared/SectionHeader'

interface Order {
  id: string
  trackingNumber: string
  platform: string
  delayLevel: number
  priority: number
  createdAt: string
  scannedBy: { username: string }
}

interface Picker {
  id: string
  username: string
}

interface PickerStat {
  picker: { id: string; username: string }
  assigned: number
  completed: number
}

// ─── Per-picker stat card ────────────────────────────────────────────────────
function PickerStatCard({ stat }: { stat: PickerStat }) {
  const total = stat.assigned + stat.completed
  const pct = total > 0 ? Math.round((stat.assigned / total) * 100) : 0

  return (
    <div className="picker-stat-card">
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <Avatar username={stat.picker.username} size={32} />
        <span style={{ fontWeight: 600, fontSize: '14px', color: colors.textPrimary }}>
          {stat.picker.username}
        </span>
      </div>

      {/* Metrics row */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: colors.primary, lineHeight: 1 }}>
            {stat.assigned}
          </div>
          <div style={{ fontSize: '11px', color: colors.textMuted, fontWeight: 500, marginTop: '2px' }}>
            Assigned
          </div>
        </div>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: colors.success, lineHeight: 1 }}>
            {stat.completed}
          </div>
          <div style={{ fontSize: '11px', color: colors.textMuted, fontWeight: 500, marginTop: '2px' }}>
            Completed
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: '5px', borderRadius: '9999px', background: colors.border, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: 'linear-gradient(90deg, #3b82f6, #6366f1)',
          borderRadius: '9999px',
          transition: 'width 0.4s ease',
        }} />
      </div>
      <div style={{ fontSize: '11px', color: colors.textMuted, marginTop: '5px' }}>
        {pct}% of total pending assigned
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function PickerAdmin() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectedPickerId, setSelectedPickerId] = useState<string>('')

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
    refetchInterval: 5000,
  })

  // Pickers query
  const { data: pickers } = useQuery({
    queryKey: ['picker-admin-pickers'],
    queryFn: async () => {
      const res = await api.get<{ pickers: Picker[] }>('/picker-admin/pickers')
      return res.data.pickers
    },
  })

  // Stats query
  const { data: statsData } = useQuery({
    queryKey: ['picker-admin-stats'],
    queryFn: async () => {
      const res = await api.get<{ stats: PickerStat[] }>('/picker-admin/stats')
      return res.data.stats
    },
    refetchInterval: 5000,
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
      alert(msg)
    },
  })

  // Bulk assign mutation
  const bulkAssignMutation = useMutation({
    mutationFn: ({ orderIds, pickerId }: { orderIds: string[]; pickerId: string }) =>
      api.post('/picker-admin/bulk-assign', { orderIds, pickerId }),
    onSuccess: () => {
      setSelectedIds(new Set())
      invalidateAll()
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error ?? 'Bulk assign failed'
      alert(msg)
    },
  })

  const orderList = orders ?? []
  const pickerList = pickers ?? []
  const statsList = statsData ?? []

  const totalAssignedToday = statsList.reduce((sum, s) => sum + s.assigned, 0)

  // Select / deselect helpers
  const allSelected = orderList.length > 0 && orderList.every(o => selectedIds.has(o.id))
  const someSelected = selectedIds.size > 0

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(orderList.map(o => o.id)))
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
    if (!selectedPickerId) { alert('Please select a picker first'); return }
    if (selectedIds.size === 0) { alert('No orders selected'); return }
    bulkAssignMutation.mutate({ orderIds: Array.from(selectedIds), pickerId: selectedPickerId })
  }

  function handleAssignAll() {
    if (!selectedPickerId) { alert('Please select a picker first'); return }
    const allIds = orderList.map(o => o.id)
    if (allIds.length === 0) { alert('No orders to assign'); return }
    bulkAssignMutation.mutate({ orderIds: allIds, pickerId: selectedPickerId })
  }

  function handleAssignSingle(orderId: string) {
    if (!selectedPickerId) { alert('Please select a picker first'); return }
    assignMutation.mutate({ orderId, pickerId: selectedPickerId })
  }

  const isBusy = assignMutation.isPending || bulkAssignMutation.isPending

  // ─── Header stats ──────────────────────────────────────────────────────────
  const headerStats = (
    <>
      <StatCard label="Inbound" value={orderList.length} color={colors.primary} />
      <StatCard label="Assigned Today" value={totalAssignedToday} color={colors.success} />
      <StatCard label="Pickers" value={pickerList.length} color="#7c3aed" />
      {ordersLoading && (
        <span style={{ fontSize: '12px', color: colors.textMuted }}>Syncing...</span>
      )}
      {ordersError && (
        <span style={{ fontSize: '12px', color: colors.danger }}>Connection error</span>
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
      {/* Section heading */}
      <SectionHeader title="Inbound Orders" count={orderList.length} />

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

        {/* Right: picker dropdown + action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <select
            value={selectedPickerId}
            onChange={e => setSelectedPickerId(e.target.value)}
            className="styled-select"
            style={{ minWidth: '200px' }}
          >
            <option value="">Select a picker...</option>
            {pickerList.map(p => (
              <option key={p.id} value={p.id}>{p.username}</option>
            ))}
          </select>

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
        <div className="empty-state">
          <div className="empty-state-icon">⏳</div>
          <p className="empty-state-title">Loading orders...</p>
          <p className="empty-state-desc">Fetching inbound order list from the server.</p>
        </div>
      ) : ordersError ? (
        <div className="empty-state" style={{ borderColor: colors.dangerBorder }}>
          <div className="empty-state-icon">⚠️</div>
          <p className="empty-state-title" style={{ color: colors.danger }}>Failed to load orders</p>
          <p className="empty-state-desc">Please check your connection and try again.</p>
        </div>
      ) : orderList.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🎉</div>
          <p className="empty-state-title">All orders assigned!</p>
          <p className="empty-state-desc">No inbound orders are waiting for assignment.</p>
        </div>
      ) : (
        <div className="data-table-wrap">
          <table style={{ minWidth: '900px' }}>
            <thead>
              <tr>
                {/* Checkbox header */}
                <th style={{ width: 40, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    style={{ accentColor: colors.primary, cursor: 'pointer' }}
                  />
                </th>
                <th style={{ width: 40 }}>#</th>
                <th>Tracking Number</th>
                <th>Platform</th>
                <th>Delay</th>
                <th>Scanned At</th>
                <th>Scanned By</th>
                <th style={{ textAlign: 'center' }}>Priority</th>
                <th style={{ textAlign: 'center' }}>Assign</th>
              </tr>
            </thead>
            <tbody>
              {orderList.map((order, i) => {
                const isSelected = selectedIds.has(order.id)
                const delayClass =
                  order.delayLevel === 4 ? 'row-d4' :
                  order.delayLevel === 3 ? 'row-d3' :
                  order.delayLevel === 2 ? 'row-d2' : ''
                const rowClass = [isSelected ? 'row-selected' : delayClass].filter(Boolean).join(' ')

                return (
                  <tr key={order.id} className={rowClass}>
                    {/* Checkbox */}
                    <td style={{ textAlign: 'center', width: 40 }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(order.id)}
                        style={{ accentColor: colors.primary, cursor: 'pointer' }}
                      />
                    </td>

                    {/* Row number */}
                    <td style={{ color: '#9ca3af', width: 40 }}>{i + 1}</td>

                    {/* Tracking number */}
                    <td style={{ fontFamily: 'monospace', fontWeight: 600, letterSpacing: '0.03em' }}>
                      {order.trackingNumber}
                    </td>

                    {/* Platform badge */}
                    <td><PlatformBadge platform={order.platform} /></td>

                    {/* Delay badge */}
                    <td><DelayBadge level={order.delayLevel} /></td>

                    {/* Scanned at */}
                    <td style={{ color: '#6b7280', whiteSpace: 'nowrap' }}>
                      {new Date(order.createdAt).toLocaleString('en-GB', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </td>

                    {/* Scanned by */}
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#374151', fontWeight: 500 }}>
                        <Avatar username={order.scannedBy.username} size={24} />
                        {order.scannedBy.username}
                      </span>
                    </td>

                    {/* Priority */}
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: '13px', color: colors.priority(order.priority) }}>
                        {order.priority}
                      </span>
                    </td>

                    {/* Single assign */}
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
      )}

      {/* Picker performance section */}
      {statsList.length > 0 && (
        <div style={{ marginTop: '32px' }}>
          <SectionHeader title="Picker Performance" count={statsList.length} />
          <div className="stats-grid">
            {statsList.map(stat => (
              <PickerStatCard key={stat.picker.id} stat={stat} />
            ))}
          </div>
        </div>
      )}
    </PageShell>
  )
}
