import { useState, useEffect, useRef, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'
import PlatformBadge from '../components/shared/PlatformBadge'
import DelayBadge from '../components/DelayBadge'

interface PackerOrder {
  id: string
  trackingNumber: string
  platform: string
  status: string
  delayLevel: number
}

function playBeep(success: boolean) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    if (success) {
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08)
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.35, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2)
    } else {
      osc.frequency.setValueAtTime(300, ctx.currentTime)
      osc.type = 'square'
      gain.gain.setValueAtTime(0.2, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3)
    }
  } catch {}
}

export default function PackerMobile() {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)

  const [pendingOrder, setPendingOrder] = useState<PackerOrder | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [manualInput, setManualInput] = useState('')

  // Camera state
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const controlsRef = useRef<any>(null)
  const didScanRef = useRef(false)

  useEffect(() => {
    if (!errorMsg) return
    const t = setTimeout(() => setErrorMsg(null), 4000)
    return () => clearTimeout(t)
  }, [errorMsg])

  useEffect(() => {
    if (!successMsg) return
    const t = setTimeout(() => setSuccessMsg(null), 3000)
    return () => clearTimeout(t)
  }, [successMsg])

  const completeMutation = useMutation({
    mutationFn: (trackingNumber: string) =>
      api.post('/packer/complete', { trackingNumber }),
    onSuccess: (_, trackingNumber) => {
      setPendingOrder(null)
      setSuccessMsg(`Packed: ${trackingNumber}`)
      playBeep(true)
      try { navigator.vibrate?.(100) } catch {}
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      setPendingOrder(null)
      setErrorMsg(err?.response?.data?.error ?? 'Complete failed. Try again.')
      playBeep(false)
      try { navigator.vibrate?.([80, 60, 80]) } catch {}
    },
  })

  // ── Camera ──────────────────────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop(); controlsRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null
    setCameraOpen(false); setCameraError(null); didScanRef.current = false
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  useEffect(() => {
    if (!cameraOpen) return
    if (!videoRef.current || !streamRef.current) return
    const video = videoRef.current
    video.srcObject = streamRef.current
    const reader = new BrowserMultiFormatReader()
    video.play().then(() => {
      reader.decodeFromStream(streamRef.current!, video, (result, _err, controls) => {
        if (controls && !controlsRef.current) controlsRef.current = controls
        if (result && !didScanRef.current) {
          didScanRef.current = true
          const code = result.getText()
          stopCamera()
          handleScan(code)
        }
      }).then(c => { if (!controlsRef.current) controlsRef.current = c }).catch(() => {})
    }).catch(() => { setCameraError('Could not start video.'); setCameraOpen(false) })
    return () => { (reader as any).stopAsyncDecode?.() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen])

  const openCamera = useCallback(async () => {
    setCameraError(null); didScanRef.current = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream; setCameraOpen(true)
    } catch (err: any) {
      const msg = err?.name === 'NotAllowedError' ? 'Camera permission denied.'
        : err?.name === 'NotFoundError' ? 'No camera found.'
        : 'Could not open camera.'
      setCameraError(msg)
    }
  }, [])

  // ── Handlers ────────────────────────────────────────────────────────────────

  function extractTrackingNumber(raw: string): string {
    const s = raw.trim()
    try {
      const url = new URL(s)
      const tn = url.searchParams.get('tn') || url.searchParams.get('tracking')
      if (tn) return tn.trim().toUpperCase()
      const parts = url.pathname.split('/').filter(Boolean)
      if (parts.length > 0) return parts[parts.length - 1].toUpperCase()
    } catch {}
    return s.toUpperCase()
  }

  async function handleScan(raw: string) {
    setErrorMsg(null)
    const tn = extractTrackingNumber(raw)
    setLookingUp(true)
    try {
      const res = await api.get<{ order: PackerOrder }>(`/packer/find?tn=${encodeURIComponent(tn)}`)
      setPendingOrder(res.data.order)
      playBeep(true)
      try { navigator.vibrate?.(80) } catch {}
    } catch (err: any) {
      const apiError = err?.response?.data?.error
      const msg = apiError
        ? `${apiError} — scanned: "${tn}"`
        : `"${tn}" not found or not ready for packing`
      setErrorMsg(msg)
      playBeep(false)
      try { navigator.vibrate?.([80, 60, 80]) } catch {}
    } finally {
      setLookingUp(false)
    }
  }

  function submitManual() {
    if (!manualInput.trim()) return
    handleScan(manualInput.trim())
    setManualInput('')
  }

  async function handleLogout() {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
    setUser(null)
  }

  const isPending = completeMutation.isPending || lookingUp

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100dvh', background: '#f1f5f9', overflowX: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{
        background: 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)',
        padding: '14px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 10,
        boxShadow: '0 2px 16px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <div style={{
            width: 40, height: 40, borderRadius: '11px', flexShrink: 0,
            background: 'linear-gradient(135deg, #059669, #0284c7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(5,150,105,0.45)',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: '#ecfdf5', fontWeight: 700, fontSize: '15px', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.username}
            </div>
            <div style={{ color: '#6ee7b7', fontSize: '11px', marginTop: '1px' }}>
              Packer
            </div>
          </div>
        </div>
        <button onClick={handleLogout} style={{
          background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '8px', color: '#a7f3d0', fontSize: '13px', fontWeight: 600,
          padding: '8px 12px', cursor: 'pointer', minHeight: '40px', flexShrink: 0,
          transition: 'background 0.15s',
        }}>
          Sign Out
        </button>
      </div>

      <div style={{ padding: '16px', maxWidth: '520px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* ── Toasts ── */}
        {successMsg && (
          <div style={{
            background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0',
            borderRadius: '12px', padding: '12px 16px', marginBottom: '14px',
            fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {successMsg}
          </div>
        )}

        {errorMsg && (
          <div style={{
            background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca',
            borderRadius: '12px', padding: '12px 16px', marginBottom: '14px',
            fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {errorMsg}
          </div>
        )}

        {cameraError && (
          <div style={{
            background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca',
            borderRadius: '12px', padding: '12px 16px', marginBottom: '14px',
            fontSize: '14px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {cameraError}
          </div>
        )}

        {/* ── Camera scan button (main CTA) ── */}
        <button
          onClick={openCamera}
          disabled={isPending || cameraOpen}
          style={{
            width: '100%', border: 'none', borderRadius: '20px',
            background: isPending || cameraOpen
              ? '#e2e8f0'
              : 'linear-gradient(135deg, #059669 0%, #0284c7 100%)',
            cursor: isPending || cameraOpen ? 'not-allowed' : 'pointer',
            marginBottom: '14px', padding: 0,
            boxShadow: isPending || cameraOpen ? 'none' : '0 8px 28px rgba(5,150,105,0.38)',
            transition: 'all 0.2s', overflow: 'hidden',
          }}
        >
          <div style={{ padding: '22px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '15px', flexShrink: 0,
              background: isPending || cameraOpen ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {lookingUp ? (
                <div style={{ width: 28, height: 28, border: '3px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={isPending || cameraOpen ? '#94a3b8' : 'white'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              )}
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ color: isPending || cameraOpen ? '#94a3b8' : '#fff', fontSize: '21px', fontWeight: 800, letterSpacing: '-0.4px', lineHeight: 1.15 }}>
                {lookingUp ? 'Looking up...' : isPending ? 'Processing...' : 'Scan Barcode'}
              </div>
              <div style={{ color: isPending || cameraOpen ? '#94a3b8' : 'rgba(255,255,255,0.65)', fontSize: '13px', marginTop: '4px', fontWeight: 500 }}>
                {lookingUp ? 'Checking order status' : 'Tap to open camera'}
              </div>
            </div>
          </div>
        </button>

        {/* ── Divider ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
          <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>or type manually</span>
          <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
        </div>

        {/* ── Manual input ── */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          <input
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitManual() }}
            disabled={isPending}
            placeholder="Enter tracking number..."
            style={{
              flex: 1, padding: '13px 14px',
              fontSize: '15px', fontFamily: 'monospace',
              border: '2px solid #e2e8f0', borderRadius: '12px',
              outline: 'none', boxSizing: 'border-box',
              background: '#fff', color: '#0f172a',
              letterSpacing: '0.02em',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => (e.target.style.borderColor = '#059669')}
            onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
          />
          <button
            onClick={submitManual}
            disabled={!manualInput.trim() || isPending}
            style={{
              padding: '0 18px', border: 'none', borderRadius: '12px',
              background: manualInput.trim() && !isPending ? '#059669' : '#e2e8f0',
              color: manualInput.trim() && !isPending ? '#fff' : '#94a3b8',
              fontWeight: 700, fontSize: '18px', cursor: manualInput.trim() && !isPending ? 'pointer' : 'not-allowed',
              flexShrink: 0, transition: 'all 0.15s', minHeight: '50px',
            }}
          >
            →
          </button>
        </div>

        {/* ── Ready state ── */}
        <div style={{
          textAlign: 'center', padding: '32px 20px',
          background: '#fff', borderRadius: '16px',
          border: '2px dashed #d1fae5',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', background: '#f0fdf4',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9V5a2 2 0 0 1 2-2h4" /><path d="M3 15v4a2 2 0 0 0 2 2h4" />
              <path d="M21 9V5a2 2 0 0 0-2-2h-4" /><path d="M21 15v4a2 2 0 0 1-2 2h-4" />
              <line x1="7" y1="12" x2="7" y2="12" strokeWidth="3" />
              <line x1="10" y1="9" x2="10" y2="15" strokeWidth="1.5" />
              <line x1="13" y1="9" x2="13" y2="15" strokeWidth="3" />
              <line x1="16" y1="9" x2="16" y2="15" strokeWidth="1.5" />
            </svg>
          </div>
          <div style={{ fontWeight: 700, color: '#374151', fontSize: '15px', marginBottom: '4px' }}>Ready to pack</div>
          <div style={{ fontSize: '13px', color: '#9ca3af' }}>Scan a barcode to look up an order</div>
        </div>
      </div>

      {/* ── Camera overlay ── */}
      {cameraOpen && (
        <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 100, overflow: 'hidden' }}>
          <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          {/* Scan frame */}
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -55%)', width: '86%', height: '240px', pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 44, height: 44, borderTop: '4px solid #10b981', borderLeft: '4px solid #10b981', borderRadius: '4px 0 0 0' }} />
            <div style={{ position: 'absolute', top: 0, right: 0, width: 44, height: 44, borderTop: '4px solid #10b981', borderRight: '4px solid #10b981', borderRadius: '0 4px 0 0' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, width: 44, height: 44, borderBottom: '4px solid #10b981', borderLeft: '4px solid #10b981', borderRadius: '0 0 0 4px' }} />
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: 44, height: 44, borderBottom: '4px solid #10b981', borderRight: '4px solid #10b981', borderRadius: '0 0 4px 0' }} />
            <div style={{ position: 'absolute', top: '50%', left: '3%', right: '3%', height: '2px', background: 'linear-gradient(90deg, transparent, #10b981, transparent)', animation: 'scanline 1.5s ease-in-out infinite' }} />
            <div style={{ position: 'absolute', inset: 0, boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }} />
          </div>
          <p style={{ position: 'absolute', top: '60%', left: 0, right: 0, textAlign: 'center', color: '#cbd5e1', fontSize: '15px', fontWeight: 600, margin: 0 }}>
            Align barcode within the frame
          </p>
          <button onClick={stopCamera} style={{
            position: 'absolute', bottom: '48px', left: '50%', transform: 'translateX(-50%)',
            padding: '16px 64px', borderRadius: '14px',
            border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.18)',
            color: '#f87171', fontSize: '17px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            Cancel
          </button>
        </div>
      )}

      {/* ── Confirm bottom sheet ── */}
      {pendingOrder && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          zIndex: 200,
        }}>
          <div style={{
            background: '#fff', borderRadius: '24px 24px 0 0', padding: '28px 20px 40px',
            width: '100%', maxWidth: '520px',
          }}>
            <div style={{ width: 40, height: 4, borderRadius: '9999px', background: '#e2e8f0', margin: '0 auto 24px' }} />
            <h2 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
              Complete packing?
            </h2>
            <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#64748b' }}>
              Confirm this order has been packed and is ready.
            </p>
            <div style={{
              fontFamily: 'monospace', fontSize: '14px', fontWeight: 700,
              color: '#065f46', background: '#f0fdf4', borderRadius: '10px',
              padding: '12px 16px', marginBottom: '14px', wordBreak: 'break-all',
              border: '1px solid #bbf7d0', letterSpacing: '0.02em',
            }}>
              {pendingOrder.trackingNumber}
            </div>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '24px' }}>
              <PlatformBadge platform={pendingOrder.platform} />
              <DelayBadge level={pendingOrder.delayLevel} />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setPendingOrder(null)}
                disabled={completeMutation.isPending}
                style={{
                  flex: 1, padding: '16px', border: '2px solid #e2e8f0',
                  borderRadius: '14px', background: '#fff', cursor: 'pointer',
                  fontSize: '16px', fontWeight: 600, color: '#475569', minHeight: '56px',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => completeMutation.mutate(pendingOrder.trackingNumber)}
                disabled={completeMutation.isPending}
                style={{
                  flex: 2, padding: '16px', border: 'none', borderRadius: '14px',
                  background: completeMutation.isPending ? '#6ee7b7' : '#059669',
                  cursor: completeMutation.isPending ? 'not-allowed' : 'pointer',
                  fontSize: '16px', fontWeight: 700, color: '#fff', minHeight: '56px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  transition: 'background 0.15s',
                }}
              >
                {completeMutation.isPending ? (
                  <>
                    <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    Completing...
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Confirm Packed
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes scanline { 0%,100%{opacity:.3;transform:translateY(-36px)}50%{opacity:1;transform:translateY(36px)} }
      `}</style>
    </div>
  )
}
