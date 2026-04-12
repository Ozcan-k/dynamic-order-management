import { useState, useRef, useEffect, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { api } from '../api/client'
import { useAuthStore } from '../stores/authStore'

type ScanMode = 'single' | 'bulk'

interface BulkEntry {
  trackingNumber: string
  status: 'pending' | 'staged' | 'not_found' | 'error'
}

export default function PickerAdminScan() {
  const user = useAuthStore((s) => s.user)
  const [mode, setMode] = useState<ScanMode>('single')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null)
  const [bulkItems, setBulkItems] = useState<BulkEntry[]>([])
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const controlsRef = useRef<any>(null)
  const didSubmitRef = useRef(false)

  // Single scan — validates TN exists and stages it on desktop
  const singleMutation = useMutation({
    mutationFn: (tn: string) =>
      api.post<{ order: { trackingNumber: string } }>('/picker-admin/scan', { trackingNumber: tn }),
    onSuccess: (res) => {
      const tn = res.data.order.trackingNumber
      setFeedback({ type: 'success', message: `Staged: ${tn}` })
      setTimeout(() => setFeedback(null), 2500)
    },
    onError: (err: any, tn) => {
      const status = err?.response?.status
      setFeedback({
        type: status === 404 ? 'warning' : 'error',
        message: status === 404
          ? `Not found in system: ${tn}`
          : status === 409
          ? `Already assigned: ${tn}`
          : (err?.response?.data?.error ?? 'Failed to send'),
      })
      setTimeout(() => setFeedback(null), 3500)
    },
  })

  // Bulk send — validates all TNs and stages valid ones on desktop
  const bulkMutation = useMutation({
    mutationFn: (tns: string[]) =>
      api.post<{ results: { trackingNumber: string; status: 'staged' | 'not_found' | 'error' }[] }>(
        '/picker-admin/handheld-bulk-scan',
        { trackingNumbers: tns },
      ),
    onSuccess: (res) => {
      const results = res.data.results
      const staged = results.filter(r => r.status === 'staged').length
      const failed = results.filter(r => r.status !== 'staged').length
      setBulkItems(prev =>
        prev.map(item => {
          const result = results.find(r => r.trackingNumber === item.trackingNumber)
          return result ? { ...item, status: result.status } : item
        })
      )
      setFeedback({
        type: failed === 0 ? 'success' : staged > 0 ? 'warning' : 'error',
        message: failed === 0
          ? `${staged} item${staged !== 1 ? 's' : ''} sent to desktop`
          : `${staged} staged, ${failed} failed`,
      })
      setTimeout(() => {
        setFeedback(null)
        setBulkItems([])
      }, 3000)
    },
    onError: (err: any) => {
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
      reader.decodeFromStream(
        streamRef.current!,
        video,
        (result, _err, controls) => {
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
                  setFeedback({ type: 'warning', message: `Already in list: ${code}` })
                  setTimeout(() => setFeedback(null), 1500)
                  return prev
                }
                setFeedback({ type: 'success', message: `Added: ${code}` })
                setTimeout(() => setFeedback(null), 1500)
                return [...prev, { trackingNumber: code, status: 'pending' }]
              })
            }
          }
        }
      ).then(controls => {
        if (!controlsRef.current) controlsRef.current = controls
      }).catch(() => {})
    }).catch(() => {
      setCameraError('Could not start video stream.')
      setCameraOpen(false)
    })

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

      {/* Mode toggle */}
      <div style={{ width: '100%', maxWidth: '420px', display: 'flex', background: '#e2e8f0', borderRadius: '12px', padding: '4px', marginBottom: '16px' }}>
        {(['single', 'bulk'] as ScanMode[]).map(m => (
          <button
            key={m}
            onClick={() => { setMode(m); setFeedback(null) }}
            style={{
              flex: 1, padding: '10px 0', borderRadius: '9px', border: 'none',
              fontWeight: 700, fontSize: '14px', cursor: 'pointer',
              background: mode === m ? '#fff' : 'transparent',
              color: mode === m ? '#0f172a' : '#64748b',
              boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            {m === 'single' ? 'Single Scan' : 'Bulk Scan'}
          </button>
        ))}
      </div>

      {/* Info banner */}
      <div style={{ width: '100%', maxWidth: '420px', marginBottom: '16px', background: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: '#6d28d9' }}>
        {mode === 'single'
          ? 'Scan one waybill — it will appear in the desktop staging area.'
          : 'Scan multiple waybills, then send all to desktop at once.'}
      </div>

      {/* Camera overlay */}
      {cameraOpen && (
        <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '500px' }}>
            <video ref={videoRef} playsInline muted style={{ width: '100%', borderRadius: '12px', display: 'block' }} />
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '75%', height: '110px',
              border: '3px solid #7c3aed', borderRadius: '8px',
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
              pointerEvents: 'none',
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
          onClick={openCamera}
          disabled={isPending || cameraOpen}
          style={{
            width: '100%', padding: '20px 0', borderRadius: '12px', border: 'none',
            background: '#7c3aed', color: '#fff', fontSize: '18px', fontWeight: 700,
            cursor: isPending || cameraOpen ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
            opacity: isPending || cameraOpen ? 0.6 : 1,
          }}
        >
          <span style={{ fontSize: '24px' }}>📷</span>
          {mode === 'single' ? 'Scan Barcode' : 'Scan Next Barcode'}
        </button>

        {cameraError && (
          <div style={{ marginTop: '14px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#991b1b', fontWeight: 500 }}>
            {cameraError}
          </div>
        )}
      </div>

      {/* Feedback */}
      {feedback && (
        <div style={{
          width: '100%', maxWidth: '420px',
          background: feedback.type === 'success' ? '#d1fae5' : feedback.type === 'warning' ? '#fef9c3' : '#fee2e2',
          border: `1px solid ${feedback.type === 'success' ? '#6ee7b7' : feedback.type === 'warning' ? '#fde68a' : '#fca5a5'}`,
          borderRadius: '10px', padding: '12px 16px', fontSize: '14px', fontWeight: 600,
          color: feedback.type === 'success' ? '#065f46' : feedback.type === 'warning' ? '#92400e' : '#991b1b',
          marginBottom: '16px',
        }}>
          {feedback.message}
        </div>
      )}

      {/* Bulk list + send button */}
      {mode === 'bulk' && bulkItems.length > 0 && (
        <div style={{ width: '100%', maxWidth: '420px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Scanned ({bulkItems.length})
            </div>
            <button
              onClick={() => setBulkItems([])}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}
            >
              Clear
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
            {bulkItems.map((entry, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', borderRadius: '8px', padding: '10px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{entry.trackingNumber}</span>
                {entry.status !== 'pending' && (
                  <span style={{
                    fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '9999px',
                    background: entry.status === 'staged' ? '#d1fae5' : entry.status === 'not_found' ? '#fef9c3' : '#fee2e2',
                    color: entry.status === 'staged' ? '#065f46' : entry.status === 'not_found' ? '#92400e' : '#991b1b',
                  }}>
                    {entry.status === 'staged' ? '✓ Staged' : entry.status === 'not_found' ? 'Not Found' : 'Error'}
                  </span>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={() => bulkMutation.mutate(bulkItems.map(i => i.trackingNumber))}
            disabled={bulkMutation.isPending}
            style={{
              width: '100%', padding: '14px 0', borderRadius: '12px', border: 'none',
              background: bulkMutation.isPending ? '#94a3b8' : '#7c3aed',
              color: '#fff', fontSize: '15px', fontWeight: 700,
              cursor: bulkMutation.isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {bulkMutation.isPending ? 'Sending...' : `Send ${bulkItems.length} Item${bulkItems.length !== 1 ? 's' : ''} to Desktop`}
          </button>
        </div>
      )}
    </div>
  )
}
