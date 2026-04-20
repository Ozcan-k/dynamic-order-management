import { SALES_STORES, type SalesStore } from '@dom/shared'

interface StoreSelectorProps {
  value: SalesStore | null
  onChange: (store: SalesStore) => void
}

export default function StoreSelector({ value, onChange }: StoreSelectorProps) {
  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px',
      padding: '14px 16px',
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
    }}>
      {SALES_STORES.map((store) => {
        const active = store === value
        return (
          <button
            key={store}
            type="button"
            onClick={() => onChange(store)}
            style={{
              fontSize: '12px',
              fontWeight: 600,
              padding: '7px 14px',
              borderRadius: '9999px',
              border: '1px solid',
              borderColor: active ? '#3b82f6' : '#e2e8f0',
              background: active ? 'linear-gradient(135deg, #3b82f6, #6366f1)' : '#f8fafc',
              color: active ? '#fff' : '#475569',
              cursor: 'pointer',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {store}
          </button>
        )
      })}
    </div>
  )
}
