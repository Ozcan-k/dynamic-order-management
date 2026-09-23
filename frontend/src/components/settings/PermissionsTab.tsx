import { Fragment, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { UserRole } from '@dom/shared'
import { api } from '../../api/client'
import { ROLE_CONFIG, ROLE_SECTIONS } from './roleConfig'

// Settings → Permissions (v2.92.0). Read-only matrix of who can view / edit / delete
// in each module. Built from the server's own route table (GET /users/permissions),
// i.e. the `requireRole(...)` rules that are really enforced — not a hand-kept list.

type Access = { kind: 'public' } | { kind: 'signed-in' } | { kind: 'roles'; roles: UserRole[] }
interface RouteRule { method: string; url: string; access: Access }
interface PermModule { id: string; label: string; area: string; routes: RouteRule[] }
interface PermissionMap { roles: UserRole[]; modules: PermModule[]; generatedAt: string }

type Verb = 'view' | 'edit' | 'delete'
type Level = 'all' | 'some' | 'none' | 'na'
const VERBS: { id: Verb; short: string; label: string }[] = [
  { id: 'view', short: 'V', label: 'View' },
  { id: 'edit', short: 'E', label: 'Create / edit' },
  { id: 'delete', short: 'D', label: 'Delete' },
]

const SHORT: Record<string, string> = {
  [UserRole.ADMIN]: 'Admin',
  [UserRole.INBOUND_ADMIN]: 'Inbound',
  [UserRole.OUTBOUND_ADMIN]: 'Outbound',
  [UserRole.WAREHOUSE_ADMIN]: 'Warehouse',
  [UserRole.PICKER_ADMIN]: 'Picker adm.',
  [UserRole.PACKER_ADMIN]: 'Packer adm.',
  [UserRole.INCIDENT_REPORTER]: 'Incident',
  [UserRole.ACCOUNTANT]: 'Accountant',
  [UserRole.PICKER]: 'Picker',
  [UserRole.PACKER]: 'Packer',
  [UserRole.STOCK_KEEPER]: 'Stock',
  [UserRole.SALES_AGENT]: 'Sales',
  [UserRole.RETURN_SCANNER]: 'Returns',
}

const verbOf = (method: string): Verb => (method === 'GET' ? 'view' : method === 'DELETE' ? 'delete' : 'edit')
const allows = (a: Access, role: UserRole) => a.kind !== 'roles' || a.roles.includes(role)

function levelFor(m: PermModule, role: UserRole, verb: Verb): Level {
  const rs = m.routes.filter((r) => verbOf(r.method) === verb)
  if (rs.length === 0) return 'na'
  const ok = rs.filter((r) => allows(r.access, role)).length
  return ok === 0 ? 'none' : ok === rs.length ? 'all' : 'some'
}

// Role order follows the Users tab grouping
const ROLE_ORDER = ROLE_SECTIONS.flatMap((s) => s.roles)

export default function PermissionsTab() {
  const q = useQuery({
    queryKey: ['permission-map'],
    queryFn: async () => (await api.get<PermissionMap>('/users/permissions')).data,
    staleTime: 5 * 60_000,
  })
  const [focusRole, setFocusRole] = useState<UserRole | null>(null)
  const [cell, setCell] = useState<{ module: string; role: UserRole } | null>(null)

  const roles = useMemo(() => {
    const known = new Set(q.data?.roles ?? [])
    return ROLE_ORDER.filter((r) => known.has(r))
  }, [q.data])

  const areas = useMemo(() => {
    const out: { area: string; modules: PermModule[] }[] = []
    for (const m of q.data?.modules ?? []) {
      if (m.id === 'auth') continue
      const last = out[out.length - 1]
      if (last && last.area === m.area) last.modules.push(m)
      else out.push({ area: m.area, modules: [m] })
    }
    return out
  }, [q.data])

  if (q.isLoading) return <div className="set-loading"><span className="spinner spinner-sm" /> Reading access rules…</div>
  if (q.isError || !q.data) return <div className="set-error">Could not load the permission map.</div>

  const modules = areas.flatMap((a) => a.modules)
  const reach = (role: UserRole) => modules.filter((m) => VERBS.some((v) => { const l = levelFor(m, role, v.id); return l === 'all' || l === 'some' })).length
  const selected = cell ? modules.find((m) => m.id === cell.module) : null

  return (
    <div className="set-tab">
      <div className="set-perm-intro">
        <div>
          <h3>Who can do what</h3>
          <p>
            Read from the access rules the server enforces on every request ({modules.reduce((s, m) => s + m.routes.length, 0)} endpoints).
            Changing a role's rights is a code change — this page only shows them. Click a cell for the exact actions.
          </p>
        </div>
        <ul className="set-perm-legend" aria-label="Legend">
          {VERBS.map((v) => (
            <li key={v.id}><span className={`set-pip set-pip--${v.id} is-all`}>{v.short}</span>{v.label}</li>
          ))}
          <li><span className="set-pip set-pip--view is-some">V</span>Only some actions</li>
          <li><span className="set-pip is-none">·</span>No access</li>
        </ul>
      </div>

      <div className="set-role-chips" role="group" aria-label="Highlight a role">
        {roles.map((r) => {
          const cfg = ROLE_CONFIG[r]
          const on = focusRole === r
          return (
            <button
              key={r}
              type="button"
              className={`set-role-chip${on ? ' is-on' : ''}`}
              style={{ ['--role' as string]: cfg.color, ['--role-bg' as string]: cfg.badgeBg }}
              onClick={() => setFocusRole(on ? null : r)}
              aria-pressed={on}
              title={`${cfg.label}: access to ${reach(r)} of ${modules.length} modules`}
            >
              <i aria-hidden="true" />{cfg.label}<b>{reach(r)}</b>
            </button>
          )
        })}
      </div>

      <div className="set-card">
        <div className="set-perm-wrap">
          <table className="set-perm">
            <thead>
              <tr>
                <th className="set-perm-mod">Module</th>
                {roles.map((r) => (
                  <th
                    key={r}
                    className={focusRole === r ? 'is-focus' : focusRole ? 'is-dim' : ''}
                    title={ROLE_CONFIG[r].label}
                    style={{ ['--role' as string]: ROLE_CONFIG[r].color }}
                  >
                    <button type="button" onClick={() => setFocusRole(focusRole === r ? null : r)}>
                      <i aria-hidden="true" />{SHORT[r] ?? ROLE_CONFIG[r].label}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {areas.map((a) => (
                <Fragment key={a.area}>
                  <tr className="set-perm-area"><th colSpan={roles.length + 1}>{a.area}</th></tr>
                  {a.modules.map((m) => (
                    <tr key={m.id}>
                      <th className="set-perm-mod" scope="row">{m.label}<small>{m.routes.length} endpoints</small></th>
                      {roles.map((r) => {
                        const levels = VERBS.map((v) => ({ v, l: levelFor(m, r, v.id) }))
                        const any = levels.some((x) => x.l === 'all' || x.l === 'some')
                        const isSel = cell?.module === m.id && cell.role === r
                        return (
                          <td key={r} className={`${focusRole === r ? 'is-focus' : focusRole ? 'is-dim' : ''}${isSel ? ' is-selected' : ''}`}>
                            <button
                              type="button"
                              className={`set-perm-cell${any ? '' : ' is-empty'}`}
                              onClick={() => setCell(isSel ? null : { module: m.id, role: r })}
                              aria-label={`${ROLE_CONFIG[r].label} — ${m.label}: ${levels.map((x) => `${x.v.label} ${x.l === 'all' ? 'yes' : x.l === 'some' ? 'partly' : x.l === 'na' ? 'n/a' : 'no'}`).join(', ')}`}
                            >
                              {any
                                ? levels.map(({ v, l }) => (
                                  <span key={v.id} className={`set-pip set-pip--${v.id} is-${l}`}>{l === 'none' || l === 'na' ? '·' : v.short}</span>
                                ))
                                : <span className="set-perm-none">—</span>}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && cell && <CellDetail module={selected} role={cell.role} onClose={() => setCell(null)} />}
    </div>
  )
}

function CellDetail({ module: m, role, onClose }: { module: PermModule; role: UserRole; onClose: () => void }) {
  const cfg = ROLE_CONFIG[role]
  const lv = (v: Verb) => levelFor(m, role, v)
  const canView = lv('view') === 'all' || lv('view') === 'some'
  const canEdit = lv('edit') === 'all' || lv('edit') === 'some'
  const canDelete = lv('delete') === 'all' || lv('delete') === 'some'
  const note = !canView && !canEdit && !canDelete
    ? 'No access to this module.'
    : canView && !canEdit && !canDelete
      ? 'Read-only here — can look, cannot change anything.'
      : canEdit && !canDelete && lv('delete') !== 'na'
        ? 'Can create and edit, but cannot delete.'
        : null

  return (
    <section className="set-card set-perm-detail" aria-label={`${cfg.label} in ${m.label}`} style={{ ['--role' as string]: cfg.color }}>
      <header className="set-card-head set-perm-detail-head">
        <div>
          <h3>{cfg.label} · {m.label}</h3>
          {note ? <p>{note}</p> : <p>Allowed actions are marked; the others are refused with “Forbidden”.</p>}
        </div>
        <button type="button" className="set-icon-btn" onClick={onClose} aria-label="Close details">✕</button>
      </header>
      <ul className="set-perm-routes">
        {m.routes.map((r) => {
          const ok = allows(r.access, role)
          return (
            <li key={`${r.method} ${r.url}`} className={ok ? 'is-ok' : 'is-no'}>
              <span className={`set-method set-method--${r.method.toLowerCase()}`}>{r.method}</span>
              <code>{r.url}</code>
              <span className="set-perm-who">
                {r.access.kind === 'public' ? 'public' : r.access.kind === 'signed-in' ? 'any signed-in user'
                  : r.access.roles.map((x) => SHORT[x] ?? x).join(' · ')}
              </span>
              <b aria-label={ok ? 'allowed' : 'not allowed'}>{ok ? '✓' : '✕'}</b>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
