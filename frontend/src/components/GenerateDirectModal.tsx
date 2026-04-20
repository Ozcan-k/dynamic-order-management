import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { Carrier, CARRIER_LABELS } from '@dom/shared'
import { api } from '../api/client'
import { colors } from '../theme'

interface Props {
  trackingNumber: string
  onConfirm: (carrier: string, shopName: string) => void
  onCancel: () => void
  isSubmitting?: boolean
}

const CARRIERS = Object.values(Carrier)

const PRESET_SHOPS = [
  'Picky_Farm', 'Eco_Tree', 'Chef_Mela', 'Super_Food', 'Every_Bite',
  'Natures_Blend_Shope', 'Luxe', 'Green_Tree', 'Nuture_Blend_Online',
  'Nature_Finest', 'Supper_Essantial', 'Green_Fuel', 'Zozo_Helth',
  'Master_Chef', 'Daily_Nuts', 'Sport_Snack', 'Wimow', 'Raven_Wellnes',
]

export default function GenerateDirectModal({ trackingNumber, onConfirm, onCancel, isSubmitting }: Props) {
  const [carrier, setCarrier] = useState<Carrier>(Carrier.SPX)
  const [shop, setShop] = useState('')
  const [shopMode, setShopMode] = useState<'select' | 'text'>('select')
  const carrierRef = useRef<HTMLSelectElement>(null)

  const { data: shopsData } = useQuery({
    queryKey: ['order-shops'],
    queryFn: () => api.get<{ shops: string[] }>('/orders/shops').then(r => r.data.shops),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
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
    if (!carrier || !shop.trim() || isSubmitting) return
    onConfirm(carrier, shop.trim())
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSubmit()
  }

  const canConfirm = shop.trim() !== '' && !isSubmitting

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
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(2px)', animation: 'modalBackdropIn 180ms ease-out' }} />
      <div
        style={{
          position: 'relative', background: '#fff', borderRadius: 14,
          width: '100%', maxWidth: 440, margin: '0 16px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          overflow: 'hidden',
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px 14px', borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>
                  Direct Inbound
                </div>
                {/* Direct badge */}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: '#f0fdf4', color: '#15803d',
                  borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                  Direct
                </span>
              </div>
              <div style={{ fontSize: 11, color: colors.textMuted, fontFamily: 'monospace', marginTop: 4, letterSpacing: '0.08em' }}>
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
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Tracking number display */}
          <div style={{
            background: '#f8fafc', border: `1px solid ${colors.border}`,
            borderRadius: 8, padding: '10px 14px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Tracking No
            </span>
            <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 700, color: colors.textPrimary, letterSpacing: '0.08em' }}>
              {trackingNumber}
            </span>
          </div>

          {/* Carrier + Shop row */}
          <div style={{ display: 'flex', gap: 12 }}>
            {/* Carrier */}
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Carrier <span style={{ color: colors.danger }}>*</span></label>
              <select
                ref={carrierRef}
                value={carrier}
                onChange={e => setCarrier(e.target.value as Carrier)}
                style={selectStyle}
              >
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
        </div>

        {/* Footer */}
        <div style={{ padding: '0 20px 16px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 600,
              background: 'none', border: `1px solid ${colors.border}`,
              borderRadius: 8, cursor: isSubmitting ? 'not-allowed' : 'pointer',
              color: colors.textSecondary,
            }}
          >
            Cancel (Esc)
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canConfirm}
            style={{
              padding: '8px 20px', fontSize: 13, fontWeight: 700,
              background: canConfirm ? '#15803d' : '#e2e8f0',
              color: canConfirm ? '#fff' : colors.textMuted,
              border: 'none', borderRadius: 8,
              cursor: canConfirm ? 'pointer' : 'not-allowed',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            {isSubmitting ? (
              <><span className="spinner spinner-sm" style={{ borderTopColor: '#fff' }} /> Adding...</>
            ) : (
              'Confirm & Add'
            )}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
