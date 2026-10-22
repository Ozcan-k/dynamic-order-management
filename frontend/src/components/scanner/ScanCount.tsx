/** Bulk scanning status under the camera guide: how many are in the list and the last code read. */
export default function ScanCount({ count, last }: { count: number; last: string | null }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderRadius: 9999, background: 'rgba(15,23,42,0.75)', border: '1px solid rgba(255,255,255,0.15)' }}>
      <span style={{ color: '#4ade80', fontWeight: 800, fontSize: 15 }}>{count} scanned</span>
      {last && <span style={{ color: '#cbd5e1', fontFamily: 'monospace', fontSize: 14, maxWidth: '55vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{last}</span>}
    </div>
  )
}
