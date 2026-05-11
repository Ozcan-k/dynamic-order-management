import { createPortal } from 'react-dom'
import { colors } from '../../theme'

export type ConfirmTone = 'danger' | 'primary'

interface Props {
  title: string
  message: string
  detail?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: ConfirmTone
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({
  title, message, detail, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  tone = 'danger', busy = false, onConfirm, onCancel,
}: Props) {
  const isDanger = tone === 'danger'
  const headerBg = isDanger
    ? 'linear-gradient(135deg, #fef2f2, #fff5f5)'
    : 'linear-gradient(135deg, #eff6ff, #f7faff)'
  const iconColor = isDanger ? colors.danger : colors.primary
  const confirmBg = isDanger ? colors.danger : colors.primary

  const modal = (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '20px 24px 16px', background: headerBg, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%', background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1.5px solid ${iconColor}`, color: iconColor, fontSize: 22, fontWeight: 700,
          }}>
            {isDanger ? '!' : '?'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: colors.textPrimary }}>{title}</div>
          </div>
        </div>

        <div style={{ padding: '18px 24px 22px' }}>
          <div style={{ fontSize: 14, color: colors.textPrimary, lineHeight: 1.5 }}>{message}</div>
          {detail && (
            <div style={{
              marginTop: 10, padding: '10px 14px', borderRadius: 8,
              background: '#f8fafc', border: `1px solid ${colors.border}`,
              fontSize: 13, color: colors.textSecondary, fontFamily: 'inherit',
            }}>{detail}</div>
          )}
        </div>

        <div style={{
          padding: '12px 24px 18px', display: 'flex', justifyContent: 'flex-end', gap: 10,
          borderTop: `1px solid ${colors.border}`, background: '#fafbfc',
        }}>
          <button
            onClick={onCancel}
            disabled={busy}
            style={{
              padding: '9px 18px', border: `1px solid ${colors.border}`,
              background: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600,
              color: colors.textPrimary, cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >{cancelLabel}</button>
          <button
            onClick={onConfirm}
            disabled={busy}
            style={{
              padding: '9px 18px', border: 'none', background: confirmBg,
              borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#fff',
              cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1,
              minWidth: 92,
            }}
          >{busy ? '…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  )
  return createPortal(modal, document.body)
}
