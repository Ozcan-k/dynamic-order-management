import PageShell from '../components/shared/PageShell'
import { useAuthStore } from '../stores/authStore'

function PenIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  )
}

export default function SalesEntry() {
  const user = useAuthStore((s) => s.user)

  return (
    <PageShell
      icon={<PenIcon />}
      title="Daily Activity Entry"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
    >
      <div className="empty-state">
        <div className="empty-state-icon">✍️</div>
        <p className="empty-state-title">Daily report form coming in Phase 2</p>
        <p className="empty-state-desc">
          Select a store, then log Content Posting, Live Selling, Direct Orders, and Marketplace Reporting.
        </p>
      </div>
    </PageShell>
  )
}
