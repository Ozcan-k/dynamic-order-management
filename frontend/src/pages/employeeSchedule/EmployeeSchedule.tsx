import { useSearchParams } from 'react-router-dom'
import { UserRole } from '@dom/shared'
import { colors, radius, shadow } from '../../theme'
import PageShell from '../../components/shared/PageShell'
import { useAuthStore } from '../../stores/authStore'
import ScheduleTab from './ScheduleTab'
import EmployeesTab from './EmployeesTab'
import ReportTab from './ReportTab'

type Tab = 'schedule' | 'employees' | 'report'

function ViewOnlyBadge() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '4px 10px', borderRadius: radius.full,
      background: '#fffbeb', color: '#b45309', border: '1.5px solid #fde68a',
      fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
      </svg>
      View Only
    </span>
  )
}

const CalendarIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="8" y1="14" x2="10" y2="14" />
    <line x1="14" y1="14" x2="16" y2="14" />
    <line x1="8" y1="18" x2="10" y2="18" />
  </svg>
)

const TABS: { key: Tab; label: string }[] = [
  { key: 'schedule', label: 'Schedule' },
  { key: 'employees', label: 'Employees' },
  { key: 'report', label: 'Report' },
]

export default function EmployeeSchedule() {
  const [params, setParams] = useSearchParams()
  const role = useAuthStore((s) => s.user?.role)
  // INCIDENT_REPORTER gets read-only access; Admin + Warehouse Admin can edit.
  const readOnly = role === UserRole.INCIDENT_REPORTER
  const raw = params.get('tab')
  const activeTab: Tab = raw === 'employees' || raw === 'report' ? raw : 'schedule'

  const setTab = (tab: Tab) => {
    const next = new URLSearchParams(params)
    next.set('tab', tab)
    setParams(next, { replace: true })
  }

  return (
    <PageShell
      title="Employee Schedule"
      subtitle="Weekly staff attendance, employee roster, and worked-hours report"
      icon={<CalendarIcon />}
      stats={readOnly ? <ViewOnlyBadge /> : undefined}
    >
      {/* Tab bar — mirrors Warehouse Report */}
      <div style={{
        display: 'flex',
        gap: '2px',
        marginBottom: '24px',
        background: colors.surfaceAlt,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.lg,
        padding: '4px',
        width: 'fit-content',
      }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setTab(tab.key)}
            style={{
              padding: '7px 20px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: radius.md,
              border: 'none',
              background: activeTab === tab.key ? colors.surface : 'transparent',
              color: activeTab === tab.key ? colors.primary : colors.textSecondary,
              cursor: 'pointer',
              transition: 'all 0.15s',
              boxShadow: activeTab === tab.key ? shadow.card : 'none',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'schedule' && <ScheduleTab readOnly={readOnly} />}
      {activeTab === 'employees' && <EmployeesTab readOnly={readOnly} />}
      {activeTab === 'report' && <ReportTab />}
    </PageShell>
  )
}
