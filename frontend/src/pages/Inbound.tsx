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

  const scanMutation = useMutation({
    mutationFn: (trackingNumber: string) =>
      api.post('/orders/scan', { trackingNumber }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error ?? 'Scan error'
      alert(msg)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/orders/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error ?? 'Delete failed'
      alert(msg)
    },
  })

  const allOrders = data ?? []
  const total = allOrders.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const pagedOrders = allOrders.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const counts = [0, 1, 2, 3, 4].map(level => ({
    level,
    count: allOrders.filter(o => o.delayLevel === level).length,
  }))

  // Header stats
  const headerStats = (
    <>
      <StatCard label="Total" value={total} color={colors.primary} />
      {counts.map(({ level, count }) => (
        <StatCard key={level} label={`D${level}`} value={count} color={colors.delay[level]} />
      ))}
      {isLoading && <span style={{ fontSize: '12px', color: colors.textMuted }}>Syncing...</span>}
      {isError && <span style={{ fontSize: '12px', color: colors.danger }}>Connection error</span>}
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
        onScan={(tn) => scanMutation.mutate(tn)}
        disabled={scanMutation.isPending}
      />

      <SectionHeader title="Pending Orders" count={total} />

      <OrderTable
        orders={pagedOrders}
        canDelete={canDelete}
        onDelete={(id) => deleteMutation.mutate(id)}
      />

      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: '12px', padding: '0 4px',
        }}>
          <span style={{ fontSize: '12px', color: colors.textMuted }}>
            Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, total)} of {total} orders
          </span>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={safePage === 1}
              style={{
                padding: '5px 12px', border: `1px solid ${colors.border}`,
                borderRadius: '6px', background: '#fff', color: colors.textSecondary,
                fontSize: '12px', fontWeight: 600, cursor: safePage === 1 ? 'not-allowed' : 'pointer',
                opacity: safePage === 1 ? 0.4 : 1,
              }}
            >
              ← Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                style={{
                  width: 32, height: 32, borderRadius: '6px', border: 'none',
                  cursor: 'pointer', fontSize: '12px', fontWeight: page === safePage ? 700 : 400,
                  background: page === safePage ? colors.primary : 'transparent',
                  color: page === safePage ? '#fff' : colors.textSecondary,
                  transition: 'all 0.15s',
                }}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              style={{
                padding: '5px 12px', border: `1px solid ${colors.border}`,
                borderRadius: '6px', background: '#fff', color: colors.textSecondary,
                fontSize: '12px', fontWeight: 600, cursor: safePage === totalPages ? 'not-allowed' : 'pointer',
                opacity: safePage === totalPages ? 0.4 : 1,
              }}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </PageShell>
  )
}
