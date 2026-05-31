import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ReturnCancelType,
  RETURN_CANCEL_TYPE_LABELS,
  Platform,
  PLATFORM_LABELS,
  RETURN_CANCEL_PLATFORMS,
  Carrier,
  CARRIER_LABELS,
  SALES_STORES,
  detectPlatform,
} from '@dom/shared'
import { useCreateReturnCancel, type ReturnCancelRow } from '../api/returns'

const CARRIERS = Object.values(Carrier)

export default function ReturnCancelScan() {
  const create = useCreateReturnCancel()
  const waybillRef = useRef<HTMLInputElement>(null)

  const [trackingNumber, setTrackingNumber] = useState('')
  const [type, setType]         = useState<ReturnCancelType | ''>('')
  const [storeName, setStoreName] = useState('')
  const [platform, setPlatform] = useState<Platform | ''>('')
  const [carrier, setCarrier]   = useState<Carrier | ''>('')
  // Once the user picks a platform manually we stop overriding it from the waybill.
  const [platformTouched, setPlatformTouched] = useState(false)

  const [error,   setError]   = useState<string | null>(null)
  const [recent,  setRecent]  = useState<ReturnCancelRow[]>([])

  // Auto-focus the waybill field on mount so a handheld scan lands straight in.
  useEffect(() => { waybillRef.current?.focus() }, [])

  // Auto-detect platform from the waybill prefix (Shopee / Lazada / TikTok) until
  // the user overrides it manually.
  function onWaybillChange(value: string) {
    setTrackingNumber(value)
    if (!platformTouched && value.trim().length >= 2) {
      const detected = detectPlatform(value)
      if (RETURN_CANCEL_PLATFORMS.includes(detected)) setPlatform(detected)
    }
  }

  function reset(keepStickyFields: boolean) {
    setTrackingNumber('')
    setPlatformTouched(false)
    if (!keepStickyFields) {
      setType('')
      setStoreName('')
      setPlatform('')
      setCarrier('')
    } else {
      // Platform re-detects from the next waybill; clear it so detection can re-run.
      setPlatform('')
    }
    waybillRef.current?.focus()
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!trackingNumber.trim()) return setError('Scan or enter a waybill number.')
    if (!type)      return setError('Select Return or Cancel.')
    if (!storeName) return setError('Select a store.')
    if (!platform)  return setError('Select a platform.')
    if (!carrier)   return setError('Select a courier.')

    try {
      const row = await create.mutateAsync({
        trackingNumber: trackingNumber.trim().toUpperCase(),
        type, storeName, platform, carrier,
      })
      setRecent((r) => [row, ...r].slice(0, 8))
      reset(true) // keep type / store / courier sticky for fast repeated scanning
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg || 'Failed to save. Please try again.')
    }
  }

  return (
    <div className="panel-root">
      <main className="panel-body" style={{ display: 'grid', gap: 18, maxWidth: 720, margin: '0 auto', width: '100%' }}>

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <section className="page-hero">
          <div className="page-hero-content">
            <div className="page-hero-label">Outbound</div>
            <h1 className="page-hero-title">Return &amp; Cancel — Scan</h1>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
              Scan a waybill, then record whether it is a return or a cancellation.
            </div>
          </div>
          <div className="page-hero-actions">
            <Link to="/returns" className="page-hero-cta">View Report →</Link>
          </div>
        </section>

        {/* ── Scan form ─────────────────────────────────────────────────────── */}
        <form
          onSubmit={onSubmit}
          style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20, display: 'grid', gap: 16 }}
        >
          <Field label="Waybill Number">
            <input
              ref={waybillRef}
              type="text"
              value={trackingNumber}
              onChange={(e) => onWaybillChange(e.target.value)}
              placeholder="Scan or type the waybill…"
              autoComplete="off"
              className="filter-field-input"
              style={{ fontSize: 18, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}
            />
          </Field>

          <Field label="Type">
            <select className="styled-select" value={type} onChange={(e) => setType(e.target.value as ReturnCancelType)}>
              <option value="">Select Return / Cancel…</option>
              {Object.values(ReturnCancelType).map((t) => (
                <option key={t} value={t}>{RETURN_CANCEL_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </Field>

          <Field label="Store">
            <select className="styled-select" value={storeName} onChange={(e) => setStoreName(e.target.value)}>
              <option value="">Select a store…</option>
              {SALES_STORES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>

          <Field label="Platform">
            <select
              className="styled-select"
              value={platform}
              onChange={(e) => { setPlatform(e.target.value as Platform); setPlatformTouched(true) }}
            >
              <option value="">Select a platform…</option>
              {RETURN_CANCEL_PLATFORMS.map((p) => (
                <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>
              ))}
            </select>
          </Field>

          <Field label="Courier">
            <select className="styled-select" value={carrier} onChange={(e) => setCarrier(e.target.value as Carrier)}>
              <option value="">Select a courier…</option>
              {CARRIERS.map((c) => (
                <option key={c} value={c}>{CARRIER_LABELS[c]}</option>
              ))}
            </select>
          </Field>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={create.isPending} style={{ height: 46, fontSize: 15 }}>
            {create.isPending ? 'Saving…' : 'Save Record'}
          </button>
        </form>

        {/* ── Recent scans (this session) ───────────────────────────────────── */}
        {recent.length > 0 && (
          <section style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden' }}>
            <header style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', background: '#fafbff', display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Recent Scans</h2>
              <span className="count-badge">{recent.length}</span>
            </header>
            <div className="data-table-wrap">
              <table style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <Th>Waybill</Th>
                    <Th>Type</Th>
                    <Th>Store</Th>
                    <Th>Platform</Th>
                    <Th>Courier</Th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.id}>
                      <Td style={{ fontWeight: 700, letterSpacing: 0.3 }}>{r.trackingNumber}</Td>
                      <Td><TypeBadge type={r.type} /></Td>
                      <Td>{r.storeName}</Td>
                      <Td>{PLATFORM_LABELS[r.platform]}</Td>
                      <Td>{CARRIER_LABELS[r.carrier]}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      {children}
    </label>
  )
}

export function TypeBadge({ type }: { type: ReturnCancelType }) {
  const isReturn = type === ReturnCancelType.RETURN
  return (
    <span className="count-badge" style={{ background: isReturn ? '#fef3c7' : '#fee2e2', color: isReturn ? '#92400e' : '#b91c1c' }}>
      {RETURN_CANCEL_TYPE_LABELS[type]}
    </span>
  )
}

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'left', ...style }}>{children}</th>
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: '10px 12px', fontSize: 13, color: '#0f172a', borderTop: '1px solid #f1f5f9', ...style }}>{children}</td>
}
