import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { api } from '../api/client'
import { useAuthStore } from '../stores/authStore'

type ScanMode = 'single' | 'bulk'

interface BulkEntry {
  trackingNumber: string
  status: 'pending' | 'staged' | 'not_found' | 'error'
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

export default function PickerAdminScan() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)

  async function handleLogout() {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
    setUser(null)
    navigate('/scan', { replace: true })
  }

  const [mode, setMode] = useState<ScanMode>('single')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null)
  const [bulkItems, setBulkItems] = useState<BulkEntry[]>([])
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const controlsRef = useRef<any>(null)
  const didSubmitRef = useRef(false)

  const singleMutation = useMutation({
    mutationFn: (tn: string) =>
      api.post<{ order: { trackingNumber: string } }>('/picker-admin/scan', { trackingNumber: tn }),
    onSuccess: (res) => {
      const tn = res.data.order.trackingNumber
      playBeep(true); vibrate(100)
      setFeedback({ type: 'success', message: `Staged: ${tn}` })
      setTimeout(() => setFeedback(null), 2500)
    },
    onError: (err: any, tn) => {
      const status = err?.response?.status
      playBeep(false); vibrate([80, 60, 80])
      setFeedback({
        type: status === 404 ? 'warning' : 'error',
        message: status === 404 ? `Not found in system: ${tn}`
          : status === 409 ? `${err?.response?.data?.error ?? 'Already assigned'}: ${tn}`
          : (err?.response?.data?.error ?? 'Failed to send'),
      })
      setTimeout(() => setFeedback(null), 3500)
    },
  })

  const bulkValidateMutation = useMutation({
    mutationFn: (tn: string) =>
      api.post<{ order: { trackingNumber: string } }>('/picker-admin/scan', { trackingNumber: tn }),
    onSuccess: (res) => {
      const tn = res.data.order.trackingNumber
      setBulkItems(prev => {
        if (prev.some(i => i.trackingNumber === tn)) {
          playBeep(false); vibrate([60, 40, 60])
          setFeedback({ type: 'warning', message: `Already in list: ${tn}` })
          setTimeout(() => setFeedback(null), 1800)
          return prev
        }
        playBeep(true); vibrate(100)
        setFeedback({ type: 'success', message: `Added: ${tn}` })
        setTimeout(() => setFeedback(null), 1500)
        return [...prev, { trackingNumber: tn, status: 'staged' }]
      })
    },
    onError: (err: any, tn) => {
      const status = err?.response?.status
      playBeep(false); vibrate([80, 60, 80])
      setFeedback({
        type: status === 404 ? 'warning' : 'error',
        message: status === 404 ? `Not found in system: ${tn}`
          : status === 409 ? `${err?.response?.data?.error ?? 'Already assigned'}: ${tn}`
          : (err?.response?.data?.error ?? 'Scan failed'),
      })
      setTimeout(() => setFeedback(null), 3000)
    },
  })

  // kept for potential future use (bulk send path)
  const bulkMutation = useMutation({
    mutationFn: (tns: string[]) =>
      api.post<{ results: { trackingNumber: string; status: 'staged' | 'not_found' | 'error' }[] }>(
        '/picker-admin/handheld-bulk-scan', { trackingNumbers: tns },
      ),
    onSuccess: (res) => {
      const results = res.data.results
      const staged = results.filter(r => r.status === 'staged').length
      const failed = results.filter(r => r.status !== 'staged').length
      setBulkItems(prev => prev.map(item => {
        const result = results.find(r => r.trackingNumber === item.trackingNumber)
        return result ? { ...item, status: result.status } : item
      }))
      if (staged > 0) { playBeep(true); vibrate(150) } else { playBeep(false); vibrate([80, 60, 80]) }
      setFeedback({
        type: failed === 0 ? 'success' : staged > 0 ? 'warning' : 'error',
        message: failed === 0 ? `${staged} item${staged !== 1 ? 's' : ''} sent` : `${staged} staged, ${failed} failed`,
      })
      setTimeout(() => { setFeedback(null); setBulkItems([]) }, 3000)
    },
    onError: (err: any) => {
      playBeep(false); vibrate([80, 60, 80])
      setFeedback({ type: 'error', message: err?.response?.data?.error ?? 'Failed to send' })
      setTimeout(() => setFeedback(null), 3000)
    },
  })

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop(); controlsRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null
    setCameraOpen(false); setCameraError(null); didSubmitRef.current = false
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
            bulkValidateMutation.mutate(code)
          }
        }
      }).then(controls => {
        if (!controlsRef.current) controlsRef.current = controls
      }).catch(() => {})
    }).catch(() => { setCameraError('Could not start video stream.'); setCameraOpen(false) })
    return () => { (reader as any).stopAsyncDecode?.() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen])

  useEffect(() => () => stopCamera(), [stopCamera])

  const openCamera = useCallback(async () => {
    setCameraError(null); didSubmitRef.current = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream; setCameraOpen(true)
    } catch (err: any) {
      const msg = err?.name === 'NotAllowedError' ? 'Camera permission denied. Please allow camera access.'
        : err?.name === 'NotFoundError' ? 'No camera found on this device.'
        : 'Could not open camera.'
      setCameraError(msg)
    }
  }, [])

  const isPending = singleMutation.isPending || bulkMutation.isPending || bulkValidateMutation.isPending

  const fbColors = {
    success: { bg: 'rgba(16,185,129,0.18)', border: 'rgba(16,185,129,0.45)', text: '#34d399' },
    warning: { bg: 'rgba(245,158,11,0.18)', border: 'rgba(245,158,11,0.45)', text: '#fbbf24' },
    error:   { bg: 'rgba(239,68,68,0.18)',  border: 'rgba(239,68,68,0.45)',  text: '#f87171' },
  }
  const fb = feedback ? fbColors[feedback.type] : null

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(170deg, #0f172a 0%, #1a0f35 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

      {/* Top bar */}
      <div style={{ width: '100%', maxWidth: '480px', padding: '20px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: 42, height: 42, borderRadius: '12px', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(124,58,237,0.45)', flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>
            </svg>
          </div>
          <div>
            <div style={{ color: '#f1f5f9', fontWeight: 800, fontSize: '17px', lineHeight: 1.2, letterSpacing: '-0.2px' }}>Picker Admin Scan</div>
            <div style={{ color: '#64748b', fontSize: '13px', marginTop: '1px' }}>{user?.username}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#a78bfa', background: 'rgba(124,58,237,0.2)', padding: '6px 14px', borderRadius: '9999px', border: '1px solid rgba(124,58,237,0.35)', letterSpacing: '0.06em' }}>
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
              background: mode === m ? '#7c3aed' : 'transparent',
              color: mode === m ? '#fff' : '#64748b',
              boxShadow: mode === m ? '0 2px 10px rgba(124,58,237,0.55)' : 'none',
              transition: 'all 0.2s',
            }}>
              {m === 'single' ? 'Single Scan' : 'Bulk Scan'}
            </button>
          ))}
        </div>

        {/* Info card */}
        <div style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.22)', borderRadius: '14px', padding: '14px 18px', marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <span style={{ fontSize: '14px', color: '#c4b5fd', lineHeight: 1.6, fontWeight: 500 }}>
            {mode === 'single'
              ? 'Scan one waybill — it will appear in the desktop staging area.'
              : 'Each scan is validated immediately. Only valid waybills are added.'}
          </span>
        </div>

        {/* Camera overlay */}
        {cameraOpen && (
          <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 100, overflow: 'hidden' }}>
            <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            {/* Scan frame */}
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -55%)', width: '92%', height: '270px', pointerEvents: 'none' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: 48, height: 48, borderTop: '5px solid #7c3aed', borderLeft: '5px solid #7c3aed', borderRadius: '5px 0 0 0' }} />
              <div style={{ position: 'absolute', top: 0, right: 0, width: 48, height: 48, borderTop: '5px solid #7c3aed', borderRight: '5px solid #7c3aed', borderRadius: '0 5px 0 0' }} />
              <div style={{ position: 'absolute', bottom: 0, left: 0, width: 48, height: 48, borderBottom: '5px solid #7c3aed', borderLeft: '5px solid #7c3aed', borderRadius: '0 0 0 5px' }} />
              <div style={{ position: 'absolute', bottom: 0, right: 0, width: 48, height: 48, borderBottom: '5px solid #7c3aed', borderRight: '5px solid #7c3aed', borderRadius: '0 0 5px 0' }} />
              <div style={{ position: 'absolute', top: '50%', left: '3%', right: '3%', height: '2px', background: 'linear-gradient(90deg, transparent, #7c3aed, transparent)', animation: 'scanline 1.5s ease-in-out infinite' }} />
              <div style={{ position: 'absolute', inset: 0, boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)' }} />
            </div>
            {/* Label */}
            <p style={{ position: 'absolute', top: '58%', left: 0, right: 0, textAlign: 'center', color: '#cbd5e1', fontSize: '16px', fontWeight: 600, margin: 0 }}>Align barcode within the frame</p>
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
            background: isPending || cameraOpen ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #7c3aed, #6d28d9)',
            cursor: isPending || cameraOpen ? 'not-allowed' : 'pointer',
            boxShadow: isPending || cameraOpen ? 'none' : '0 10px 36px rgba(124,58,237,0.5)',
            transition: 'all 0.2s', marginBottom: '20px', overflow: 'hidden',
          }}
        >
          <div style={{ padding: '32px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: 72, height: 72, borderRadius: '20px', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
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
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {cameraError}
          </div>
        )}

        {/* Feedback toast */}
        {feedback && fb && (
          <div style={{ background: fb.bg, border: `1.5px solid ${fb.border}`, borderRadius: '16px', padding: '20px', marginBottom: '20px', animation: 'fadeIn 0.2s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: fb.bg, border: `2px solid ${fb.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {feedback.type === 'success'
                  ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={fb.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  : feedback.type === 'warning'
                  ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={fb.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={fb.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '16px', fontWeight: 800, color: fb.text, letterSpacing: '-0.1px' }}>
                  {feedback.type === 'success' ? 'Success' : feedback.type === 'warning' ? 'Warning' : 'Error'}
                </div>
                <div style={{ fontSize: '14px', color: '#94a3b8', marginTop: '3px', wordBreak: 'break-all', lineHeight: 1.5 }}>{feedback.message}</div>
              </div>
            </div>
          </div>
        )}

        {/* Bulk list */}
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
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.06)', border: `1px solid ${entry.status === 'staged' ? 'rgba(16,185,129,0.2)' : entry.status === 'not_found' ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.1)'}`, borderRadius: '12px', padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: entry.status === 'staged' ? 'rgba(16,185,129,0.2)' : entry.status === 'not_found' ? 'rgba(245,158,11,0.2)' : entry.status === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, flexShrink: 0, color: entry.status === 'staged' ? '#34d399' : entry.status === 'not_found' ? '#fbbf24' : entry.status === 'error' ? '#f87171' : '#64748b' }}>
                      {entry.status === 'staged' ? '✓' : entry.status === 'not_found' ? '?' : entry.status === 'error' ? '!' : i + 1}
                    </div>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: '#e2e8f0', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '0.03em' }}>{entry.trackingNumber}</span>
                  </div>
                  {entry.status !== 'pending' && (
                    <span style={{ fontSize: '11px', fontWeight: 800, padding: '4px 10px', borderRadius: '9999px', flexShrink: 0, marginLeft: '8px', letterSpacing: '0.04em', background: entry.status === 'staged' ? 'rgba(16,185,129,0.15)' : entry.status === 'not_found' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)', color: entry.status === 'staged' ? '#34d399' : entry.status === 'not_found' ? '#fbbf24' : '#f87171', border: `1px solid ${entry.status === 'staged' ? 'rgba(16,185,129,0.35)' : entry.status === 'not_found' ? 'rgba(245,158,11,0.35)' : 'rgba(239,68,68,0.35)'}` }}>
                      {entry.status === 'staged' ? 'STAGED' : entry.status === 'not_found' ? 'NOT FOUND' : 'ERROR'}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div style={{ fontSize: '13px', color: '#475569', textAlign: 'center', marginBottom: '12px', fontWeight: 500 }}>
              Items are staged on desktop as they are scanned.
            </div>
            <button onClick={() => setBulkItems([])} style={{ width: '100%', padding: '18px 0', borderRadius: '16px', border: '1px solid rgba(124,58,237,0.35)', background: 'rgba(124,58,237,0.12)', color: '#a78bfa', fontSize: '17px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', transition: 'all 0.2s' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Done — Clear List ({bulkItems.length})
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
