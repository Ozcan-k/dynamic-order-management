import { FormEvent, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import ConfirmModal from '../shared/ConfirmModal'
import {
  apiError,
  fetchRenamePreview,
  storeActions,
  useStoreMutation,
  useStoresManage,
  type ManagedStore,
  type RenamePreview,
  type StoreHistoryEntry,
} from '../../api/stores'
import { IconArchive, IconEdit, IconPlus, IconSearch, IconTrash, IconUndo } from './settingsIcons'

// Settings → Stores (v2.92.0). One list feeds every store picker (sales entry, direct
// orders, Return & Cancel, report filters). Rename rewrites the name on every record in
// one transaction; archive only hides a store from new entries; delete is offered only
// for a store no record has ever used. Accounting keeps its own store list.

type View = 'active' | 'archived' | 'all'

const n = (v: number) => v.toLocaleString('en-US')
const fmtDay = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Manila' }) : '—'
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' })

export default function StoresTab() {
  const q = useStoresManage()
  const [view, setView] = useState<View>('active')
  const [search, setSearch] = useState('')
  const [newName, setNewName] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<ManagedStore | null>(null)
  const [archiving, setArchiving] = useState<ManagedStore | null>(null)
  const [deleting, setDeleting] = useState<ManagedStore | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const create = useStoreMutation(storeActions.create)
  const archive = useStoreMutation(storeActions.archive)
  const restore = useStoreMutation(storeActions.restore)
  const remove = useStoreMutation(storeActions.remove)

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(t)
  }, [notice])

  const data = q.data
  const stores = data?.stores ?? []
  const activeCount = stores.filter((s) => s.isActive).length
  const archivedCount = stores.length - activeCount
  const recordTotal = stores.reduce((sum, s) => sum + s.usage.total, 0)
  const unusedCount = stores.filter((s) => s.usage.total === 0).length
  const needle = search.trim().toLowerCase()
  const rows = stores.filter((s) =>
    (view === 'all' || (view === 'active') === s.isActive) && (!needle || s.name.toLowerCase().includes(needle)))
  const maxTotal = Math.max(1, ...stores.map((s) => s.usage.total))

  async function addStore(name: string) {
    setAddError(null)
    if (!name.trim()) return setAddError('Enter a store name.')
    try {
      await create.mutateAsync(name)
      setNewName('')
      setNotice(`"${name.trim()}" added — it is now in every store list.`)
    } catch (err) {
      setAddError(apiError(err, 'Could not add the store'))
    }
  }

  function onAdd(e: FormEvent) {
    e.preventDefault()
    void addStore(newName)
  }

  if (q.isLoading) return <div className="set-loading"><span className="spinner spinner-sm" /> Loading stores…</div>
  if (q.isError) return <div className="set-error">Could not load stores. {apiError(q.error, '')}</div>

  return (
    <div className="set-tab">
      <div className="set-stats">
        <div className="set-stat set-stat--blue"><span>Active stores</span><b>{activeCount}</b><small>shown in every store picker</small></div>
        <button type="button" className="set-stat set-stat--slate is-clickable" onClick={() => setView('archived')} disabled={!archivedCount}>
          <span>Archived</span><b>{archivedCount}</b><small>hidden from new entries · history kept</small>
        </button>
        <div className="set-stat set-stat--teal"><span>Records</span><b>{n(recordTotal)}</b><small>activity days · orders · returns</small></div>
        <div className="set-stat set-stat--green"><span>Never used</span><b>{unusedCount}</b><small>can be deleted outright</small></div>
      </div>

      {notice && <div className="set-notice" role="status">{notice}</div>}

      <div className="set-store-layout">
        <div className="set-card">
          <header className="set-card-head">
            <div>
              <h3>Store list</h3>
              <p>Sales entry, direct orders, Return &amp; Cancel and the Marketing Report all read this list.</p>
            </div>
          </header>

          <form className="set-add-row" onSubmit={onAdd}>
            <input
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setAddError(null) }}
              placeholder="New store name"
              maxLength={60}
              aria-label="New store name"
            />
            <button type="submit" className="btn btn-primary" disabled={create.isPending}>
              <IconPlus /> {create.isPending ? 'Adding…' : 'Add store'}
            </button>
          </form>
          {addError && <div className="set-inline-error">{addError}</div>}

          <div className="set-toolbar set-toolbar--tight">
            <label className="set-search">
              <IconSearch />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search stores" aria-label="Search stores" />
            </label>
            <div className="set-seg" role="group" aria-label="Show">
              {(['active', 'archived', 'all'] as View[]).map((v) => (
                <button key={v} type="button" className={view === v ? 'is-on' : ''} onClick={() => setView(v)} aria-pressed={view === v}>
                  {v === 'active' ? `Active ${activeCount}` : v === 'archived' ? `Archived ${archivedCount}` : 'All'}
                </button>
              ))}
            </div>
          </div>

          <div className="set-table-wrap">
            <table className="set-table">
              <thead>
                <tr>
                  <th>Store</th>
                  <th className="num">Activity days</th>
                  <th className="num">Direct orders</th>
                  <th className="num">Returns</th>
                  <th>Last used</th>
                  <th className="act"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="set-table-empty">{needle ? 'No store matches this search.' : view === 'archived' ? 'No archived stores.' : 'No stores.'}</td></tr>
                )}
                {rows.map((s) => (
                  <tr key={s.id} className={s.isActive ? '' : 'is-archived'}>
                    <td>
                      <div className="set-store-name">
                        <b>{s.name}</b>
                        {!s.isActive && <span className="set-chip set-chip--muted">Archived</span>}
                        {s.usage.total === 0 && <span className="set-chip">Unused</span>}
                      </div>
                      <span className="set-usage-bar" aria-hidden="true"><i style={{ width: `${(s.usage.total / maxTotal) * 100}%` }} /></span>
                    </td>
                    <td className="num">{n(s.usage.activity)}</td>
                    <td className="num">{n(s.usage.directOrders)}</td>
                    <td className="num">{n(s.usage.returns)}</td>
                    <td className="muted">{fmtDay(s.usage.lastUsed)}</td>
                    <td className="act">
                      <div className="set-row-actions">
                        <button type="button" className="set-icon-btn" onClick={() => setRenaming(s)} title="Rename" aria-label={`Rename ${s.name}`}><IconEdit /></button>
                        {s.isActive ? (
                          <button type="button" className="set-icon-btn set-icon-btn--warn" onClick={() => setArchiving(s)} title="Archive — hide from new entries" aria-label={`Archive ${s.name}`}><IconArchive /></button>
                        ) : (
                          <button
                            type="button"
                            className="set-icon-btn"
                            title="Restore"
                            aria-label={`Restore ${s.name}`}
                            disabled={restore.isPending}
                            onClick={() => restore.mutate(s.id, {
                              onSuccess: () => setNotice(`"${s.name}" restored — it is back in the store lists.`),
                              onError: (err) => setNotice(apiError(err, 'Could not restore the store')),
                            })}
                          ><IconUndo /></button>
                        )}
                        <button
                          type="button"
                          className="set-icon-btn set-icon-btn--danger"
                          onClick={() => setDeleting(s)}
                          disabled={s.usage.total > 0}
                          title={s.usage.total > 0 ? `Used by ${n(s.usage.total)} records — archive it instead` : 'Delete this unused store'}
                          aria-label={`Delete ${s.name}`}
                        ><IconTrash /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="set-footnote">Accounting invoices keep their own store list (Accounting → Invoice → Store) and are not changed here.</p>
        </div>

        <aside className="set-side">
          {data && data.unlisted.length > 0 && (
            <div className="set-card">
              <header className="set-card-head">
                <div>
                  <h3>Names on records, not in the list</h3>
                  <p>Typed as free text (mostly Return &amp; Cancel). Nothing is changed — add one to the list to make it selectable.</p>
                </div>
              </header>
              <ul className="set-unlisted">
                {data.unlisted.map((u) => (
                  <li key={u.name}>
                    <span><b>{u.name}</b><small>{n(u.usage.total)} record{u.usage.total === 1 ? '' : 's'} · last {fmtDay(u.usage.lastUsed)}</small></span>
                    <button type="button" className="set-text-btn" disabled={create.isPending} onClick={() => addStore(u.name)}>
                      <IconPlus /> Add
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="set-card">
            <header className="set-card-head">
              <div>
                <h3>Recent changes</h3>
                <p>Every add, rename, archive and delete — who and when.</p>
              </div>
            </header>
            {data && data.history.length > 0 ? (
              <ol className="set-history">
                {data.history.map((h) => <HistoryItem key={h.id} h={h} />)}
              </ol>
            ) : (
              <p className="set-empty-sm">No changes yet.</p>
            )}
          </div>
        </aside>
      </div>

      {renaming && (
        <RenameModal
          store={renaming}
          onClose={() => setRenaming(null)}
          onDone={(msg) => { setRenaming(null); setNotice(msg) }}
        />
      )}

      {archiving && (
        <ConfirmModal
          tone="primary"
          title={`Archive "${archiving.name}"?`}
          message="It disappears from the store pickers for new entries."
          detail={archiving.usage.total > 0
            ? `All ${n(archiving.usage.total)} existing records keep this name and stay in every report. You can restore it at any time.`
            : 'You can restore it at any time.'}
          confirmLabel="Archive"
          busy={archive.isPending}
          onCancel={() => setArchiving(null)}
          onConfirm={() => archive.mutate(archiving.id, {
            onSuccess: () => { setNotice(`"${archiving.name}" archived.`); setArchiving(null) },
            onError: (err) => { setNotice(apiError(err, 'Could not archive the store')); setArchiving(null) },
          })}
        />
      )}

      {deleting && (
        <ConfirmModal
          title={`Delete "${deleting.name}"?`}
          message="No record uses this store, so it is removed from the list completely."
          detail="The change is kept in Recent changes."
          confirmLabel="Delete store"
          busy={remove.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => remove.mutate(deleting.id, {
            onSuccess: () => { setNotice(`"${deleting.name}" deleted.`); setDeleting(null) },
            onError: (err) => { setNotice(apiError(err, 'Could not delete the store')); setDeleting(null) },
          })}
        />
      )}
    </div>
  )
}

function HistoryItem({ h }: { h: StoreHistoryEntry }) {
  const d = h.details
  let text: string
  switch (h.action) {
    case 'CREATE': text = `Added "${h.toName}"`; break
    case 'RENAME': text = `Renamed "${h.fromName}" → "${h.toName}"`; break
    case 'ARCHIVE': text = `Archived "${h.fromName}"`; break
    case 'RESTORE': text = `Restored "${h.fromName}"`; break
    default: text = `Deleted "${h.fromName}"`
  }
  return (
    <li className={`set-history-item set-history-item--${h.action.toLowerCase()}`}>
      <i aria-hidden="true" />
      <div>
        <b>{text}</b>
        {h.action === 'RENAME' && d && (
          <small>{n(d.activity ?? 0)} activity days · {n(d.directOrders ?? 0)} orders · {n(d.returns ?? 0)} returns updated</small>
        )}
        <small>{h.username ?? 'unknown'} · {fmtWhen(h.createdAt)}</small>
      </div>
    </li>
  )
}

function RenameModal({ store, onClose, onDone }: { store: ManagedStore; onClose: () => void; onDone: (msg: string) => void }) {
  const [name, setName] = useState(store.name)
  const [preview, setPreview] = useState<RenamePreview | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rename = useStoreMutation(storeActions.rename)
  const trimmed = name.replace(/\s+/g, ' ').trim()
  const unchanged = trimmed === store.name

  // Debounced server preview: exact record counts + whether the new name would clash
  useEffect(() => {
    setPreview(null)
    setError(null)
    if (!trimmed || unchanged) return
    let cancelled = false
    setChecking(true)
    const t = setTimeout(async () => {
      try {
        const p = await fetchRenamePreview(store.id, trimmed)
        if (!cancelled) setPreview(p)
      } catch (err) {
        if (!cancelled) setError(apiError(err, 'Could not check this name'))
      } finally {
        if (!cancelled) setChecking(false)
      }
    }, 350)
    return () => { cancelled = true; clearTimeout(t) }
  }, [trimmed, unchanged, store.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !rename.isPending) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, rename.isPending])

  const ready = !!preview && !preview.blocked && !checking && preview.to === trimmed

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!ready) return
    try {
      const res = (await rename.mutateAsync({ id: store.id, name: trimmed })) as { data: { updated: { activity: number; directOrders: number; returns: number } } }
      const u = res.data.updated
      onDone(`Renamed to "${trimmed}" — ${n(u.activity)} activity days, ${n(u.directOrders)} orders and ${n(u.returns)} returns updated.`)
    } catch (err) {
      setError(apiError(err, 'Rename failed — nothing was changed'))
    }
  }

  const u = preview?.usage ?? store.usage
  return createPortal(
    <div className="modal-backdrop" onClick={() => !rename.isPending && onClose()}>
      <form className="set-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit} role="dialog" aria-modal="true" aria-label={`Rename ${store.name}`}>
        <header>
          <h3>Rename store</h3>
          <p>Current name: <b>{store.name}</b></p>
        </header>
        <label className="set-field">
          <span>New name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
        </label>

        <div className="set-preview">
          <span className="set-preview-title">Records that will carry the new name</span>
          <div className="set-preview-grid">
            <div><b>{n(u.activity)}</b><small>activity days</small></div>
            <div><b>{n(u.directOrders)}</b><small>direct orders</small></div>
            <div><b>{n(u.returns)}</b><small>return / cancel parcels</small></div>
          </div>
          <small>All of them are updated together in one step — if anything fails, nothing changes.</small>
        </div>

        {checking && <div className="set-hint">Checking name…</div>}
        {preview?.blocked && !unchanged && <div className="set-inline-error">{preview.blocked}</div>}
        {error && <div className="set-inline-error">{error}</div>}

        <footer>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={rename.isPending}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!ready || rename.isPending}>
            {rename.isPending ? 'Renaming…' : ready && u.total > 0 ? `Rename + update ${n(u.total)} records` : 'Rename'}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  )
}
