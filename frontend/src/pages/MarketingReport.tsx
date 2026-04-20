import PageShell from '../components/shared/PageShell'
import { useAuthStore } from '../stores/authStore'

function TrendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}

export default function MarketingReport() {
  const user = useAuthStore((s) => s.user)

  return (
    <PageShell
      icon={<TrendIcon />}
      title="Marketing Report"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
    >
      <div className="empty-state">
        <div className="empty-state-icon">📈</div>
        <p className="empty-state-title">Cross-agent comparison panel coming in Phase 5</p>
        <p className="empty-state-desc">
          Compare every sales agent side-by-side with charts, leaderboards, and per-agent calendar drill-down.
        </p>
      </div>
    </PageShell>
  )
}
