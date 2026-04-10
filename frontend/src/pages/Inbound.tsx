import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserRole } from '@dom/shared'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'
import ScanInput from '../components/ScanInput'
import OrderTable from '../components/OrderTable'

interface Order {
  id: string
  trackingNumber: string
  platform: string
  delayLevel: number
  createdAt: string
  scannedBy: { username: string }
}

export default function Inbound() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

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

  const total = data?.length ?? 0
  const counts = [0, 1, 2, 3, 4].map(level => ({
    level,
    count: data?.filter(o => o.delayLevel === level).length ?? 0,
  }))

  const DELAY_COLORS = ['#64748b', '#eab308', '#f97316', '#ef4444', '#991b1b']

  return (
    <div style={{ minHeight: '100vh', width: '100%', background: '#f1f5f9', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
        <div className="inbound-header-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            <span style={{ fontSize: '20px' }}>📦</span>
            <div>
              <h1 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                Inbound Panel
              </h1>
              <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>
                {user?.username} · {user?.role?.replace(/_/g, ' ')}
              </p>
            </div>
          </div>

          <div className="inbound-header-stats">
            <StatCard label="Total" value={total} color="#3b82f6" />
            {counts.map(({ level, count }) => (
              <StatCard key={level} label={`D${level}`} value={count} color={DELAY_COLORS[level]} />
            ))}
            {isLoading && <span style={{ fontSize: '12px', color: '#94a3b8' }}>Syncing...</span>}
            {isError && <span style={{ fontSize: '12px', color: '#ef4444' }}>Connection error</span>}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="inbound-body" style={{ flex: 1 }}>
        <ScanInput
          onScan={(tn) => scanMutation.mutate(tn)}
          disabled={scanMutation.isPending}
        />

        <div className="inbound-section-header">
          <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
            Pending Orders
            {total > 0 && (
              <span style={{
                marginLeft: '10px', background: '#e0e7ff', color: '#4f46e5',
                fontSize: '12px', fontWeight: 700, padding: '2px 10px', borderRadius: '9999px',
              }}>
                {total}
              </span>
            )}
          </h2>
        </div>

        <OrderTable
          orders={data ?? []}
          canDelete={canDelete}
          onDelete={(id) => deleteMutation.mutate(id)}
        />
      </div>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: '#f8fafc', border: '1px solid #e2e8f0',
      borderRadius: '8px', padding: '6px 14px', textAlign: 'center', minWidth: '80px',
    }}>
      <div style={{ fontSize: '18px', fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 500 }}>{label}</div>
    </div>
  )
}
