import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserRole } from '@dom/shared'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'
import { connectSocket } from '../lib/socket'
import { colors } from '../theme'
import ScanInput from '../components/ScanInput'
import BulkScanModal from '../components/BulkScanModal'
import QuickScanModal from '../components/QuickScanModal'
import OrderTable from '../components/OrderTable'
import PageShell from '../components/shared/PageShell'
import StatCard from '../components/shared/StatCard'
import SectionHeader from '../components/shared/SectionHeader'

interface Order {
  id: string
  trackingNumber: string
  platform: string
  carrierName?: string | null
  shopName?: string | null
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
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkInitialTNs, setBulkInitialTNs] = useState<string[] | undefined>(undefined)
  const [bulkFeedback, setBulkFeedback] = useState<{ created: number; duplicates: string[] } | null>(null)
  const [pendingScan, setPendingScan] = useState<string | null>(null)
  const [lastCarrier, setLastCarrier] = useState(() => localStorage.getItem('quickScan_carrier') ?? '')
  const [lastShop, setLastShop] = useState(() => localStorage.getItem('quickScan_shop') ?? '')

  const canDelete =
    user?.role === UserRole.ADMIN || user?.role === UserRole.INBOUND_ADMIN

  // On mount: check Redis-backed pending handheld scans (catches events sent before page opened)
  useEffect(() => {
    api.get<{ single: string | null; bulk: string[] | null }>('/orders/pending-handheld')
      .then(res => {
        if (res.data.bulk && res.data.bulk.length > 0) {
          setBulkInitialTNs(res.data.bulk)
          setShowBulkModal(true)
        } else if (res.data.single) {
          setPendingScan(res.data.single)
        }
      })
      .catch(() => {})
  }, [])

  // Real-time: handheld single scan → open QuickScanModal on desktop
  // Real-time: handheld bulk scan → open BulkScanModal pre-filled on desktop
  useEffect(() => {
    const socket = connectSocket()
    socket.on('order:handheld-scan', (data: { trackingNumber: string }) => {
      // Clear any Redis-backed pending so it's not shown twice on next page load
      api.get('/orders/pending-handheld').catch(() => {})
      setPendingScan(data.trackingNumber)
    })
    socket.on('order:handheld-bulk-scan', (data: { trackingNumbers: string[] }) => {
      // Clear any Redis-backed pending so it's not shown twice on next page load
      api.get('/orders/pending-handheld').catch(() => {})
      setBulkInitialTNs(data.trackingNumbers)
      setShowBulkModal(true)
    })
    return () => {
      socket.off('order:handheld-scan')
      socket.off('order:handheld-bulk-scan')
    }
  }, [])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const res = await api.get<{ orders: Order[] }>('/orders')
      return res.data.orders
    },
    refetchInterval: 10_000,
  })

  const { data: statsData } = useQuery({
    queryKey: ['orders-stats'],
    queryFn: async () => {
      const res = await api.get<{ totalScanned: number; pendingInbound: number; delayBreakdown: number[] }>('/orders/stats')
      return res.data
    },
    refetchInterval: 10_000,
  })

  const scanMutation = useMutation({
    mutationFn: (payload: { trackingNumber: string; carrierName?: string; shopName?: string }) =>
      api.post('/orders/scan', payload),
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
        onScan={(tn) => {
          setScanFeedback(null)
          const normalized = tn.trim().toUpperCase()
          const alreadyInList = allOrders.some(o => o.trackingNumber.toUpperCase() === normalized)
          if (alreadyInList) {
            setScanFeedback({ type: 'error', message: `Already in inbound list: ${tn}` })
            return
          }
          setPendingScan(tn)
        }}
        disabled={scanMutation.isPending}
      />

      {pendingScan && (
        <QuickScanModal
          trackingNumber={pendingScan}
          initialCarrier={lastCarrier}
          initialShop={lastShop}
          onConfirm={(carrier, shop) => {
            localStorage.setItem('quickScan_carrier', carrier)
            localStorage.setItem('quickScan_shop', shop)
            setLastCarrier(carrier)
            setLastShop(shop)
            const tn = pendingScan
            setPendingScan(null)
            scanMutation.mutate({ trackingNumber: tn, carrierName: carrier, shopName: shop })
          }}
          onCancel={() => setPendingScan(null)}
        />
      )}


      {bulkFeedback && (
        <div
          className={[
            'feedback-banner',
            bulkFeedback.duplicates.length > 0 ? 'feedback-banner--error' : 'feedback-banner--success',
          ].join(' ')}
          style={{ marginBottom: '16px' }}
        >
          {bulkFeedback.duplicates.length === 0
            ? `Bulk scan complete — ${bulkFeedback.created} order${bulkFeedback.created !== 1 ? 's' : ''} created.`
            : `${bulkFeedback.created} order${bulkFeedback.created !== 1 ? 's' : ''} created. Duplicates skipped: ${bulkFeedback.duplicates.join(', ')}`
          }
          <button
            onClick={() => setBulkFeedback(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700, fontSize: '14px', padding: '0 4px' }}
          >
            ×
          </button>
        </div>
      )}

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
      {showBulkModal && (
        <BulkScanModal
          initialTrackingNumbers={bulkInitialTNs}
          onClose={() => { setShowBulkModal(false); setBulkInitialTNs(undefined) }}
          onSuccess={(created, duplicates) => {
            setShowBulkModal(false)
            setBulkInitialTNs(undefined)
            setBulkFeedback({ created, duplicates })
            queryClient.invalidateQueries({ queryKey: ['orders'] })
            queryClient.invalidateQueries({ queryKey: ['orders-stats'] })
          }}
        />
      )}
    </PageShell>
  )
}
