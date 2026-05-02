import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'
import { disconnectSocket } from '../lib/socket'
import { useScanStock } from '../api/stock'
import type { ScanResult } from '../api/stock'

function playBeep(success: boolean) {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
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
  } catch { /* noop */ }
}

function vibrate(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern) } catch { /* noop */ }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function StockScan() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const lockedRef = useRef(false)

  const [cameraOn, setCameraOn] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<ScanResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const scanMutation = useScanStock()

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop()
    controlsRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraOn(false)
  }, [])

  const startCamera = useCallback(async () => {
    setCameraError(null)
    setErrorMessage(null)
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
  }, [])

  // Bind reader once stream is ready
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
        const code = result.getText().trim()
        if (!UUID_RE.test(code)) {
          // Ignore non-UUID barcodes (could be a warehouse waybill scanned by mistake)
          return
        }
        lockedRef.current = true
        playBeep(true); vibrate(100)
        scanMutation.mutate(code, {
          onSuccess: (data) => {
            setLastResult(data)
            setErrorMessage(null)
            // Resume scanning shortly after for the next box
            window.setTimeout(() => { lockedRef.current = false }, 1500)
          },
          onError: (err: unknown) => {
            const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
              ?? 'Scan failed'
            setErrorMessage(msg)
            setLastResult(null)
            playBeep(false); vibrate([80, 60, 80])
            window.setTimeout(() => { lockedRef.current = false }, 1500)
          },
        })
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

  // Cleanup on unmount
  useEffect(() => () => stopCamera(), [stopCamera])

  async function handleLogout() {
    try { await api.post('/auth/logout') } catch { /* ignore */ }
    disconnectSocket()
    setUser(null)
    navigate('/scan', { replace: true })
  }

  const inStock = lastResult?.direction === 'IN'

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex', flexDirection: 'column',
      background: '#0f172a', color: '#fff',
    }}>
      {/* Header */}
      <header style={{
        padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(15,23,42,0.95)', borderBottom: '1px solid rgba(148,163,184,0.2)',
      }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.04em' }}>STOCK SCAN</div>
          <div style={{ fontSize: '11px', color: '#94a3b8' }}>{user?.username}</div>
        </div>
        <button
          onClick={handleLogout}
          style={{
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
            color: '#f1f5f9', padding: '7px 14px', borderRadius: '8px',
            fontSize: '12px', fontWeight: 600, cursor: 'pointer',
          }}
        >
          Sign Out
        </button>
      </header>

      {/* Camera area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#000' }}>
        {cameraOn ? (
          <>
            <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <div style={{
                width: '70%', maxWidth: '280px', aspectRatio: '1/1',
                border: '3px solid rgba(34,197,94,0.85)', borderRadius: '14px',
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
              }} />
            </div>
          </>
        ) : (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '16px',
            padding: '20px',
          }}>
            <div style={{ fontSize: '52px' }}>📦</div>
            <div style={{ fontSize: '17px', fontWeight: 700, textAlign: 'center' }}>
              Ready to scan stock items
            </div>
            <div style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', maxWidth: '280px' }}>
              Tap below to open the camera. Each scan toggles the item between
              <strong style={{ color: '#22c55e' }}> IN STOCK</strong> and
              <strong style={{ color: '#ef4444' }}> OUT</strong>.
            </div>
            {cameraError && (
              <div style={{
                background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
                color: '#fecaca', padding: '10px 14px', borderRadius: '8px',
                fontSize: '13px', maxWidth: '320px', textAlign: 'center',
              }}>
                {cameraError}
              </div>
            )}
            <button
              onClick={startCamera}
              style={{
                marginTop: '4px', padding: '14px 28px',
                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                color: '#fff', border: 'none', borderRadius: '12px',
                fontSize: '15px', fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 4px 18px rgba(34,197,94,0.4)',
                minHeight: '52px', minWidth: '180px',
              }}
            >
              Open Camera
            </button>
          </div>
        )}
      </div>

      {/* Bottom result banner */}
      <div style={{
        padding: '14px 18px', minHeight: '88px',
        background: '#0f172a', borderTop: '1px solid rgba(148,163,184,0.15)',
      }}>
        {errorMessage ? (
          <div style={{
            background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
            color: '#fecaca', padding: '14px', borderRadius: '10px',
            display: 'flex', flexDirection: 'column', gap: '4px',
          }}>
            <div style={{ fontWeight: 700, fontSize: '14px' }}>✗ {errorMessage}</div>
            <div style={{ fontSize: '12px', color: '#fda4af' }}>Try another QR or check the label.</div>
          </div>
        ) : lastResult ? (
          <div style={{
            background: inStock ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
            border: `1px solid ${inStock ? 'rgba(34,197,94,0.45)' : 'rgba(239,68,68,0.45)'}`,
            color: inStock ? '#bbf7d0' : '#fecaca',
            padding: '14px', borderRadius: '10px',
            display: 'flex', flexDirection: 'column', gap: '4px',
          }}>
            <div style={{ fontWeight: 800, fontSize: '15px' }}>
              {inStock ? '↓ Checked IN' : '↑ Checked OUT'}
            </div>
            <div style={{ fontSize: '13px' }}>
              {lastResult.item.productType} · {lastResult.item.category} · {lastResult.item.weightKg}kg
            </div>
          </div>
        ) : (
          <div style={{
            color: '#94a3b8', fontSize: '13px', textAlign: 'center',
            padding: '24px 0',
          }}>
            Last scan result will appear here.
          </div>
        )}
      </div>
    </div>
  )
}
