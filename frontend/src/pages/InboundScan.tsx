import { useState, useRef, useEffect, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { NotFoundException } from '@zxing/library'
import { api } from '../api/client'
import { useAuthStore } from '../stores/authStore'

interface ScannedEntry {
  trackingNumber: string
  status: 'ok' | 'duplicate' | 'error'
}

export default function InboundScan() {
  const user = useAuthStore((s) => s.user)
  const [value, setValue] = useState('')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'duplicate'; message: string } | null>(null)
  const [history, setHistory] = useState<ScannedEntry[]>([])
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)

  const scanMutation = useMutation({
    mutationFn: (trackingNumber: string) =>
      api.post<{ order: { trackingNumber: string } }>('/orders/scan', { trackingNumber }),
    onSuccess: (res) => {
      const tn = res.data.order.trackingNumber
      setFeedback({ type: 'success', message: `Added: ${tn}` })
      setHistory(prev => [{ trackingNumber: tn, status: 'ok' }, ...prev].slice(0, 10))
      setValue('')
      setTimeout(() => setFeedback(null), 2500)
    },
    onError: (err: any, trackingNumber) => {
      if (err?.response?.status === 409) {
        setFeedback({ type: 'duplicate', message: `Already exists: ${trackingNumber}` })
        setHistory(prev => [{ trackingNumber, status: 'duplicate' }, ...prev].slice(0, 10))
      } else {
        setFeedback({ type: 'error', message: err?.response?.data?.error ?? 'Scan failed' })
        setHistory(prev => [{ trackingNumber, status: 'error' }, ...prev].slice(0, 10))
      }
      setValue('')
      setTimeout(() => setFeedback(null), 3000)
    },
  })

  const submitScan = useCallback((tn: string) => {
    const cleaned = tn.trim()
    if (!cleaned || scanMutation.isPending) return
    scanMutation.mutate(cleaned)
  }, [scanMutation])

  const stopCamera = useCallback(async () => {
    if (readerRef.current) {
      await BrowserMultiFormatReader.releaseAllStreams()
      readerRef.current = null
    }
    setCameraOpen(false)
    setCameraError(null)
  }, [])

  const startCamera = useCallback(async () => {
    setCameraError(null)
    try {
      const reader = new BrowserMultiFormatReader()
      readerRef.current = reader
      setCameraOpen(true)

      // Wait for video element to mount
      await new Promise(r => setTimeout(r, 200))
      if (!videoRef.current) return

      await reader.decodeFromConstraints(
        { video: { facingMode: 'environment' } },
        videoRef.current,
        (result, err) => {
          if (result) {
            const code = result.getText()
            stopCamera()
            submitScan(code)
          } else if (err && !(err instanceof NotFoundException)) {
            // NotFoundException is normal (no barcode in frame yet), ignore it
          }
        }
      )
    } catch (err: any) {
      const msg = err?.name === 'NotAllowedError'
        ? 'Camera permission denied. Please allow camera access and try again.'
        : err?.name === 'NotFoundError'
        ? 'No camera found on this device.'
        : 'Could not open camera: ' + (err?.message ?? '')
      setCameraError(msg)
      setCameraOpen(false)
    }
  }, [stopCamera, submitScan])

  useEffect(() => {
    return () => { stopCamera() }
  }, [stopCamera])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    submitScan(value)
  }

  const feedbackStyle = feedback
    ? feedback.type === 'success'
      ? { bg: '#d1fae5', border: '#6ee7b7', text: '#065f46' }
      : feedback.type === 'duplicate'
      ? { bg: '#fef9c3', border: '#fde68a', text: '#92400e' }
      : { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' }
    : null

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px' }}>

      {/* Header */}
      <div style={{ width: '100%', maxWidth: '420px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Inbound Scan</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>{user?.username}</div>
        </div>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#3b82f6', background: '#eff6ff', padding: '4px 10px', borderRadius: '9999px', border: '1px solid #bfdbfe' }}>
          Handheld
        </div>
      </div>

      {/* Camera overlay */}
      {cameraOpen && (
        <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '500px' }}>
            <video
              ref={videoRef}
              style={{ width: '100%', borderRadius: '12px', display: 'block' }}
              playsInline
              muted
            />
            {/* Aim guide */}
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '72%', height: '100px',
              border: '3px solid #22c55e', borderRadius: '8px',
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
            }} />
          </div>
          <p style={{ color: '#fff', fontSize: '14px', marginTop: '20px', fontWeight: 500, textAlign: 'center' }}>
            Point camera at barcode
          </p>
          <button
            onClick={stopCamera}
            style={{ marginTop: '16px', padding: '12px 40px', borderRadius: '10px', border: 'none', background: '#ef4444', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Scan card */}
      <div style={{ width: '100%', maxWidth: '420px', background: '#fff', borderRadius: '16px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '24px', marginBottom: '16px' }}>

        {/* Primary camera button */}
        <button
          onClick={startCamera}
          disabled={scanMutation.isPending || cameraOpen}
          style={{
            width: '100%', padding: '20px 0', borderRadius: '12px', border: 'none',
            background: '#2563eb', color: '#fff', fontSize: '18px', fontWeight: 700,
            cursor: 'pointer', marginBottom: '16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
          }}
        >
          <span style={{ fontSize: '24px' }}>📷</span>
          Scan Barcode
        </button>

        {cameraError && (
          <div style={{ marginBottom: '14px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#991b1b', fontWeight: 500 }}>
            {cameraError}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
          <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>or enter manually</span>
          <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
        </div>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="Type tracking number..."
            disabled={scanMutation.isPending}
            style={{
              width: '100%', padding: '14px', fontSize: '15px', borderRadius: '10px',
              border: '2px solid #e2e8f0', outline: 'none', color: '#0f172a',
              boxSizing: 'border-box', marginBottom: '10px',
            }}
            onFocus={e => (e.target.style.borderColor = '#3b82f6')}
            onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
          />
          <button
            type="submit"
            disabled={!value.trim() || scanMutation.isPending}
            style={{
              width: '100%', padding: '13px 0', borderRadius: '10px', border: 'none',
              background: !value.trim() || scanMutation.isPending ? '#94a3b8' : '#0f172a',
              color: '#fff', fontSize: '14px', fontWeight: 700,
              cursor: !value.trim() || scanMutation.isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {scanMutation.isPending ? 'Adding...' : 'Add Manually'}
          </button>
        </form>
      </div>

      {/* Feedback */}
      {feedbackStyle && feedback && (
        <div style={{ width: '100%', maxWidth: '420px', background: feedbackStyle.bg, border: `1px solid ${feedbackStyle.border}`, borderRadius: '10px', padding: '12px 16px', fontSize: '14px', fontWeight: 600, color: feedbackStyle.text, marginBottom: '16px' }}>
          {feedback.message}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div style={{ width: '100%', maxWidth: '420px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Recent Scans</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {history.map((entry, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', borderRadius: '8px', padding: '10px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{entry.trackingNumber}</span>
                <span style={{
                  fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '9999px',
                  background: entry.status === 'ok' ? '#d1fae5' : entry.status === 'duplicate' ? '#fef9c3' : '#fee2e2',
                  color: entry.status === 'ok' ? '#065f46' : entry.status === 'duplicate' ? '#92400e' : '#991b1b',
                }}>
                  {entry.status === 'ok' ? '✓ Added' : entry.status === 'duplicate' ? 'Duplicate' : 'Error'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
