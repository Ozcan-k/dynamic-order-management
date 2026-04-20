import { useNavigate } from 'react-router-dom'
import PageShell from '../components/shared/PageShell'
import { useAuthStore } from '../stores/authStore'

function CalendarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

export default function SalesDashboard() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()

  return (
    <PageShell
      icon={<CalendarIcon />}
      title="Sales Dashboard"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
    >
      <div className="empty-state">
        <div className="empty-state-icon">📊</div>
        <p className="empty-state-title">Your monthly activity calendar will appear here</p>
        <p className="empty-state-desc">
          Track daily content posting, live selling, direct sales, and marketplace inquiries at a glance.
        </p>
        <button
          className="btn btn-primary"
          onClick={() => navigate('/sales/entry')}
          style={{ marginTop: '20px' }}
        >
          Enter Today's Report →
        </button>
      </div>
    </PageShell>
  )
}
