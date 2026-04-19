import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { api } from '../api/client'
import { useAuthStore } from '../stores/authStore'
import ScanCelebration from '../components/shared/ScanCelebration'

type ScanMode = 'single' | 'bulk'

interface BulkEntry {
  trackingNumber: string
  duplicate: boolean
}

// ── Haptic + Audio feedback ─────────────────────────────────────────────────
function playBeep(success: boolean) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    if (success) {
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08)
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.35, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.2)
    } else {
      osc.frequency.setValueAtTime(300, ctx.currentTime)
      osc.type = 'square'
      gain.gain.setValueAtTime(0.2, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.3)
    }
  } catch {}
}

function vibrate(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern) } catch {}
}

export default function InboundScan() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)

  async function handleLogout() {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
    setUser(null)
    navigate('/scan', { replace: true })
  }
  const [mode, setMode] = useState<ScanMode>('single')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'duplicate'; message: string } | null>(null)
  const [celebration, setCelebration] = useState<{ msg: string; variant: 'success' | 'error' } | null>(null)
  const [bulkItems, setBulkItems] = useState<BulkEntry[]>([])
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const controlsRef = useRef<any>(null)
  const didSubmitRef = useRef(false)

  const singleMutation = useMutation({
    mutationFn: (tn: string) => api.post('/orders/handheld-scan', { trackingNumber: tn }),
    onSuccess: (_res, tn) => {
      playBeep(true)
      vibrate(100)
      setFeedback({ type: 'success', message: `Sent to desktop: ${tn}` })
      setCelebration({ msg: `Sent: ${tn}`, variant: 'success' })
      setTimeout(() => setFeedback(null), 2500)
    },
    onError: (err: any, tn) => {
      const isDuplicate = err?.response?.status === 409
      playBeep(false)
      vibrate([80, 60, 80])
      setFeedback({
        type: isDuplicate ? 'duplicate' : 'error',
        message: isDuplicate ? `Already in system: ${tn}` : (err?.response?.data?.error ?? 'Failed to send'),
      })
      setTimeout(() => setFeedback(null), 3500)
    },
  })

  const bulkMutation = useMutation({
    mutationFn: (tns: string[]) => api.post('/orders/handheld-bulk-scan', { trackingNumbers: tns }),
    onSuccess: (_res, tns) => {
      playBeep(true)
      vibrate(150)
      setFeedback({ type: 'success', message: `${tns.length} item${tns.length !== 1 ? 's' : ''} sent to desktop` })
      setCelebration({ msg: `${tns.length} item${tns.length !== 1 ? 's' : ''} sent`, variant: 'success' })
      setBulkItems([])
      setTimeout(() => setFeedback(null), 3000)
    },
    onError: (err: any) => {
      playBeep(false)
      vibrate([80, 60, 80])
      setFeedback({ type: 'error', message: err?.response?.data?.error ?? 'Failed to send' })
      setTimeout(() => setFeedback(null), 3000)
    },
  })

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop()
    controlsRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraOpen(false)
    setCameraError(null)
    didSubmitRef.current = false
  }, [])

  useEffect(() => {
    if (!cameraOpen) return
    if (!videoRef.current || !streamRef.current) return
    const video = videoRef.current
    video.srcObject = streamRef.current
    const reader = new BrowserMultiFormatReader()
    video.play().then(() => {
      reader.decodeFromStream(streamRef.current!, video, (result, _err, controls) => {
        if (controls && !controlsRef.current) controlsRef.current = controls
        if (result && !didSubmitRef.current) {
          didSubmitRef.current = true
          const code = result.getText()
          stopCamera()
          if (mode === 'single') {
            singleMutation.mutate(code)
          } else {
            setBulkItems(prev => {
              const exists = prev.some(i => i.trackingNumber === code)
              if (exists) {
                playBeep(false); vibrate([60, 40, 60])
                return prev.map(i => i.trackingNumber === code ? { ...i, duplicate: true } : i)
              }
              playBeep(true); vibrate(80)
              return [...prev, { trackingNumber: code, duplicate: false }]
            })
            setFeedback({ type: 'success', message: `Added: ${code}` })
            setTimeout(() => setFeedback(null), 1500)
          }
        }
      }).then(controls => {
        if (!controlsRef.current) controlsRef.current = controls
      }).catch(() => {})
    }).catch(() => { setCameraError('Could not start video stream.'); setCameraOpen(false) })
    return () => { reader.stopAsyncDecode?.() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen])

  useEffect(() => () => stopCamera(), [stopCamera])

  const openCamera = useCallback(async () => {
    setCameraError(null)
    didSubmitRef.current = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      setCameraOpen(true)
    } catch (err: any) {
      const msg = err?.name === 'NotAllowedError'
        ? 'Camera permission denied. Please allow camera access.'
        : err?.name === 'NotFoundError'
        ? 'No camera found on this device.'
        : 'Could not open camera.'
      setCameraError(msg)
    }
  }, [])

  const isPending = singleMutation.isPending || bulkMutation.isPending

  const fbColors = {
    success: { bg: 'rgba(16,185,129,0.18)', border: 'rgba(16,185,129,0.45)', text: '#34d399', label: 'Sent to Desktop' },
    duplicate: { bg: 'rgba(245,158,11,0.18)', border: 'rgba(245,158,11,0.45)', text: '#fbbf24', label: 'Duplicate' },
    error: { bg: 'rgba(239,68,68,0.18)', border: 'rgba(239,68,68,0.45)', text: '#f87171', label: 'Error' },
  }
  const fb = feedback ? fbColors[feedback.type] : null

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(170deg, #0f172a 0%, #0f2444 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

      <ScanCelebration
        show={!!celebration}
        message={celebration?.msg}
        variant={celebration?.variant}
        onDone={() => setCelebration(null)}
      />

      {/* Top bar */}
      <div style={{ width: '100%', maxWidth: '480px', padding: '20px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: 42, height: 42, borderRadius: '12px', background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(37,99,235,0.45)', flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <div>
            <div style={{ color: '#f1f5f9', fontWeight: 800, fontSize: '17px', lineHeight: 1.2, letterSpacing: '-0.2px' }}>Inbound Scan</div>
            <div style={{ color: '#64748b', fontSize: '13px', marginTop: '1px' }}>{user?.username}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#60a5fa', background: 'rgba(37,99,235,0.2)', padding: '6px 14px', borderRadius: '9999px', border: '1px solid rgba(37,99,235,0.35)', letterSpacing: '0.06em' }}>
            HANDHELD
          </div>
          <button onClick={handleLogout} style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px', color: '#94a3b8', fontSize: '13px', fontWeight: 600,
            padding: '8px 14px', cursor: 'pointer', minHeight: '44px',
          }}>
            Sign Out
          </button>
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: '480px', padding: '20px 16px 32px', boxSizing: 'border-box', flex: 1 }}>

        {/* Mode toggle */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.07)', borderRadius: '16px', padding: '5px', marginBottom: '24px', border: '1px solid rgba(255,255,255,0.08)' }}>
          {(['single', 'bulk'] as ScanMode[]).map(m => (
            <button key={m} onClick={() => { setMode(m); setFeedback(null) }} style={{
              flex: 1, padding: '13px 0', borderRadius: '12px', border: 'none',
              fontWeight: 700, fontSize: '15px', cursor: 'pointer',
              background: mode === m ? '#2563eb' : 'transparent',
              color: mode === m ? '#fff' : '#64748b',
              boxShadow: mode === m ? '0 2px 10px rgba(37,99,235,0.55)' : 'none',
              transition: 'all 0.2s',
            }}>
              {m === 'single' ? 'Single Scan' : 'Bulk Scan'}
            </button>
          ))}
        </div>

        {/* Info card */}
        <div style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.22)', borderRadius: '14px', padding: '14px 18px', marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span style={{ fontSize: '14px', color: '#93c5fd', lineHeight: 1.6, fontWeight: 500 }}>
            {mode === 'single'
              ? 'Scan one waybill — desktop will prompt for carrier & shop.'
              : 'Scan multiple waybills, then send all to desktop at once.'}
          </span>
        </div>

        {/* Camera overlay */}
        {cameraOpen && (
          <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 100, overflow: 'hidden' }}>
            <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            {/* Scan frame */}
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -55%)', width: '92%', height: '270px', pointerEvents: 'none' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: 48, height: 48, borderTop: '5px solid #22c55e', borderLeft: '5px solid #22c55e', borderRadius: '5px 0 0 0' }} />
              <div style={{ position: 'absolute', top: 0, right: 0, width: 48, height: 48, borderTop: '5px solid #22c55e', borderRight: '5px solid #22c55e', borderRadius: '0 5px 0 0' }} />
              <div style={{ position: 'absolute', bottom: 0, left: 0, width: 48, height: 48, borderBottom: '5px solid #22c55e', borderLeft: '5px solid #22c55e', borderRadius: '0 0 0 5px' }} />
              <div style={{ position: 'absolute', bottom: 0, right: 0, width: 48, height: 48, borderBottom: '5px solid #22c55e', borderRight: '5px solid #22c55e', borderRadius: '0 0 5px 0' }} />
              <div style={{ position: 'absolute', top: '50%', left: '3%', right: '3%', height: '2px', background: 'linear-gradient(90deg, transparent, #22c55e, transparent)', animation: 'scanline 1.5s ease-in-out infinite' }} />
              <div style={{ position: 'absolute', inset: 0, boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)' }} />
            </div>
            {/* Label */}
            <p style={{ position: 'absolute', top: '58%', left: 0, right: 0, textAlign: 'center', color: '#cbd5e1', fontSize: '16px', fontWeight: 600, margin: 0, letterSpacing: '0.01em' }}>Align barcode within the frame</p>
            {/* Cancel button */}
            <button onClick={stopCamera} style={{ position: 'absolute', bottom: '48px', left: '50%', transform: 'translateX(-50%)', padding: '18px 72px', borderRadius: '16px', border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.18)', color: '#f87171', fontSize: '18px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Cancel
            </button>
            <style>{`@keyframes scanline { 0%,100%{opacity:.3;transform:translateY(-40px)}50%{opacity:1;transform:translateY(40px)} }`}</style>
          </div>
        )}

        {/* Scan button */}
        <button
          onClick={openCamera}
          disabled={isPending || cameraOpen}
          style={{
            width: '100%', padding: '0', borderRadius: '22px', border: 'none',
            background: isPending || cameraOpen ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            cursor: isPending || cameraOpen ? 'not-allowed' : 'pointer',
            boxShadow: isPending || cameraOpen ? 'none' : '0 10px 36px rgba(37,99,235,0.5)',
            transition: 'all 0.2s', marginBottom: '20px', overflow: 'hidden',
          }}
        >
          <div style={{ padding: '32px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: 72, height: 72, borderRadius: '20px', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: isPending || cameraOpen ? '#475569' : '#fff', fontSize: '22px', fontWeight: 800, letterSpacing: '-0.5px' }}>
                {isPending ? 'Processing...' : mode === 'single' ? 'Scan Barcode' : 'Scan Next Barcode'}
              </div>
              <div style={{ color: isPending || cameraOpen ? '#334155' : 'rgba(255,255,255,0.65)', fontSize: '15px', marginTop: '5px', fontWeight: 500 }}>
                Tap to open camera
              </div>
            </div>
          </div>
        </button>

        {/* Camera error */}
        {cameraError && (
          <div style={{ background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '14px', padding: '14px 18px', fontSize: '15px', color: '#f87171', fontWeight: 600, marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {cameraError}
          </div>
        )}

        {/* Feedback toast */}
        {feedback && fb && (
          <div style={{
            background: fb.bg, border: `1.5px solid ${fb.border}`,
            borderRadius: '16px', padding: '20px 20px', marginBottom: '20px',
            animation: 'fadeIn 0.2s ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: fb.bg, border: `2px solid ${fb.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {feedback.type === 'success'
                  ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={fb.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  : feedback.type === 'duplicate'
                  ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={fb.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={fb.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '16px', fontWeight: 800, color: fb.text, letterSpacing: '-0.1px' }}>
                  {feedback.type === 'success' ? 'Success' : feedback.type === 'duplicate' ? 'Duplicate' : 'Error'}
                </div>
                <div style={{ fontSize: '14px', color: '#94a3b8', marginTop: '3px', wordBreak: 'break-all', lineHeight: 1.5 }}>{feedback.message}</div>
              </div>
            </div>
          </div>
        )}

        {/* Bulk list + send button */}
        {mode === 'bulk' && bulkItems.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Scanned ({bulkItems.length})
              </div>
              <button onClick={() => setBulkItems([])} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#64748b', fontWeight: 600, padding: '5px 12px' }}>
                Clear all
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px', maxHeight: '260px', overflowY: 'auto' }}>
              {bulkItems.map((entry, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.06)', border: `1px solid ${entry.duplicate ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.1)'}`, borderRadius: '12px', padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: entry.duplicate ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: entry.duplicate ? '#f59e0b' : '#34d399', flexShrink: 0 }}>
                      {entry.duplicate ? '!' : i + 1}
                    </div>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: '#e2e8f0', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '0.03em' }}>{entry.trackingNumber}</span>
                  </div>
                  {entry.duplicate && (
                    <span style={{ fontSize: '11px', fontWeight: 800, padding: '4px 10px', borderRadius: '9999px', background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.35)', flexShrink: 0, marginLeft: '8px', letterSpacing: '0.04em' }}>
                      DUP
                    </span>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={() => bulkMutation.mutate(bulkItems.map(i => i.trackingNumber))}
              disabled={bulkMutation.isPending}
              style={{
                width: '100%', padding: '18px 0', borderRadius: '16px', border: 'none',
                background: bulkMutation.isPending ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #16a34a, #15803d)',
                color: bulkMutation.isPending ? '#475569' : '#fff', fontSize: '17px', fontWeight: 700,
                cursor: bulkMutation.isPending ? 'not-allowed' : 'pointer',
                boxShadow: bulkMutation.isPending ? 'none' : '0 8px 24px rgba(22,163,74,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                transition: 'all 0.2s',
              }}
            >
              {bulkMutation.isPending ? (
                <><div style={{ width: 18, height: 18, border: '2.5px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Sending...</>
              ) : (
                <><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>Send {bulkItems.length} Item{bulkItems.length !== 1 ? 's' : ''} to Desktop</>
              )}
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(-8px) } to { opacity:1; transform:translateY(0) } }
      `}</style>
    </div>
  )
}
