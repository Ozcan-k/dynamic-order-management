import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { BrowserMultiFormatReader } from '@zxing/browser'
import {
  Platform,
  PLATFORM_LABELS,
  Carrier,
  CARRIER_LABELS,
  DispatchSource,
  DISPATCH_SOURCE_LABELS,
  detectPlatform,
  suggestCarrier,
} from '@dom/shared'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'
import { disconnectSocket } from '../lib/socket'
import {
  lookupOrder,
  createDispatch,
  type DispatchRow,
  type OrderLookupResult,
} from '../api/dispatch'

const CARRIERS = Object.values(Carrier)
const PLATFORMS = Object.values(Platform)

// Sticky selections persist on the device so an operator scanning a batch for the
// same source / courier doesn't re-pick them on every parcel.
const SOURCE_KEY = 'outbound-scan-source'
const CARRIER_KEY = 'outbound-scan-carrier'

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

// Resolve a Carrier enum from the order's free-text carrier name, falling back
// to the platform-based suggestion when it can't be matched.
function resolveCarrier(lookup: OrderLookupResult): Carrier {
  const raw = (lookup.carrierName ?? '').toUpperCase().replace(/[^A-Z]/g, '')
  if (raw) {
    if (raw.includes('JT') || raw.includes('JANDT') || raw.includes('JANDTEXPRESS')) return Carrier.JT_EXPRESS
    if (raw.includes('NINJA')) return Carrier.NINJA_VAN
    if (raw.includes('FLASH')) return Carrier.FLASH
    if (raw.includes('LBC')) return Carrier.LBC
    if (raw.includes('LEX') || raw.includes('LAZADA')) return Carrier.LEX
    if (raw.includes('SPX') || raw.includes('SHOPEE')) return Carrier.SPX
  }
  return lookup.platform ? suggestCarrier(lookup.platform) : Carrier.OTHER
}

interface PendingParcel {
  trackingNumber: string
  source: DispatchSource
  platform: Platform
  carrier: Carrier
  shopName: string
}

export default function OutboundScan() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)

  const create = useMutation({
    mutationFn: (p: PendingParcel) => createDispatch({
      trackingNumber: p.trackingNumber,
      source: p.source,
      platform: p.platform,
      carrier: p.carrier,
      shopName: p.shopName,
    }),
  })

  // ── Sticky selections (persisted) ──────────────────────────────────────────
  const [source, setSource] = useState<DispatchSource | ''>(
    () => (localStorage.getItem(SOURCE_KEY) as DispatchSource | null) ?? '',
  )
  const [carrier, setCarrier] = useState<Carrier | ''>(
    () => (localStorage.getItem(CARRIER_KEY) as Carrier | null) ?? '',
  )

  // ── Per-parcel fields ───────────────────────────────────────────────────────
  const [trackingNumber, setTrackingNumber] = useState('')
  const [platform, setPlatform] = useState<Platform | ''>('')
  const [platformTouched, setPlatformTouched] = useState(false)

  const [pending, setPending] = useState<PendingParcel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [looking, setLooking] = useState(false)
  const [recent, setRecent] = useState<DispatchRow[]>([])

  // ── Camera ───────────────────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const lockedRef = useRef(false)
  const [cameraOn, setCameraOn] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const waybillRef = useRef<HTMLInputElement>(null)

  useEffect(() => { localStorage.setItem(SOURCE_KEY, source) }, [source])
  useEffect(() => { localStorage.setItem(CARRIER_KEY, carrier) }, [carrier])

  const isExternal = source === DispatchSource.EXTERNAL
  const isInHouse = source === DispatchSource.IN_HOUSE
  // External requires platform + carrier; in-house pulls them from the order lookup.
  const selectorsReady = isInHouse || (isExternal && !!carrier)

  function onWaybillChange(value: string) {
    setTrackingNumber(value)
    if (isExternal && !platformTouched && value.trim().length >= 2) {
      setPlatform(detectPlatform(value))
    }
  }

  // Open the confirm sheet for a waybill (from the input or the camera).
  const askConfirm = useCallback(async (rawWaybill: string) => {
    const wb = rawWaybill.trim().toUpperCase()
    if (!source) { setError('Pick the parcel source first.'); playBeep(false); vibrate([120, 60, 120]); return }
    if (!wb) { setError('Scan or enter a waybill number.'); playBeep(false); vibrate([120, 60, 120]); return }

    if (isInHouse) {
      // In-house: must match one of OUR orders. Look it up; block if missing.
      setError(null); setLooking(true)
      try {
        const lookup = await lookupOrder(wb)
        if (!lookup.found || !lookup.platform) {
          setError(`Waybill ${wb} is not in our system. In-house parcels must already exist.`)
          playBeep(false); vibrate([180, 100, 180, 100, 180])
          return
        }
        if (!lookup.packerComplete) {
          setError(`Waybill ${wb} is not packer-complete yet — the packer must scan it before it can be dispatched. Outbound cannot accept it.`)
          playBeep(false); vibrate([180, 100, 180, 100, 180])
          return
        }
        playBeep(true); vibrate([90, 50, 140])
        setPending({
          trackingNumber: wb,
          source: DispatchSource.IN_HOUSE,
          platform: lookup.platform,
          carrier: resolveCarrier(lookup),
          shopName: lookup.shopName || 'Unknown',
        })
      } catch {
        setError('Lookup failed. Please try again.')
        playBeep(false); vibrate([180, 100, 180, 100, 180])
      } finally {
        setLooking(false)
      }
      return
    }

    // External: platform + carrier are required, shop defaults to "Others".
    if (!carrier) { setError('Pick the courier first.'); playBeep(false); vibrate([120, 60, 120]); return }
    const plat = platformTouched && platform ? platform : detectPlatform(wb)
    setError(null)
    playBeep(true); vibrate([90, 50, 140])
    setPending({
      trackingNumber: wb,
      source: DispatchSource.EXTERNAL,
      platform: plat as Platform,
      carrier,
      shopName: 'Others',
    })
  }, [source, isInHouse, carrier, platform, platformTouched])

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
    if (!selectorsReady) { setError(isExternal ? 'Pick Courier first.' : 'Pick the parcel source first.'); return }
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
  }, [selectorsReady, isExternal])

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
        void askConfirm(text)
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
    if (!pending) return
    try {
      const row = await create.mutateAsync(pending)
      setRecent((r) => [row, ...r].slice(0, 8))
      playBeep(true); vibrate([250, 100, 200, 100, 200])
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
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' }}>OUTBOUND SCAN</div>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>{user?.username}</div>
        </div>
        <button
          onClick={handleLogout}
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
            color: '#f1f5f9', padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
        >Sign Out</button>
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 14px 28px', maxWidth: 560, width: '100%', margin: '0 auto' }}>
          {/* Source segmented toggle */}
          <Section label="Parcel Source">
            <div style={{ display: 'flex', gap: 8 }}>
              {Object.values(DispatchSource).map((s) => {
                const active = source === s
                const accent = s === DispatchSource.IN_HOUSE ? '#3b82f6' : '#f59e0b'
                return (
                  <button
                    key={s}
                    onClick={() => setSource(s)}
                    style={{
                      flex: 1, padding: '12px 0', borderRadius: 10, cursor: 'pointer',
                      background: active ? `${accent}28` : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${active ? `${accent}aa` : 'rgba(255,255,255,0.12)'}`,
                      color: '#fff', fontSize: 14, fontWeight: 700,
                    }}
                  >{DISPATCH_SOURCE_LABELS[s]}</button>
                )
              })}
            </div>
          </Section>

          {isInHouse && (
            <div style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.4)', color: '#bfdbfe', padding: '10px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600 }}>
              In-house parcels are matched against our orders — platform, shop and courier are filled automatically.
            </div>
          )}

          {isExternal && (
            <>
              <Section label="Courier">
                <select className="styled-select" value={carrier} onChange={(e) => setCarrier(e.target.value as Carrier)} style={darkSelect}>
                  <option value="">Select a courier…</option>
                  {CARRIERS.map((c) => <option key={c} value={c}>{CARRIER_LABELS[c]}</option>)}
                </select>
              </Section>
              <Section label="Platform (auto-detected)">
                <select
                  className="styled-select"
                  value={platform}
                  onChange={(e) => { setPlatform(e.target.value as Platform); setPlatformTouched(true) }}
                  style={darkSelect}
                >
                  <option value="">Detected from waybill…</option>
                  {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
                </select>
              </Section>
            </>
          )}

          <Section label="Waybill Number">
            <input
              ref={waybillRef}
              type="text"
              value={trackingNumber}
              onChange={(e) => onWaybillChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void askConfirm(trackingNumber) } }}
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
              onClick={() => void askConfirm(trackingNumber)}
              disabled={looking}
              style={{ flex: 2, padding: '14px 0', borderRadius: 12, background: 'linear-gradient(135deg, #3b82f6, #6366f1)', border: 'none', color: '#fff', fontSize: 15, fontWeight: 800, cursor: looking ? 'wait' : 'pointer', boxShadow: '0 4px 18px rgba(59,130,246,0.4)', opacity: looking ? 0.7 : 1 }}
            >{looking ? 'Looking up…' : 'Add Parcel'}</button>
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
                      {DISPATCH_SOURCE_LABELS[r.source]} · {CARRIER_LABELS[r.carrier]} · {r.shopName}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
      </main>

      {/* Camera overlay — full screen via portal to document.body */}
      {cameraOn && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 9999, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.7)', flexShrink: 0 }}>
            <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 16 }}>Scan Waybill</span>
            <button
              onClick={stopCamera}
              style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, color: '#f1f5f9', padding: '8px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >Cancel</button>
          </div>
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '78%', maxWidth: 320, aspectRatio: '3/2', border: '2px solid rgba(59,130,246,0.8)', borderRadius: 12, boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }} />
            </div>
          </div>
          <div style={{ padding: 16, background: 'rgba(0,0,0,0.7)', textAlign: 'center', flexShrink: 0 }}>
            <span style={{ color: '#94a3b8', fontSize: 14 }}>Point the camera at the waybill barcode</span>
          </div>
        </div>,
        document.body,
      )}

      {/* Confirm sheet */}
      {pending && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', zIndex: 60, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', background: '#0f172a', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Confirm parcel</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>Review before saving.</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(148,163,184,0.18)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Row label="Waybill" value={pending.trackingNumber} mono />
              <Row label="Source" value={DISPATCH_SOURCE_LABELS[pending.source]} valueColor={pending.source === DispatchSource.IN_HOUSE ? '#60a5fa' : '#fbbf24'} />
              <Row label="Platform" value={PLATFORM_LABELS[pending.platform]} />
              <Row label="Courier" value={CARRIER_LABELS[pending.carrier]} />
              <Row label="Shop" value={pending.shopName} />
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
