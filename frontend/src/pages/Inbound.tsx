import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserRole } from '@dom/shared'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'
import { colors } from '../theme'
import ScanInput from '../components/ScanInput'
import OrderTable from '../components/OrderTable'
import PageShell from '../components/shared/PageShell'
import StatCard from '../components/shared/StatCard'
import SectionHeader from '../components/shared/SectionHeader'

interface Order {
  id: string
  trackingNumber: string
  platform: string
  delayLevel: number
  createdAt: string
  scannedBy: { username: string }
}

const PAGE_SIZE = 25

export default function Inbound() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [currentPage, setCurrentPage] = useState(1)
  const [scanFeedback, setScanFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null)

  const canDelete =
    user?.role === UserRole.ADMIN || user?.role === UserRole.INBOUND_ADMIN

  const { data, isLoading, isError } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const res = await api.get<{ orders: Order[] }>('/orders')
      return res.data.orders
    },
    refetchInterval: 5000,
  })

  const { data: statsData } = useQuery({
    queryKey: ['orders-stats'],
    queryFn: async () => {
      const res = await api.get<{ totalScanned: number; pendingInbound: number; delayBreakdown: number[] }>('/orders/stats')
      return res.data
    },
    refetchInterval: 5000,
  })

  const scanMutation = useMutation({
    mutationFn: (trackingNumber: string) =>
      api.post('/orders/scan', { trackingNumber }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['orders-stats'] })
      setScanFeedback(null)
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error ?? 'Scan error'
      setScanFeedback({ type: 'error', message: msg })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/orders/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['orders-stats'] })
      queryClient.invalidateQueries({ queryKey: ['picker-admin-orders'] })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error ?? 'Delete failed'
      setScanFeedback({ type: 'error', message: msg })
    },
  })

  const allOrders = data ?? []
  const pending = allOrders.length
  const totalScanned = statsData?.totalScanned ?? pending
  const totalPages = Math.max(1, Math.ceil(pending / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const pagedOrders = allOrders.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  // Header stats
  const headerStats = (
    <>
      <StatCard label="Inbound" value={totalScanned} color={colors.primary} />
      {isLoading && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: colors.textMuted }}>
          <span className="spinner spinner-sm" />
          Syncing
        </span>
      )}
      {isError && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: colors.danger, fontWeight: 600 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Connection error
        </span>
      )}
    </>
  )

  const InboundIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="8 17 12 21 16 17" />
      <line x1="12" y1="3" x2="12" y2="21" />
      <rect x="3" y="3" width="18" height="4" rx="1" />
    </svg>
  )

  return (
    <PageShell
      icon={InboundIcon}
      title="Inbound Panel"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
      stats={headerStats}
    >
      <ScanInput
        onScan={(tn) => { setScanFeedback(null); scanMutation.mutate(tn) }}
        disabled={scanMutation.isPending}
      />

      {scanFeedback && (
        <div
          className={[
            'feedback-banner',
            scanFeedback.type === 'error' ? 'feedback-banner--error' : 'feedback-banner--success',
          ].join(' ')}
          style={{ marginBottom: '16px', marginTop: '-8px' }}
        >
          {scanFeedback.message}
          <button
            onClick={() => setScanFeedback(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700, fontSize: '14px', padding: '0 4px' }}
          >
            ×
          </button>
        </div>
      )}

      <SectionHeader title="Pending Orders" count={pending} />

      <OrderTable
        orders={pagedOrders}
        canDelete={canDelete}
        onDelete={(id) => deleteMutation.mutate(id)}
      />

      {totalPages > 1 && (
        <div className="pagination-bar">
          <span className="pagination-info">
            Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, pending)} of {pending} orders
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
    </PageShell>
  )
}
