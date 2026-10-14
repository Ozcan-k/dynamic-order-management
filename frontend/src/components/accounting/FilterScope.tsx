// v2.104.0 — shown above the summary strip while list filters are on, so it is obvious the
// cards total a filtered subset (not the whole period) and one click brings the full totals back.
export default function FilterScope({ parts, onClear }: { parts: string[]; onClear: () => void }) {
  if (parts.length === 0) return null
  return (
    <div className="acc-scope" role="status">
      <span className="acc-scope-label">Filtered totals</span>
      <span className="acc-scope-parts">
        {parts.map((p, i) => <span key={i} className="acc-scope-chip" title={p}>{p}</span>)}
      </span>
      <button type="button" className="acc-btn acc-btn-ghost acc-btn-sm" onClick={onClear}>Clear filters</button>
    </div>
  )
}
