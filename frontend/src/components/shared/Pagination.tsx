import { colors } from '../../theme'

export default function Pagination({
  page, totalPages, totalCount, pageStart, pageEnd, onChange,
}: {
  page: number
  totalPages: number
  totalCount: number
  pageStart: number
  pageEnd: number
  onChange: (p: number) => void
}) {
  const pages = buildPageList(page, totalPages)
  const baseBtn: React.CSSProperties = {
    minWidth: 32, height: 32, padding: '0 10px',
    border: `1px solid ${colors.border}`, background: '#fff',
    borderRadius: 8, fontSize: 13, fontWeight: 600, color: colors.textSecondary,
    cursor: 'pointer',
  }
  const activeBtn: React.CSSProperties = {
    ...baseBtn, background: colors.primary, color: '#fff',
    borderColor: colors.primary,
  }
  const disabledBtn: React.CSSProperties = { ...baseBtn, opacity: 0.4, cursor: 'not-allowed' }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, flexWrap: 'wrap', padding: '0 4px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}
          style={page <= 1 ? disabledBtn : baseBtn}
        >Prev</button>
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} style={{ color: colors.textMuted, padding: '0 4px' }}>…</span>
          ) : (
            <button
              key={p} type="button" onClick={() => onChange(p)}
              style={p === page ? activeBtn : baseBtn}
            >{p}</button>
          ),
        )}
        <button
          type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)}
          style={page >= totalPages ? disabledBtn : baseBtn}
        >Next</button>
      </div>
      <div style={{ fontSize: 12, color: colors.textMuted }}>
        {pageStart + 1}–{pageEnd} of {totalCount} · Page {page} / {totalPages}
      </div>
    </div>
  )
}

function buildPageList(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const out: (number | '…')[] = [1]
  const left = Math.max(2, current - 1)
  const right = Math.min(total - 1, current + 1)
  if (left > 2) out.push('…')
  for (let p = left; p <= right; p++) out.push(p)
  if (right < total - 1) out.push('…')
  out.push(total)
  return out
}
