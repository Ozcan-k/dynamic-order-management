import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import { getSocket } from '../../lib/socket'
import { colors } from '../../theme'
import { formatManilaDateTime } from '../../lib/manila'
import DelayBadge from '../DelayBadge'
import PlatformBadge from './PlatformBadge'
import { getCarrierStyle, getCarrierLabel } from './carrierStyle'

export type CarrierStage = 'picker' | 'packer'

interface CarrierOrderRow {
  id: string
  trackingNumber: string
  platform: string
  shopName: string | null
  status: string
  delayLevel: number
  createdAt: string
  /** Picker (picker stage) or packer (packer stage) holding the order; null while queued. */
  assignedTo: string | null
}

// Each stage names its own statuses the same way the board's stat cards do, so the
// popup never introduces vocabulary the operator hasn't already seen on the page.
const STATUS_CHIPS: Record<CarrierStage, Record<string, { label: string; bg: string; color: string }>> = {
  picker: {
    INBOUND:         { label: 'In Queue', bg: '#f1f5f9', color: '#475569' },
    PICKER_ASSIGNED: { label: 'Assigned', bg: '#dbeafe', color: '#1e40af' },
    PICKING:         { label: 'Picking',  bg: '#fef3c7', color: '#92400e' },
  },
  packer: {
    PICKER_COMPLETE: { label: 'Waiting to Pack', bg: '#f1f5f9', color: '#475569' },
    PACKER_ASSIGNED: { label: 'Assigned',        bg: '#dbeafe', color: '#1e40af' },
    PACKING:         { label: 'Packing',         bg: '#fef3c7', color: '#92400e' },
  },
}

const STAGE_LABEL: Record<CarrierStage, string> = {
  picker: 'in the picker stage',
  packer: 'in the packer stage',
}

/**
 * Read-only drill-down behind a carrier chip: which orders this carrier currently has in
 * the stage, what each one is waiting on, and who is holding it. Sorted worst-delay first
 * so a carrier's ageing parcels surface immediately.
 */
export default function CarrierOrdersModal({
  stage,
  carrierName,
  onClose,
}: {
  stage: CarrierStage
  carrierName: string | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const queryKey = [`${stage}-carrier-orders`, carrierName ?? '__none__']

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await api.get<{ orders: CarrierOrderRow[] }>(`/${stage}-admin/carrier-orders`, {
        params: { carrier: carrierName ?? '' },
      })
      return res.data.orders
    },
    refetchInterval: 10_000,
  })

  // Real-time: an assign/complete anywhere in the warehouse changes this list too.
  useEffect(() => {
    const socket = getSocket()
    if (!socket) return
    const invalidate = () => queryClient.invalidateQueries({ queryKey })
    socket.on('order:stats_changed', invalidate)
    return () => { socket.off('order:stats_changed', invalidate) }
  }, [queryClient, stage, carrierName])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const orders = data ?? []
  const style = getCarrierStyle(carrierName)
  const chips = STATUS_CHIPS[stage]

  const statusChip = (status: string) => {
    const s = chips[status] ?? { label: status, bg: '#f1f5f9', color: '#64748b' }
    return (
      <span style={{
        display: 'inline-block', padding: '2px 10px', borderRadius: '9999px',
        fontSize: '11px', fontWeight: 600, background: s.bg, color: s.color,
        whiteSpace: 'nowrap',
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
          background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '860px',
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
          <span style={{
            display: 'inline-flex', alignItems: 'center', padding: '5px 12px',
            borderRadius: 9999, background: style.badgeBg, border: `1px solid ${style.border}`,
            color: style.badgeText, fontSize: 14, fontWeight: 700,
          }}>
            {getCarrierLabel(carrierName)}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', color: colors.textMuted }}>
              {isLoading
                ? 'Loading...'
                : `${orders.length} order${orders.length !== 1 ? 's' : ''} ${STAGE_LABEL[stage]}`}
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
            <div style={{ padding: '40px', textAlign: 'center', color: colors.textMuted, fontSize: 14 }}>
              Loading orders...
            </div>
          ) : orders.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: colors.textMuted, fontSize: 14 }}>
              No orders {STAGE_LABEL[stage]} for this carrier.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: 720 }}>
              <thead>
                <tr style={{ background: colors.surfaceAlt }}>
                  {['Tracking Number', 'Platform', 'Status', stage === 'picker' ? 'Assigned Picker' : 'Assigned Packer', 'Arrived', 'Delay'].map(h => (
                    <th key={h} style={{
                      padding: '10px 16px', textAlign: 'left', fontWeight: 600,
                      color: colors.textSecondary, fontSize: '11px', textTransform: 'uppercase',
                      letterSpacing: '0.4px', borderBottom: `1px solid ${colors.border}`,
                      whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontWeight: 600, color: colors.textPrimary }}>
                      {o.trackingNumber}
                      {o.shopName && (
                        <div style={{ fontFamily: 'inherit', fontWeight: 400, fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                          {o.shopName}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px' }}><PlatformBadge platform={o.platform} /></td>
                    <td style={{ padding: '10px 16px' }}>{statusChip(o.status)}</td>
                    <td style={{ padding: '10px 16px', color: o.assignedTo ? colors.textPrimary : colors.textMuted }}>
                      {o.assignedTo ?? 'Unassigned'}
                    </td>
                    <td style={{ padding: '10px 16px', color: colors.textSecondary, whiteSpace: 'nowrap' }}>
                      {formatManilaDateTime(o.createdAt, {
                        day: '2-digit', month: 'short',
                        hour: '2-digit', minute: '2-digit', hour12: false,
                      })}
                    </td>
                    <td style={{ padding: '10px 16px' }}><DelayBadge level={o.delayLevel} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
