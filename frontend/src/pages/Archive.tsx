import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'
import { colors } from '../theme'
import PageShell from '../components/shared/PageShell'
import StatCard from '../components/shared/StatCard'
import SectionHeader from '../components/shared/SectionHeader'
import PlatformBadge from '../components/shared/PlatformBadge'
import ConfirmDialog from '../components/ConfirmDialog'

interface ArchivedOrder {
  id: string
  trackingNumber: string
  platform: string
  carrierName?: string | null
  shopName?: string | null
  status: string
  archivedAt: string
  workDate: string
  slaCompletedAt?: string | null
  expiresAt: string
  daysUntilExpiry: number
}

interface ArchiveListResponse {
  orders: ArchivedOrder[]
  total: number
  page: number
  pageSize: number
}

interface ArchiveStats {
  total: number
  expiring30: number
  expiring7: number
}

const PAGE_SIZE = 25

const ArchiveIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="21 8 21 21 3 21 3 8" />
    <rect x="1" y="3" width="22" height="5" rx="1" />
    <line x1="10" y1="12" x2="14" y2="12" />
  </svg>
)

function ExpiryBadge({ days }: { days: number }) {
  const color = days <= 7 ? colors.danger : days <= 30 ? '#d97706' : colors.success
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '9999px',
      fontSize: '11px', fontWeight: 700, color: '#fff', background: color,
      whiteSpace: 'nowrap',
    }}>
      {days}d
    </span>
  )
}

export default function Archive() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [platform, setPlatform] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [expiresWithin, setExpiresWithin] = useState('')

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showTriggerConfirm, setShowTriggerConfirm] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const queryParams = {
    page,
    pageSize: PAGE_SIZE,
    ...(search ? { search } : {}),
    ...(platform ? { platform } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(expiresWithin ? { expiresWithin } : {}),
  }

  const { data, isLoading } = useQuery({
    queryKey: ['archive-orders', queryParams],
    queryFn: async () => {
      const params = new URLSearchParams(
        Object.entries(queryParams).map(([k, v]) => [k, String(v)])
      )
      const res = await api.get<ArchiveListResponse>(`/archive?${params}`)
      return res.data
    },
  })

  const { data: statsData } = useQuery({
    queryKey: ['archive-stats'],
    queryFn: async () => (await api.get<ArchiveStats>('/archive/stats')).data,
    refetchInterval: 30_000,
  })

  const triggerMutation = useMutation({
    mutationFn: () => api.post<{ archived: number }>('/archive/trigger'),
    onSuccess: (res) => {
      const count = res.data.archived
      setFeedback({ type: 'success', message: `${count} order${count !== 1 ? 's' : ''} archived successfully.` })
      queryClient.invalidateQueries({ queryKey: ['archive-orders'] })
      queryClient.invalidateQueries({ queryKey: ['archive-stats'] })
      setShowTriggerConfirm(false)
    },
    onError: (err: any) => {
      setFeedback({ type: 'error', message: err?.response?.data?.error ?? 'Archive failed' })
      setShowTriggerConfirm(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (orderIds: string[]) => api.post<{ deleted: number }>('/archive/bulk-delete', { orderIds }),
    onSuccess: (res) => {
      const count = res.data.deleted
      setFeedback({ type: 'success', message: `${count} order${count !== 1 ? 's' : ''} permanently deleted.` })
      setSelectedIds(new Set())
      setShowDeleteConfirm(false)
      queryClient.invalidateQueries({ queryKey: ['archive-orders'] })
      queryClient.invalidateQueries({ queryKey: ['archive-stats'] })
    },
    onError: (err: any) => {
      setFeedback({ type: 'error', message: err?.response?.data?.error ?? 'Delete failed' })
      setShowDeleteConfirm(false)
    },
  })

  const orders = data?.orders ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const allSelected = orders.length > 0 && orders.every(o => selectedIds.has(o.id))
  const someSelected = selectedIds.size > 0

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(orders.map(o => o.id)))
    }
  }

  function toggleOne(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const stats = statsData ?? { total: 0, expiring30: 0, expiring7: 0 }

  const headerStats = (
    <>
      <StatCard label="Total Archived" value={stats.total} color={colors.primary} />
      <StatCard label="Expiring in 30d" value={stats.expiring30} color="#d97706" subtitle="Approaching limit" />
      <StatCard label="Expiring in 7d" value={stats.expiring7} color={colors.danger} subtitle="Needs attention" />
      <button
        className="btn btn-outline"
        onClick={() => setShowTriggerConfirm(true)}
        disabled={triggerMutation.isPending}
        style={{ marginLeft: '8px', whiteSpace: 'nowrap' }}
      >
        Archive OUTBOUND Now
      </button>
    </>
  )

  return (
    <PageShell
      icon={<ArchiveIcon />}
      title="Archive"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
      stats={headerStats}
    >
      {feedback && (
        <div
          className={['feedback-banner', feedback.type === 'error' ? 'feedback-banner--error' : 'feedback-banner--success'].join(' ')}
          style={{ marginBottom: '16px' }}
        >
          {feedback.message}
          <button
            onClick={() => setFeedback(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700, fontSize: '14px', padding: '0 4px' }}
          >×</button>
        </div>
      )}

      {/* Filters */}
      <div style={{
        background: '#fff', border: `1px solid ${colors.border}`,
        borderRadius: 12, padding: '14px 16px',
        display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end',
        marginBottom: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        {/* Search */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Tracking No
          </label>
          <div style={{ position: 'relative' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              className="scan-input"
              placeholder="Search..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              style={{ paddingLeft: 28, minWidth: 160 }}
            />
          </div>
        </div>

        {/* Platform */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Platform
          </label>
          <select
            className="scan-input"
            value={platform}
            onChange={e => { setPlatform(e.target.value); setPage(1) }}
            style={{ minWidth: 130 }}
          >
            <option value="">All Platforms</option>
            <option value="SHOPEE">Shopee</option>
            <option value="LAZADA">Lazada</option>
            <option value="TIKTOK">TikTok</option>
            <option value="DIRECT">Direct</option>
            <option value="OTHER">Other</option>
          </select>
        </div>

        {/* Date range */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Archive Date Range
            </label>
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); setPage(1) }}
                style={{ background: 'none', border: 'none', fontSize: 10, fontWeight: 700, color: colors.danger, cursor: 'pointer', padding: '0 0 0 8px' }}
              >
                Clear ×
              </button>
            )}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center',
            background: '#f8fafc', border: `1px solid ${(dateFrom || dateTo) ? '#93c5fd' : colors.border}`,
            borderRadius: 8, overflow: 'hidden',
            transition: 'border-color 0.15s',
          }}>
            {/* Calendar icon */}
            <span style={{ padding: '0 8px 0 10px', color: (dateFrom || dateTo) ? '#3b82f6' : colors.textMuted, display: 'flex', alignItems: 'center' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(1) }}
              style={{
                border: 'none', background: 'transparent', padding: '7px 4px',
                fontSize: 13, color: dateFrom ? colors.textPrimary : colors.textMuted,
                outline: 'none', cursor: 'pointer', width: 130,
              }}
            />
            <span style={{ padding: '0 6px', color: colors.textMuted, fontSize: 12, fontWeight: 600 }}>→</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={e => { setDateTo(e.target.value); setPage(1) }}
              style={{
                border: 'none', background: 'transparent', padding: '7px 4px',
                fontSize: 13, color: dateTo ? colors.textPrimary : colors.textMuted,
                outline: 'none', cursor: 'pointer', width: 130,
              }}
            />
          </div>
          {/* Quick presets */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { label: '7d', days: 7 },
              { label: '30d', days: 30 },
              { label: '90d', days: 90 },
            ].map(({ label, days }) => {
              const from = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10)
              const to = new Date().toISOString().slice(0, 10)
              const active = dateFrom === from && dateTo === to
              return (
                <button
                  key={label}
                  onClick={() => { setDateFrom(from); setDateTo(to); setPage(1) }}
                  style={{
                    padding: '2px 8px', fontSize: 10, fontWeight: 700, borderRadius: 5, cursor: 'pointer',
                    border: `1px solid ${active ? '#3b82f6' : colors.border}`,
                    background: active ? '#eff6ff' : '#fff',
                    color: active ? '#1d4ed8' : colors.textSecondary,
                  }}
                >
                  Last {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Expiry */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Retention
          </label>
          <select
            className="scan-input"
            value={expiresWithin}
            onChange={e => { setExpiresWithin(e.target.value); setPage(1) }}
            style={{ minWidth: 150 }}
          >
            <option value="">All</option>
            <option value="7">Expiring in 7d</option>
            <option value="14">Expiring in 14d</option>
            <option value="30">Expiring in 30d</option>
            <option value="60">Expiring in 60d</option>
          </select>
        </div>

        {/* Clear all */}
        {(search || platform || dateFrom || dateTo || expiresWithin) && (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 4 }}>
            <div style={{ height: 14 }} />
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setSearch(''); setPlatform(''); setDateFrom(''); setDateTo(''); setExpiresWithin(''); setPage(1) }}
              style={{ whiteSpace: 'nowrap' }}
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>

      <SectionHeader title="Archived Orders" count={total}>
        {someSelected && (
          <button
            className="btn btn-sm"
            style={{ background: colors.danger, color: '#fff', border: 'none' }}
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete Selected ({selectedIds.size})
          </button>
        )}
      </SectionHeader>

      {isLoading ? (
        <div className="loading-state"><span className="spinner spinner-lg" /><span>Loading archive...</span></div>
      ) : orders.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" rx="1" /><line x1="10" y1="12" x2="14" y2="12" />
            </svg>
          </div>
          <p className="empty-state-title">No archived orders</p>
          <p className="empty-state-desc">Archived orders will appear here after the daily 7 PM archive job runs.</p>
        </div>
      ) : (
        <div className="data-table-wrap">
          <table style={{ minWidth: '1000px' }}>
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    style={{ accentColor: colors.primary, cursor: 'pointer' }}
                  />
                </th>
                <th style={{ width: 40 }}>#</th>
                <th>Tracking Number</th>
                <th>Platform</th>
                <th>Carrier</th>
                <th>Shop</th>
                <th>Work Date</th>
                <th>Archived At</th>
                <th>Expires In</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order, i) => {
                const isSelected = selectedIds.has(order.id)
                const globalIndex = (page - 1) * PAGE_SIZE + i + 1
                return (
                  <tr key={order.id} className={isSelected ? 'row-selected' : ''}>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(order.id)}
                        style={{ accentColor: colors.primary, cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ color: '#9ca3af' }}>{globalIndex}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600, letterSpacing: '0.03em' }}>{order.trackingNumber}</td>
                    <td><PlatformBadge platform={order.platform} /></td>
                    <td>
                      {order.carrierName ? (
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '9999px', fontSize: '11px', fontWeight: 600, background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0' }}>
                          {order.carrierName.replace(/_/g, ' ')}
                        </span>
                      ) : <span style={{ color: '#d1d5db' }}>—</span>}
                    </td>
                    <td style={{ fontSize: '13px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {order.shopName ?? <span style={{ color: '#d1d5db' }}>—</span>}
                    </td>
                    <td style={{ color: '#6b7280', whiteSpace: 'nowrap' }}>
                      {new Date(order.workDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Manila' })}
                    </td>
                    <td style={{ color: '#6b7280', whiteSpace: 'nowrap' }}>
                      {new Date(order.archivedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' })}
                    </td>
                    <td><ExpiryBadge days={order.daysUntilExpiry} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="pagination-bar">
          <span className="pagination-info">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} archived orders
          </span>
          <div className="pagination-controls">
            <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i
              return (
                <button key={p} onClick={() => setPage(p)} className={['pagination-page-btn', p === page ? 'pagination-page-btn--active' : ''].filter(Boolean).join(' ')}>{p}</button>
              )
            })}
            <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next →</button>
          </div>
        </div>
      )}

      {showTriggerConfirm && (
        <ConfirmDialog
          message="This will archive all currently OUTBOUND orders for your tenant. This normally runs automatically at 7:00 PM. Proceed?"
          confirmLabel="Archive Now"
          variant="primary"
          onConfirm={() => triggerMutation.mutate()}
          onCancel={() => setShowTriggerConfirm(false)}
        />
      )}

      {showDeleteConfirm && (
        <ConfirmDialog
          message={`You are about to permanently delete ${selectedIds.size} archived order${selectedIds.size !== 1 ? 's' : ''}. This action cannot be undone. All history records will also be deleted. Are you sure?`}
          confirmLabel={`Delete ${selectedIds.size} Order${selectedIds.size !== 1 ? 's' : ''}`}
          variant="danger"
          onConfirm={() => deleteMutation.mutate(Array.from(selectedIds))}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </PageShell>
  )
}
