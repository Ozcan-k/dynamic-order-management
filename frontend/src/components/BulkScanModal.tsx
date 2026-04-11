import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Carrier, CARRIER_LABELS, detectPlatform } from '@dom/shared'
import { api } from '../api/client'
import { colors } from '../theme'
import ScanInput from './ScanInput'
import PlatformBadge from './shared/PlatformBadge'

interface BulkScanModalProps {
  onClose: () => void
  onSuccess: (created: number, duplicates: string[]) => void
}

type StagedItem = {
  id: string
  trackingNumber: string
  platform: string
}

const CARRIERS = Object.values(Carrier)

export default function BulkScanModal({ onClose, onSuccess }: BulkScanModalProps) {
  const [stagedItems, setStagedItems] = useState<StagedItem[]>([])
  const [selectedCarrier, setSelectedCarrier] = useState<Carrier | ''>('')
  const [shopName, setShopName] = useState('')
  const [shopInputMode, setShopInputMode] = useState<'select' | 'text'>('select')
  const [scanWarning, setScanWarning] = useState<string | null>(null)

  // Escape key closes modal
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Fetch existing shop names for the dropdown
  const { data: shopsData } = useQuery({
    queryKey: ['order-shops'],
    queryFn: () => api.get<{ shops: string[] }>('/orders/shops').then(r => r.data.shops),
  })
  const existingShops = shopsData ?? []

  // Default to text mode if no existing shops
  useEffect(() => {
    if (shopsData !== undefined && existingShops.length === 0) {
      setShopInputMode('text')
    }
  }, [shopsData, existingShops.length])

  function handleScan(tn: string) {
    const normalized = tn.trim().toUpperCase()
    if (!normalized) return

    if (stagedItems.some(i => i.trackingNumber === normalized)) {
      setScanWarning(`"${normalized}" is already in this batch`)
      setTimeout(() => setScanWarning(null), 3000)
      return
    }

    const platform = detectPlatform(normalized)
    setStagedItems(prev => [
      ...prev,
      { id: crypto.randomUUID(), trackingNumber: normalized, platform },
    ])
    setScanWarning(null)
  }

  function removeItem(id: string) {
    setStagedItems(prev => prev.filter(i => i.id !== id))
  }

  const canConfirm = stagedItems.length > 0 && selectedCarrier !== ''

  const bulkMutation = useMutation({
    mutationFn: () =>
      api.post<{ created: number; duplicates: string[] }>('/orders/bulk-scan', {
        trackingNumbers: stagedItems.map(i => i.trackingNumber),
        carrierName: selectedCarrier,
        shopName: shopName.trim() || undefined,
      }),
    onSuccess: res => onSuccess(res.data.created, res.data.duplicates),
    onError: (err: any) => {
      setScanWarning(err?.response?.data?.error ?? 'Bulk scan failed')
    },
  })

  // ── Styles ────────────────────────────────────────────────────────────────

  const labelStyle: Record<string, string | number> = {
    display: 'block',
    marginBottom: 6,
    fontWeight: 700,
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  }

  const selectStyle: Record<string, string | number> = {
    width: '100%',
    padding: '9px 12px',
    fontSize: 14,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    background: '#fff',
    color: colors.textPrimary,
    outline: 'none',
    cursor: 'pointer',
  }

  const modal = (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#fff',
        borderRadius: 16,
        maxWidth: 680,
        width: '100%',
        maxHeight: '90vh',
        boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #eff6ff, #f0f9ff)',
          borderBottom: `1px solid #bfdbfe`,
          padding: '20px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: '#dbeafe',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9V5a2 2 0 0 1 2-2h4" />
                <path d="M3 15v4a2 2 0 0 0 2 2h4" />
                <path d="M21 9V5a2 2 0 0 0-2-2h-4" />
                <path d="M21 15v4a2 2 0 0 1-2 2h-4" />
                <line x1="7" y1="12" x2="7" y2="12" strokeWidth="3" />
                <line x1="10" y1="9" x2="10" y2="15" strokeWidth="1.5" />
                <line x1="13" y1="9" x2="13" y2="15" strokeWidth="3" />
                <line x1="16" y1="9" x2="16" y2="15" strokeWidth="1.5" />
              </svg>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: colors.textPrimary }}>
                Bulk Scan
              </div>
              <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                Scan all barcodes, then assign carrier & shop
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: colors.textMuted, fontSize: 20, fontWeight: 700,
              lineHeight: 1, padding: '4px 8px', borderRadius: 6,
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* Scan input */}
          <ScanInput
            onScan={handleScan}
            disabled={bulkMutation.isPending}
            buttonLabel="Add to Batch"
          />

          {/* Warning */}
          {scanWarning && (
            <div style={{
              marginTop: -12, marginBottom: 16,
              padding: '9px 14px',
              background: '#fef2f2',
              border: `1px solid ${colors.dangerBorder}`,
              borderRadius: 8,
              fontSize: 13,
              color: colors.danger,
              fontWeight: 500,
            }}>
              {scanWarning}
            </div>
          )}

          {/* Staged items */}
          {stagedItems.length > 0 ? (
            <div style={{ marginBottom: 20 }}>
              <div style={{
                fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: colors.textSecondary,
                marginBottom: 8,
              }}>
                Scanned ({stagedItems.length})
              </div>
              <div style={{
                border: `1px solid ${colors.border}`,
                borderRadius: 10,
                overflow: 'hidden',
                maxHeight: 260,
                overflowY: 'auto',
              }}>
                {stagedItems.map((item, i) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 14px',
                      borderBottom: i < stagedItems.length - 1 ? `1px solid ${colors.border}` : 'none',
                      background: i % 2 === 0 ? '#fff' : '#f8fafc',
                    }}
                  >
                    <span style={{ color: colors.textMuted, fontSize: 12, width: 24, textAlign: 'right', flexShrink: 0 }}>
                      {i + 1}
                    </span>
                    <span style={{
                      flex: 1, fontFamily: 'monospace', fontSize: 13,
                      fontWeight: 600, letterSpacing: '0.03em', color: colors.textPrimary,
                    }}>
                      {item.trackingNumber}
                    </span>
                    <PlatformBadge platform={item.platform} />
                    <button
                      onClick={() => removeItem(item.id)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: colors.textMuted, fontSize: 13,
                        padding: '2px 6px', borderRadius: 4,
                        fontWeight: 600,
                      }}
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            !scanWarning && (
              <div style={{
                textAlign: 'center', padding: '28px 0',
                color: colors.textMuted, fontSize: 13,
              }}>
                Scan a barcode to begin
              </div>
            )
          )}
        </div>

        {/* Footer — carrier + shop + actions */}
        <div style={{
          padding: '16px 24px',
          borderTop: `1px solid ${colors.border}`,
          background: '#f8fafc',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>

            {/* Carrier (required) */}
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>
                Carrier <span style={{ color: colors.danger }}>*</span>
              </label>
              <select
                value={selectedCarrier}
                onChange={e => setSelectedCarrier(e.target.value as Carrier | '')}
                style={selectStyle}
              >
                <option value="">Select carrier...</option>
                {CARRIERS.map(c => (
                  <option key={c} value={c}>{CARRIER_LABELS[c]}</option>
                ))}
              </select>
            </div>

            {/* Shop name (optional) */}
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Shop Name <span style={{ color: colors.textMuted, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
              {shopInputMode === 'select' ? (
                <select
                  value={shopName}
                  onChange={e => {
                    if (e.target.value === '__new__') {
                      setShopInputMode('text')
                      setShopName('')
                    } else {
                      setShopName(e.target.value)
                    }
                  }}
                  style={selectStyle}
                >
                  <option value="">— None —</option>
                  {existingShops.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                  <option value="__new__">+ Type new name...</option>
                </select>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    autoFocus
                    value={shopName}
                    onChange={e => setShopName(e.target.value)}
                    placeholder="e.g. Picky Farm Official"
                    style={{
                      ...selectStyle,
                      flex: 1,
                      border: `1px solid ${colors.border}`,
                      outline: 'none',
                    }}
                    maxLength={100}
                  />
                  {existingShops.length > 0 && (
                    <button
                      onClick={() => { setShopInputMode('select'); setShopName('') }}
                      style={{
                        background: 'none', border: `1px solid ${colors.border}`,
                        borderRadius: 8, cursor: 'pointer',
                        color: colors.textSecondary, fontSize: 12,
                        padding: '0 10px', whiteSpace: 'nowrap',
                      }}
                    >
                      ← List
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={bulkMutation.isPending}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => bulkMutation.mutate()}
              disabled={!canConfirm || bulkMutation.isPending}
              style={{
                opacity: canConfirm && !bulkMutation.isPending ? 1 : 0.5,
                cursor: canConfirm && !bulkMutation.isPending ? 'pointer' : 'not-allowed',
              }}
            >
              {bulkMutation.isPending ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span className="spinner spinner-sm" />
                  Saving...
                </span>
              ) : (
                `Confirm (${stagedItems.length} order${stagedItems.length !== 1 ? 's' : ''})`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
