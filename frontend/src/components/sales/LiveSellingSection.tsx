import { LIVE_SELLING_PLATFORMS, SALES_PLATFORM_LABELS, SalesPlatform } from '@dom/shared'
import type { LiveSellingState } from '../../api/sales'

interface LiveSellingSectionProps {
  metrics: LiveSellingState[]
  onChange: (next: LiveSellingState[]) => void
}

const PLATFORM_COLOR: Record<SalesPlatform, string> = {
  [SalesPlatform.FACEBOOK]: '#1877f2',
  [SalesPlatform.TIKTOK]: '#0f172a',
  [SalesPlatform.INSTAGRAM]: '#dc2743',
  [SalesPlatform.SHOPEE_VIDEO]: '#ee4d2d',
}

type NumericKey = Exclude<keyof LiveSellingState, 'platform'>

const FIELDS: { key: NumericKey; label: string; integer: boolean }[] = [
  { key: 'hours', label: 'Hours', integer: false },
  { key: 'followers', label: 'Followers', integer: true },
  { key: 'likes', label: 'Likes', integer: true },
  { key: 'views', label: 'Views', integer: true },
  { key: 'shares', label: 'Shares', integer: true },
  { key: 'comments', label: 'Comments', integer: true },
  { key: 'orders', label: 'Orders', integer: true },
]

export default function LiveSellingSection({ metrics, onChange }: LiveSellingSectionProps) {
  function update(platform: SalesPlatform, key: NumericKey, raw: string) {
    const num = key === 'hours' ? Number(raw) : Math.floor(Number(raw))
    const safe = Number.isFinite(num) && num >= 0 ? num : 0
    const next = metrics.map((m) => (m.platform === platform ? { ...m, [key]: safe } : m))
    onChange(next)
  }

  return (
    <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
      {LIVE_SELLING_PLATFORMS.map((platform) => {
        const m = metrics.find((x) => x.platform === platform)
        if (!m) return null
        return (
          <div
            key={platform}
            style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: PLATFORM_COLOR[platform] }} />
              <strong style={{ fontSize: '13px', color: '#0f172a' }}>{SALES_PLATFORM_LABELS[platform]}</strong>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              {FIELDS.map((f) => (
                <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {f.label}
                  </span>
                  <input
                    type="number"
                    inputMode={f.integer ? 'numeric' : 'decimal'}
                    min={0}
                    step={f.integer ? 1 : 0.5}
                    value={m[f.key] ?? 0}
                    onChange={(e) => update(platform, f.key, e.target.value)}
                    style={{
                      fontSize: '13px',
                      padding: '7px 10px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      background: '#f8fafc',
                      outline: 'none',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  />
                </label>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
