import { useState, useRef, useEffect, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { NotFoundException } from '@zxing/library'
import { api } from '../api/client'
import { useAuthStore } from '../stores/authStore'

interface ScannedEntry {
  trackingNumber: string
  status: 'staged' | 'not_found' | 'error'
}

export default function PickerAdminScan() {
  const user = useAuthStore((s) => s.user)
  const [value, setValue] = useState('')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [history, setHistory] = useState<ScannedEntry[]>([])
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)

  const scanMutation = useMutation({
    mutationFn: (trackingNumber: string) =>
      api.post<{ order: { trackingNumber: string } }>('/picker-admin/scan', { trackingNumber }),
    onSuccess: (res) => {
      const tn = res.data.order.trackingNumber
      setFeedback({ type: 'success', message: `Sent to dashboard: ${tn}` })
      setHistory(prev => [{ trackingNumber: tn, status: 'staged' }, ...prev].slice(0, 10))
      setValue('')
      setTimeout(() => setFeedback(null), 2500)
    },
    onError: (err: any, trackingNumber) => {
      if (err?.response?.status === 404) {
        setFeedback({ type: 'error', message: `Not found in system: ${trackingNumber}` })
        setHistory(prev => [{ trackingNumber, status: 'not_found' }, ...prev].slice(0, 10))
      } else {
        setFeedback({ type: 'error', message: err?.response?.data?.error ?? 'Lookup failed' })
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
            // NotFoundException is normal (no barcode in frame yet)
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

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px' }}>

      {/* Header */}
      <div style={{ width: '100%', maxWidth: '420px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Picker Admin Scan</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>{user?.username}</div>
        </div>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#7c3aed', background: '#ede9fe', padding: '4px 10px', borderRadius: '9999px', border: '1px solid #c4b5fd' }}>
          Handheld
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: '420px', marginBottom: '16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: '#1d4ed8' }}>
        Scan waybill — it will appear in your dashboard staging area automatically.
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
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '72%', height: '100px',
              border: '3px solid #7c3aed', borderRadius: '8px',
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
            }} />
          </div>
          <p style={{ color: '#fff', fontSize: '14px', marginTop: '20px', fontWeight: 500 }}>Point camera at barcode</p>
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
        <button
          onClick={startCamera}
          disabled={scanMutation.isPending || cameraOpen}
          style={{
            width: '100%', padding: '20px 0', borderRadius: '12px', border: 'none',
            background: '#7c3aed', color: '#fff', fontSize: '18px', fontWeight: 700,
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
            onFocus={e => (e.target.style.borderColor = '#7c3aed')}
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
            {scanMutation.isPending ? 'Sending...' : 'Send Manually'}
          </button>
        </form>
      </div>

      {/* Feedback */}
      {feedback && (
        <div style={{
          width: '100%', maxWidth: '420px',
          background: feedback.type === 'success' ? '#d1fae5' : '#fee2e2',
          border: `1px solid ${feedback.type === 'success' ? '#6ee7b7' : '#fca5a5'}`,
          borderRadius: '10px', padding: '12px 16px', fontSize: '14px', fontWeight: 600,
          color: feedback.type === 'success' ? '#065f46' : '#991b1b', marginBottom: '16px',
        }}>
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
                  background: entry.status === 'staged' ? '#d1fae5' : entry.status === 'not_found' ? '#fef9c3' : '#fee2e2',
                  color: entry.status === 'staged' ? '#065f46' : entry.status === 'not_found' ? '#92400e' : '#991b1b',
                }}>
                  {entry.status === 'staged' ? '✓ Sent' : entry.status === 'not_found' ? 'Not Found' : 'Error'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
