import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BrowserMultiFormatReader } from '@zxing/browser'
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
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'
import { disconnectSocket } from '../lib/socket'
import { useCreateReturnCancel, type ReturnCancelRow } from '../api/returns'

const CARRIERS = Object.values(Carrier)

// Sticky selections persist on the device so an operator scanning a batch of
// returns for the same store/courier doesn't re-pick them every parcel.
const TYPE_KEY = 'return-scan-type'
const STORE_KEY = 'return-scan-store'
const CARRIER_KEY = 'return-scan-carrier'

function playBeep(success: boolean) {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    if (success) {
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.setValueAtTime(1175, ctx.currentTime + 0.10)
      osc.frequency.setValueAtTime(1480, ctx.currentTime + 0.20)
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.6, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45)
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.45)
    } else {
      osc.frequency.setValueAtTime(220, ctx.currentTime)
      osc.frequency.setValueAtTime(180, ctx.currentTime + 0.15)
      osc.type = 'square'
      gain.gain.setValueAtTime(0.45, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5)
    }
  } catch { /* noop */ }
}

const HAS_VIBRATE = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
function vibrate(pattern: number | number[]) {
  if (!HAS_VIBRATE) return
  try { navigator.vibrate(pattern) } catch { /* noop */ }
}

export default function ReturnScanMobile() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const create = useCreateReturnCancel()

  // ── Sticky selections (persisted) ──────────────────────────────────────────
  const [type, setType] = useState<ReturnCancelType | ''>(
    () => (localStorage.getItem(TYPE_KEY) as ReturnCancelType | null) ?? '',
  )
  const [storeName, setStoreName] = useState<string>(() => localStorage.getItem(STORE_KEY) ?? '')
  const [carrier, setCarrier] = useState<Carrier | ''>(
    () => (localStorage.getItem(CARRIER_KEY) as Carrier | null) ?? '',
  )

  // ── Per-parcel fields ───────────────────────────────────────────────────────
  const [trackingNumber, setTrackingNumber] = useState('')
  const [platform, setPlatform] = useState<Platform | ''>('')
  const [platformTouched, setPlatformTouched] = useState(false)

  const [pending, setPending] = useState<null | { trackingNumber: string; platform: Platform }>(null)
  const [error, setError] = useState<string | null>(null)
  const [recent, setRecent] = useState<ReturnCancelRow[]>([])

  // ── Camera ───────────────────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const lockedRef = useRef(false)
  const [cameraOn, setCameraOn] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const waybillRef = useRef<HTMLInputElement>(null)

  useEffect(() => { localStorage.setItem(TYPE_KEY, type) }, [type])
  useEffect(() => { localStorage.setItem(STORE_KEY, storeName) }, [storeName])
  useEffect(() => { localStorage.setItem(CARRIER_KEY, carrier) }, [carrier])

  const selectorsReady = !!type && !!storeName && !!carrier

  function onWaybillChange(value: string) {
    setTrackingNumber(value)
    if (!platformTouched && value.trim().length >= 2) {
      const detected = detectPlatform(value)
      if (RETURN_CANCEL_PLATFORMS.includes(detected)) setPlatform(detected)
    }
  }

  // Open the confirm sheet for a waybill (from the input or the camera).
  const askConfirm = useCallback((rawWaybill: string) => {
    const wb = rawWaybill.trim().toUpperCase()
    if (!wb) { setError('Scan or enter a waybill number.'); playBeep(false); vibrate([120, 60, 120]); return }
    if (!selectorsReady) { setError('Pick Type, Store and Courier first.'); playBeep(false); vibrate([120, 60, 120]); return }
    const detected = !platformTouched ? detectPlatform(wb) : (platform || detectPlatform(wb))
    const plat = RETURN_CANCEL_PLATFORMS.includes(detected as Platform)
      ? (detected as Platform)
      : (platform && RETURN_CANCEL_PLATFORMS.includes(platform) ? platform : Platform.SHOPEE)
    setError(null)
    // Immediate scan feedback (matches the other scan stations) — beep + buzz
    // the instant a waybill is captured, whether from the camera, a handheld
    // wedge scanner, or manual entry, before the confirm sheet appears.
    playBeep(true); vibrate([90, 50, 140])
    setPending({ trackingNumber: wb, platform: plat })
  }, [selectorsReady, platform, platformTouched])

  // ── Camera lifecycle (reads the waybill barcode as raw text) ─────────────────
  const stopCamera = useCallback(() => {
    controlsRef.current?.stop()
    controlsRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    lockedRef.current = false
    setCameraOn(false)
  }, [])

  const startCamera = useCallback(async () => {
    setCameraError(null); setError(null)
    if (!selectorsReady) { setError('Pick Type, Store and Courier first.'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      setCameraOn(true)
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name
      setCameraError(
        name === 'NotAllowedError' ? 'Camera permission denied. Please allow camera access.' :
        name === 'NotFoundError' ? 'No camera found on this device.' :
        'Could not open camera.',
      )
    }
  }, [selectorsReady])

  useEffect(() => {
    if (!cameraOn || !videoRef.current || !streamRef.current) return
    const video = videoRef.current
    const stream = streamRef.current
    video.srcObject = stream
    const reader = new BrowserMultiFormatReader()

    video.play().then(() => {
      reader.decodeFromStream(stream, video, (result, _err, controls) => {
        if (controls && !controlsRef.current) controlsRef.current = controls
        if (!result || lockedRef.current) return
        const text = result.getText().trim()
        if (!text) return
        lockedRef.current = true
        onWaybillChange(text)
        stopCamera()
        askConfirm(text) // fires the scan beep + vibrate
      }).then((controls) => { if (!controlsRef.current) controlsRef.current = controls })
        .catch(() => { /* noop */ })
    }).catch(() => {
      setCameraError('Could not start video stream.')
      setCameraOn(false)
    })

    return () => {
      try { (reader as unknown as { stopAsyncDecode?: () => void }).stopAsyncDecode?.() } catch { /* noop */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOn])

  useEffect(() => () => stopCamera(), [stopCamera])

  async function confirmSave() {
    if (!pending || !type || !carrier) return
    try {
      const row = await create.mutateAsync({
        trackingNumber: pending.trackingNumber,
        type,
        storeName,
        platform: pending.platform,
        carrier,
      })
      setRecent((r) => [row, ...r].slice(0, 8))
      playBeep(true); vibrate([250, 100, 200, 100, 200])
      // Clear the per-parcel fields, keep sticky selectors for the next scan.
      setPending(null)
      setTrackingNumber('')
      setPlatform('')
      setPlatformTouched(false)
      setError(null)
      waybillRef.current?.focus()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg || 'Failed to save. Please try again.')
      playBeep(false); vibrate([180, 100, 180, 100, 180])
      setPending(null)
    }
  }

  async function handleLogout() {
    try { await api.post('/auth/logout') } catch { /* ignore */ }
    disconnectSocket()
    setUser(null)
    navigate('/scan', { replace: true })
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#0f172a', color: '#fff' }}>
      <header style={{
        padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(15,23,42,0.95)', borderBottom: '1px solid rgba(148,163,184,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' }}>RETURN &amp; CANCEL SCAN</div>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>{user?.username}</div>
        </div>
        <button
          onClick={handleLogout}
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
            color: '#f1f5f9', padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
        >Sign Out</button>
      </header>

      {cameraOn ? (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100dvh', background: '#000', zIndex: 50, overflow: 'hidden' }}>
          <video ref={videoRef} playsInline muted style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ width: '82%', maxWidth: 340, aspectRatio: '2/1', border: '3px solid #3b82f6d9', borderRadius: 14, boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }} />
          </div>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '12px 12px 16px', background: 'linear-gradient(to bottom, rgba(15,23,42,0.92), rgba(15,23,42,0))', display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={stopCamera} aria-label="Close camera"
              style={{ width: 42, height: 42, borderRadius: 21, background: 'rgba(15,23,42,0.92)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', fontSize: 22, fontWeight: 700, cursor: 'pointer', paddingBottom: 4 }}
            >×</button>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>Aim at the waybill barcode</div>
          </div>
        </div>
      ) : (
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 14px 28px', maxWidth: 560, width: '100%', margin: '0 auto' }}>
          {/* Type segmented toggle */}
          <Section label="Type">
            <div style={{ display: 'flex', gap: 8 }}>
              {Object.values(ReturnCancelType).map((t) => {
                const active = type === t
                const isReturn = t === ReturnCancelType.RETURN
                const accent = isReturn ? '#f59e0b' : '#ef4444'
                return (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    style={{
                      flex: 1, padding: '12px 0', borderRadius: 10, cursor: 'pointer',
                      background: active ? `${accent}28` : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${active ? `${accent}aa` : 'rgba(255,255,255,0.12)'}`,
                      color: '#fff', fontSize: 14, fontWeight: 700,
                    }}
                  >{RETURN_CANCEL_TYPE_LABELS[t]}</button>
                )
              })}
            </div>
          </Section>

          <Section label="Store">
            <select className="styled-select" value={storeName} onChange={(e) => setStoreName(e.target.value)} style={darkSelect}>
              <option value="">Select a store…</option>
              {SALES_STORES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Section>

          <Section label="Courier">
            <select className="styled-select" value={carrier} onChange={(e) => setCarrier(e.target.value as Carrier)} style={darkSelect}>
              <option value="">Select a courier…</option>
              {CARRIERS.map((c) => <option key={c} value={c}>{CARRIER_LABELS[c]}</option>)}
            </select>
          </Section>

          <Section label="Waybill Number">
            <input
              ref={waybillRef}
              type="text"
              value={trackingNumber}
              onChange={(e) => onWaybillChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); askConfirm(trackingNumber) } }}
              placeholder="Scan or type the waybill…"
              autoComplete="off"
              autoFocus
              style={{
                width: '100%', boxSizing: 'border-box', padding: '14px 14px', borderRadius: 10,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                color: '#fff', fontSize: 18, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', outline: 'none',
              }}
            />
          </Section>

          <Section label="Platform (auto-detected)">
            <select
              className="styled-select"
              value={platform}
              onChange={(e) => { setPlatform(e.target.value as Platform); setPlatformTouched(true) }}
              style={darkSelect}
            >
              <option value="">Detected from waybill…</option>
              {RETURN_CANCEL_PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
            </select>
          </Section>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.5)', color: '#fecaca', padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={startCamera}
              style={{ flex: 1, padding: '14px 0', borderRadius: 12, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >📷 Scan with camera</button>
            <button
              onClick={() => askConfirm(trackingNumber)}
              style={{ flex: 2, padding: '14px 0', borderRadius: 12, background: 'linear-gradient(135deg, #3b82f6, #6366f1)', border: 'none', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 18px rgba(59,130,246,0.4)' }}
            >Save Record</button>
          </div>

          {cameraError && (
            <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#fecaca', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>
              {cameraError}
            </div>
          )}

          {recent.length > 0 && (
            <section style={{ marginTop: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, overflow: 'hidden' }}>
              <header style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', color: '#cbd5e1' }}>
                RECENT SCANS · {recent.length}
              </header>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {recent.map((r) => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 13 }}>
                    <span style={{ fontWeight: 700, letterSpacing: 0.3 }}>{r.trackingNumber}</span>
                    <span style={{ color: '#94a3b8' }}>
                      {RETURN_CANCEL_TYPE_LABELS[r.type]} · {PLATFORM_LABELS[r.platform]} · {CARRIER_LABELS[r.carrier]}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      )}

      {/* Confirm sheet */}
      {pending && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', zIndex: 60, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', background: '#0f172a', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Confirm record</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>Review before saving.</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(148,163,184,0.18)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Row label="Waybill" value={pending.trackingNumber} mono />
              <Row label="Type" value={type ? RETURN_CANCEL_TYPE_LABELS[type] : '—'} valueColor={type === ReturnCancelType.RETURN ? '#fbbf24' : '#f87171'} />
              <Row label="Store" value={storeName || '—'} />
              <Row label="Platform" value={PLATFORM_LABELS[pending.platform]} />
              <Row label="Courier" value={carrier ? CARRIER_LABELS[carrier] : '—'} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setPending(null)}
                disabled={create.isPending}
                style={{ flex: 1, padding: '14px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#e2e8f0', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: create.isPending ? 0.5 : 1 }}
              >Cancel</button>
              <button
                onClick={confirmSave}
                disabled={create.isPending}
                style={{ flex: 2, padding: '14px 12px', borderRadius: 12, background: 'linear-gradient(135deg, #3b82f6, #6366f1)', border: 'none', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 4px 16px rgba(59,130,246,0.4)', opacity: create.isPending ? 0.7 : 1 }}
              >{create.isPending ? 'Saving…' : 'Confirm & Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const darkSelect: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 10,
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
  color: '#fff', fontSize: 15, fontWeight: 600, outline: 'none',
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      {children}
    </label>
  )
}

function Row({ label, value, mono, valueColor }: { label: string; value: string; mono?: boolean; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: valueColor ?? '#f1f5f9', fontFamily: mono ? 'monospace' : undefined, textAlign: 'right' }}>{value}</span>
    </div>
  )
}
