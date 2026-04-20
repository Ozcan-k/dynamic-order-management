import PageShell from '../components/shared/PageShell'
import { useAuthStore } from '../stores/authStore'

function CartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  )
}

export default function SalesOrders() {
  const user = useAuthStore((s) => s.user)

  return (
    <PageShell
      icon={<CartIcon />}
      title="My Direct Orders"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
    >
      <div className="empty-state">
        <div className="empty-state-icon">🛒</div>
        <p className="empty-state-title">Direct order history coming in Phase 3</p>
        <p className="empty-state-desc">
          Browse and filter every direct sale you have logged across all stores and channels.
        </p>
      </div>
    </PageShell>
  )
}
