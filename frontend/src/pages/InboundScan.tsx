import { useState, useRef, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuthStore } from '../stores/authStore'

interface ScannedEntry {
  trackingNumber: string
  status: 'ok' | 'duplicate' | 'error'
  platform?: string
}

export default function InboundScan() {
  const user = useAuthStore((s) => s.user)
  const [value, setValue] = useState('')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'duplicate'; message: string } | null>(null)
  const [history, setHistory] = useState<ScannedEntry[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const scanMutation = useMutation({
    mutationFn: (trackingNumber: string) =>
      api.post<{ order: { trackingNumber: string; platform: string } }>('/orders/scan', { trackingNumber }),
    onSuccess: (res) => {
      const { trackingNumber, platform } = res.data.order
      setFeedback({ type: 'success', message: `Scanned: ${trackingNumber}` })
      setHistory(prev => [{ trackingNumber, status: 'ok', platform }, ...prev].slice(0, 10))
      setValue('')
      setTimeout(() => setFeedback(null), 2500)
      inputRef.current?.focus()
    },
    onError: (err: any) => {
      const trackingNumber = value.trim()
      if (err?.response?.status === 409) {
        setFeedback({ type: 'duplicate', message: `Already exists: ${trackingNumber}` })
        setHistory(prev => [{ trackingNumber, status: 'duplicate' }, ...prev].slice(0, 10))
      } else {
        const msg = err?.response?.data?.error ?? 'Scan failed'
        setFeedback({ type: 'error', message: msg })
        setHistory(prev => [{ trackingNumber, status: 'error' }, ...prev].slice(0, 10))
      }
      setValue('')
      setTimeout(() => setFeedback(null), 3000)
      inputRef.current?.focus()
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const tn = value.trim()
    if (!tn || scanMutation.isPending) return
    scanMutation.mutate(tn)
  }

  const feedbackColor = feedback?.type === 'success'
    ? { bg: '#d1fae5', border: '#6ee7b7', text: '#065f46' }
    : feedback?.type === 'duplicate'
    ? { bg: '#fef9c3', border: '#fde68a', text: '#92400e' }
    : { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' }

  return (
    <div style={{
      minHeight: '100vh', background: '#f8fafc',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '32px 16px',
    }}>
      {/* Header */}
      <div style={{
        width: '100%', maxWidth: '420px', marginBottom: '24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Inbound Scan
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>
            {user?.username}
          </div>
        </div>
        <div style={{
          fontSize: '11px', fontWeight: 600, color: '#3b82f6',
          background: '#eff6ff', padding: '4px 10px', borderRadius: '9999px',
          border: '1px solid #bfdbfe',
        }}>
          Handheld
        </div>
      </div>

      {/* Scan card */}
      <div style={{
        width: '100%', maxWidth: '420px',
        background: '#fff', borderRadius: '16px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        padding: '28px 24px',
        marginBottom: '20px',
      }}>
        <form onSubmit={handleSubmit}>
          <label style={{
            display: 'block', fontSize: '12px', fontWeight: 700,
            color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em',
            marginBottom: '10px',
          }}>
            Waybill Barcode
          </label>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="Scan or type tracking number..."
            disabled={scanMutation.isPending}
            style={{
              width: '100%', padding: '16px 14px', fontSize: '16px',
              borderRadius: '10px', border: '2px solid #e2e8f0',
              outline: 'none', color: '#0f172a',
              background: scanMutation.isPending ? '#f8fafc' : '#fff',
              transition: 'border-color 0.15s',
              boxSizing: 'border-box',
            }}
            onFocus={e => (e.target.style.borderColor = '#3b82f6')}
            onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
          />
          <button
            type="submit"
            disabled={!value.trim() || scanMutation.isPending}
            style={{
              marginTop: '12px', width: '100%', padding: '15px 0',
              borderRadius: '10px', border: 'none',
              background: !value.trim() || scanMutation.isPending ? '#94a3b8' : '#2563eb',
              color: '#fff', fontSize: '15px', fontWeight: 700,
              cursor: !value.trim() || scanMutation.isPending ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {scanMutation.isPending ? 'Scanning...' : 'Confirm Scan'}
          </button>
        </form>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div style={{
          width: '100%', maxWidth: '420px',
          background: feedbackColor.bg, border: `1px solid ${feedbackColor.border}`,
          borderRadius: '10px', padding: '12px 16px',
          fontSize: '13px', fontWeight: 600, color: feedbackColor.text,
          marginBottom: '20px',
        }}>
          {feedback.message}
        </div>
      )}

      {/* Scan history */}
      {history.length > 0 && (
        <div style={{ width: '100%', maxWidth: '420px' }}>
          <div style={{
            fontSize: '11px', fontWeight: 700, color: '#64748b',
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px',
          }}>
            Recent Scans
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {history.map((entry, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#fff', borderRadius: '8px', padding: '10px 14px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                  {entry.trackingNumber}
                </span>
                <span style={{
                  fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '9999px',
                  background: entry.status === 'ok' ? '#d1fae5' : entry.status === 'duplicate' ? '#fef9c3' : '#fee2e2',
                  color: entry.status === 'ok' ? '#065f46' : entry.status === 'duplicate' ? '#92400e' : '#991b1b',
                }}>
                  {entry.status === 'ok' ? 'OK' : entry.status === 'duplicate' ? 'Duplicate' : 'Error'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
