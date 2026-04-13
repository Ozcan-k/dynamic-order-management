import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { colors, radius, shadow, font } from '../theme'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SlaEscalationEntry {
  id: string
  fromLevel: number | null
  toLevel: number
  triggeredAt: string
  triggerSource: string
}

interface SlaHistoryData {
  order: {
    id: string
    trackingNumber: string
    status: string
    delayLevel: number
    slaStartedAt: string
    slaCompletedAt: string | null
  }
  escalations: SlaEscalationEntry[]
}

interface Props {
  orderId: string
  trackingNumber: string
  onClose: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatManila(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Manila',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function elapsedLabel(fromIso: string, toIso?: string | null): string {
  const ms = (toIso ? new Date(toIso) : new Date()).getTime() - new Date(fromIso).getTime()
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

const D_LABELS = ['D0', 'D1', 'D2', 'D3', 'D4']

// ─── Component ────────────────────────────────────────────────────────────────

export default function SlaHistoryModal({ orderId, trackingNumber, onClose }: Props) {
  const { data, isLoading, isError } = useQuery<SlaHistoryData>({
    queryKey: ['sla-history', orderId],
    queryFn: () => api.get(`/orders/${orderId}/sla-escalations`).then((r) => r.data),
    staleTime: 30_000,
  })

  const modal = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1010,
        background: 'rgba(15,23,42,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colors.surface,
          borderRadius: radius.lg,
          boxShadow: shadow.xl,
          width: '100%',
          maxWidth: '520px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${colors.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontSize: font.sm, color: colors.textSecondary, marginBottom: '2px' }}>
              SLA Escalation History
            </div>
            <div style={{ fontWeight: 600, fontSize: font.base, color: colors.textPrimary, fontFamily: 'monospace' }}>
              {trackingNumber}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: colors.textSecondary,
              fontSize: '20px',
              lineHeight: 1,
              padding: '4px',
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '20px', flex: 1 }}>
          {isLoading && (
            <div style={{ textAlign: 'center', color: colors.textMuted, padding: '32px 0' }}>
              Loading...
            </div>
          )}

          {isError && (
            <div style={{ textAlign: 'center', color: colors.danger, padding: '32px 0' }}>
              Failed to load SLA history.
            </div>
          )}

          {data && (
            <>
              {/* Order summary */}
              <div
                style={{
                  background: colors.surfaceAlt,
                  borderRadius: radius.md,
                  padding: '12px 14px',
                  marginBottom: '20px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '12px',
                  fontSize: font.sm,
                }}
              >
                <div>
                  <span style={{ color: colors.textSecondary }}>Status: </span>
                  <span style={{ fontWeight: 600, color: colors.textPrimary }}>
                    {data.order.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <div>
                  <span style={{ color: colors.textSecondary }}>Level: </span>
                  <span
                    style={{
                      fontWeight: 700,
                      color: colors.delay[data.order.delayLevel],
                    }}
                  >
                    {D_LABELS[data.order.delayLevel]}
                  </span>
                </div>
                <div>
                  <span style={{ color: colors.textSecondary }}>SLA Started: </span>
                  <span style={{ color: colors.textPrimary }}>{formatManila(data.order.slaStartedAt)}</span>
                </div>
                <div>
                  <span style={{ color: colors.textSecondary }}>
                    {data.order.slaCompletedAt ? 'Completed in: ' : 'Elapsed: '}
                  </span>
                  <span style={{ fontWeight: 600, color: colors.textPrimary }}>
                    {elapsedLabel(data.order.slaStartedAt, data.order.slaCompletedAt)}
                    {!data.order.slaCompletedAt && (
                      <span style={{ fontWeight: 400, color: colors.textMuted }}> (ongoing)</span>
                    )}
                  </span>
                </div>
              </div>

              {/* Timeline */}
              {data.escalations.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    color: colors.textSecondary,
                    padding: '24px 0',
                    fontSize: font.sm,
                  }}
                >
                  No escalations recorded — order has stayed at D0.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                  {data.escalations.map((esc, i) => (
                    <div key={esc.id} style={{ display: 'flex', gap: '12px' }}>
                      {/* Left: connector line + dot */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            background: colors.delayBg[esc.toLevel],
                            border: `2px solid ${colors.delay[esc.toLevel]}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '10px',
                            fontWeight: 700,
                            color: colors.delayText[esc.toLevel],
                            flexShrink: 0,
                          }}
                        >
                          {D_LABELS[esc.toLevel]}
                        </div>
                        {i < data.escalations.length - 1 && (
                          <div
                            style={{
                              width: '2px',
                              flex: 1,
                              minHeight: '20px',
                              background: colors.border,
                              margin: '4px 0',
                            }}
                          />
                        )}
                      </div>

                      {/* Right: content */}
                      <div style={{ paddingBottom: i < data.escalations.length - 1 ? '16px' : '0', flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: font.sm, color: colors.textPrimary }}>
                          Escalated to {D_LABELS[esc.toLevel]}
                          {esc.fromLevel !== null && (
                            <span style={{ fontWeight: 400, color: colors.textSecondary }}>
                              {' '}from {D_LABELS[esc.fromLevel]}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: font.xs, color: colors.textMuted }}>
                            {formatManila(esc.triggeredAt)}
                          </span>
                          <span
                            style={{
                              fontSize: font.xs,
                              background: colors.surfaceAlt,
                              border: `1px solid ${colors.border}`,
                              borderRadius: radius.sm,
                              padding: '0 6px',
                              color: colors.textSecondary,
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                            }}
                          >
                            {esc.triggerSource}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
