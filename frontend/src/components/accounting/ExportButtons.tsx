// "CSV" / "Excel" buttons. The caller supplies the rows lazily (a list may need to fetch
// every page first), so nothing is loaded until someone actually exports.
import { useState } from 'react'
import AccIcon from './AccIcon'

export default function ExportButtons({ onExport, disabled }: {
  onExport: (format: 'csv' | 'xlsx') => Promise<void> | void
  disabled?: boolean
}) {
  const [busy, setBusy] = useState<null | 'csv' | 'xlsx'>(null)
  const [error, setError] = useState('')
  const run = async (f: 'csv' | 'xlsx') => {
    setBusy(f); setError('')
    try { await onExport(f) } catch { setError('Export failed. Try again.') } finally { setBusy(null) }
  }
  return (
    <span className="acc-export" role="group" aria-label="Export">
      <button type="button" className="acc-btn acc-btn-outline acc-btn-sm" disabled={disabled || !!busy} onClick={() => run('csv')}>
        <AccIcon name="download" size={14} />{busy === 'csv' ? 'Preparing…' : 'CSV'}
      </button>
      <button type="button" className="acc-btn acc-btn-outline acc-btn-sm" disabled={disabled || !!busy} onClick={() => run('xlsx')}>
        <AccIcon name="download" size={14} />{busy === 'xlsx' ? 'Preparing…' : 'Excel'}
      </button>
      {error && <span className="acc-error" role="alert">{error}</span>}
    </span>
  )
}
