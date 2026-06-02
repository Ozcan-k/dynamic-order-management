// Small pill shown in a page header when the current user has read-only access
// (e.g. OUTBOUND_ADMIN viewing the Inbound / Picker / Packer boards). Signals why
// no action buttons are present.
export default function ViewOnlyBadge() {
  return (
    <span
      title="You have read-only access to this panel"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '4px 10px', borderRadius: 9999,
        background: '#fef3c7', color: '#92400e',
        fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
        whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      View Only
    </span>
  )
}
