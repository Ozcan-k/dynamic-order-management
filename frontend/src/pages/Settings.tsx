import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'
import { useStores } from '../api/stores'
import PageShell from '../components/shared/PageShell'
import UsersTab from '../components/settings/UsersTab'
import StoresTab from '../components/settings/StoresTab'
import PermissionsTab from '../components/settings/PermissionsTab'
import type { AppUser } from '../components/settings/roleConfig'
import { IconSettings, IconShield, IconStore, IconUsers } from '../components/settings/settingsIcons'

// Settings (v2.92.0): tabbed — Users (logins per role), Stores (the managed store
// list) and Permissions (read-only role × module access map). The active tab lives
// in the URL (?tab=) so a refresh or shared link keeps it.

const TABS = [
  { id: 'users', label: 'Users', icon: <IconUsers /> },
  { id: 'stores', label: 'Stores', icon: <IconStore /> },
  { id: 'permissions', label: 'Permissions', icon: <IconShield /> },
] as const
type TabId = (typeof TABS)[number]['id']

export default function Settings() {
  const user = useAuthStore((s) => s.user)
  const [params, setParams] = useSearchParams()
  const tab: TabId = TABS.some((t) => t.id === params.get('tab')) ? (params.get('tab') as TabId) : 'users'

  const users = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<{ users: AppUser[] }>('/users')).data.users,
    refetchInterval: 30_000,
  })
  const stores = useStores()

  const counts: Record<TabId, number | undefined> = {
    users: users.data?.filter((u) => u.isActive).length,
    stores: stores.data ? stores.names.length : undefined,
    permissions: undefined,
  }

  return (
    <PageShell icon={<IconSettings />} title="Settings" subtitle={`${user?.username} · Admin`}>
      <div className="set-root">
        <nav className="set-tabs" role="tablist" aria-label="Settings sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? 'is-on' : ''}
              onClick={() => setParams(t.id === 'users' ? {} : { tab: t.id }, { replace: true })}
            >
              {t.icon}
              {t.label}
              {counts[t.id] != null && <span className="set-tab-count">{counts[t.id]}</span>}
            </button>
          ))}
        </nav>

        {tab === 'users' && <UsersTab users={users.data ?? []} isLoading={users.isLoading} />}
        {tab === 'stores' && <StoresTab />}
        {tab === 'permissions' && <PermissionsTab />}
      </div>
    </PageShell>
  )
}
