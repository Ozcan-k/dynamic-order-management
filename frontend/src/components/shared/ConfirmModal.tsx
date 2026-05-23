import { createPortal } from 'react-dom'

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
  const confirmClass = isDanger ? 'btn btn-danger-solid' : 'btn btn-primary'

  const modal = (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className={`modal-header ${isDanger ? 'modal-header--danger' : 'modal-header--primary'}`}>
          <div className={`modal-icon ${isDanger ? 'modal-icon--danger' : 'modal-icon--primary'}`}>
            {isDanger ? '!' : '?'}
          </div>
          <div style={{ flex: 1 }}>
            <div className="modal-title">{title}</div>
          </div>
        </div>

        <div className="modal-body">
          <div className="modal-message">{message}</div>
          {detail && <div className="modal-detail">{detail}</div>}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onCancel}
            disabled={busy}
          >{cancelLabel}</button>
          <button
            type="button"
            className={confirmClass}
            onClick={onConfirm}
            disabled={busy}
            style={{ minWidth: 92 }}
          >{busy ? '…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  )
  return createPortal(modal, document.body)
}
