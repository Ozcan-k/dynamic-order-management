import type { MarketplaceState } from '../../api/sales'

interface MarketplaceSectionProps {
  value: MarketplaceState
  onChange: (next: MarketplaceState) => void
}

export default function MarketplaceSection({ value, onChange }: MarketplaceSectionProps) {
  function update(key: keyof MarketplaceState, raw: string) {
    const num = Math.floor(Number(raw))
    const safe = Number.isFinite(num) && num >= 0 ? num : 0
    onChange({ ...value, [key]: safe })
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
      <Field label="Inquiries Received" value={value.inquiries} onChange={(v) => update('inquiries', v)} />
      <Field label="Listings Created" value={value.listingsCreated} onChange={(v) => update('listingsCreated', v)} />
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (raw: string) => void }) {
  return (
    <label style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      padding: '14px',
    }}>
      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          fontSize: '20px',
          fontWeight: 700,
          padding: '8px 12px',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          background: '#f8fafc',
          outline: 'none',
          fontVariantNumeric: 'tabular-nums',
          color: '#0f172a',
        }}
      />
    </label>
  )
}
