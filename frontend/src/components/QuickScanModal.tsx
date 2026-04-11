import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { Carrier, CARRIER_LABELS } from '@dom/shared'
import { api } from '../api/client'
import { colors } from '../theme'

interface Props {
  trackingNumber: string
  initialCarrier: string
  initialShop: string
  onConfirm: (carrier: string, shopName: string) => void
  onCancel: () => void
}

const CARRIERS = Object.values(Carrier)

const PRESET_SHOPS = [
  'Picky_Farm', 'Eco_Tree', 'Chef_Mela', 'Super_Food', 'Every_Bite',
  'Natures_Blend_Shope', 'Luxe', 'Green_Tree', 'Nuture_Blend_Online',
  'Nature_Finest', 'Supper_Essantial', 'Green_Fuel', 'Zozo_Helth',
  'Master_Chef', 'Daily_Nuts', 'Sport_Snack', 'Wimow', 'Raven_Wellnes',
]

export default function QuickScanModal({ trackingNumber, initialCarrier, initialShop, onConfirm, onCancel }: Props) {
  const [carrier, setCarrier] = useState<Carrier | ''>(initialCarrier as Carrier | '')
  const [shop, setShop] = useState(initialShop)
  const [shopMode, setShopMode] = useState<'select' | 'text'>('select')
  const carrierRef = useRef<HTMLSelectElement>(null)

  const { data: shopsData } = useQuery({
    queryKey: ['order-shops'],
    queryFn: () => api.get<{ shops: string[] }>('/orders/shops').then(r => r.data.shops),
  })
  const allShops = Array.from(new Set([...PRESET_SHOPS, ...(shopsData ?? [])]))

  useEffect(() => {
    carrierRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  function handleSubmit() {
    if (!carrier || !shop.trim()) return
    onConfirm(carrier, shop.trim())
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSubmit()
  }

  const canConfirm = carrier !== '' && shop.trim() !== ''

  const labelStyle: Record<string, string | number> = {
    display: 'block', marginBottom: 6, fontWeight: 700, fontSize: 12,
    color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em',
  }

  const selectStyle: Record<string, string | number> = {
    width: '100%', padding: '9px 12px', fontSize: 14,
    border: `1px solid ${colors.border}`, borderRadius: 8,
    background: '#fff', color: colors.textPrimary, outline: 'none', cursor: 'pointer',
  }

  const modal = (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'relative', background: '#fff', borderRadius: 14,
        width: '100%', maxWidth: 420, margin: '0 16px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        overflow: 'hidden',
      }}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px 14px', borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>
                Assign Carrier & Shop
              </div>
              <div style={{ fontSize: 11, color: colors.textMuted, fontFamily: 'monospace', marginTop: 2 }}>
                {trackingNumber}
              </div>
            </div>
            <button
              onClick={onCancel}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textMuted, fontSize: 18, lineHeight: 1, padding: '2px 6px' }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', display: 'flex', gap: 12 }}>
          {/* Carrier */}
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Carrier <span style={{ color: colors.danger }}>*</span></label>
            <select
              ref={carrierRef}
              value={carrier}
              onChange={e => setCarrier(e.target.value as Carrier | '')}
              style={selectStyle}
            >
              <option value="">Select...</option>
              {CARRIERS.map(c => (
                <option key={c} value={c}>{CARRIER_LABELS[c]}</option>
              ))}
            </select>
          </div>

          {/* Shop */}
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Shop <span style={{ color: colors.danger }}>*</span></label>
            {shopMode === 'select' ? (
              <select
                value={shop}
                onChange={e => {
                  if (e.target.value === '__new__') { setShopMode('text'); setShop('') }
                  else setShop(e.target.value)
                }}
                style={selectStyle}
              >
                <option value="">— None —</option>
                {allShops.map(s => <option key={s} value={s}>{s}</option>)}
                <option value="__new__">+ New name...</option>
              </select>
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  autoFocus
                  value={shop}
                  onChange={e => setShop(e.target.value)}
                  placeholder="Shop name"
                  maxLength={100}
                  style={{ ...selectStyle, flex: 1, cursor: 'text' } as Record<string, string | number>}
                />
                {allShops.length > 0 && (
                  <button
                    onClick={() => { setShopMode('select'); setShop('') }}
                    style={{
                      background: 'none', border: `1px solid ${colors.border}`,
                      borderRadius: 8, cursor: 'pointer', color: colors.textSecondary,
                      fontSize: 12, padding: '0 8px', whiteSpace: 'nowrap',
                    }}
                  >
                    ← List
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '0 20px 16px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 600,
              background: 'none', border: `1px solid ${colors.border}`,
              borderRadius: 8, cursor: 'pointer', color: colors.textSecondary,
            }}
          >
            Cancel (Esc)
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canConfirm}
            style={{
              padding: '8px 20px', fontSize: 13, fontWeight: 700,
              background: canConfirm ? colors.primary : '#e2e8f0',
              color: canConfirm ? '#fff' : colors.textMuted,
              border: 'none', borderRadius: 8,
              cursor: canConfirm ? 'pointer' : 'not-allowed',
            }}
          >
            Confirm (Enter)
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
