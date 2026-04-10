interface ConfirmDialogProps {
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      backgroundColor: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: '12px', padding: '32px',
        maxWidth: '400px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{ fontSize: '20px', marginBottom: '8px' }}>⚠️</div>
        <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 700, color: '#111827' }}>
          Confirm Delete
        </h3>
        <p style={{ margin: '0 0 24px', fontSize: '14px', color: '#6b7280', lineHeight: 1.5 }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '8px 20px', border: '1px solid #d1d5db',
            borderRadius: '8px', cursor: 'pointer',
            background: '#fff', color: '#374151', fontSize: '14px', fontWeight: 500,
          }}>
            Cancel
          </button>
          <button onClick={onConfirm} style={{
            padding: '8px 20px', border: 'none',
            borderRadius: '8px', cursor: 'pointer',
            background: '#ef4444', color: '#fff', fontSize: '14px', fontWeight: 600,
          }}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
