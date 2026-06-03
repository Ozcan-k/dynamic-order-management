import { useState } from 'react'
import type { AccContact } from '@dom/shared'
import { useAccContacts, useSaveAccContact, useDeleteAccContact } from '../../api/accounting'
import ConfirmModal from '../../components/shared/ConfirmModal'

type Kind = 'customers' | 'suppliers'
const empty = { name: '', address: '', email: '', contactPerson: '', contactNumber: '' }

function ContactPanel({ kind, title }: { kind: Kind; title: string }) {
  const { data: items = [], isLoading } = useAccContacts(kind)
  const save = useSaveAccContact(kind)
  const del = useDeleteAccContact(kind)

  const [editing, setEditing] = useState<null | (typeof empty & { id?: string })>(null)
  const [toDelete, setToDelete] = useState<AccContact | null>(null)

  const submit = async () => {
    if (!editing?.name.trim()) return
    await save.mutateAsync(editing)
    setEditing(null)
  }

  return (
    <div className="acc-card acc-card-pad">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 className="acc-card-title" style={{ margin: 0 }}>{title}</h3>
        <button className="acc-btn acc-btn-primary acc-btn-sm" onClick={() => setEditing({ ...empty })}>+ Add</button>
      </div>

      {isLoading ? <p className="acc-muted">Loading…</p> : items.length === 0 ? <p className="acc-muted">No {title.toLowerCase()} yet.</p> : (
        <div className="acc-table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Contact Person</th><th>Number</th><th className="acc-col-actions">Actions</th></tr></thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}{c.email && <div className="acc-muted" style={{ fontSize: 12 }}>{c.email}</div>}</td>
                  <td>{c.contactPerson || <span className="acc-muted">—</span>}</td>
                  <td>{c.contactNumber || <span className="acc-muted">—</span>}</td>
                  <td className="acc-col-actions">
                    <span className="acc-row-actions">
                      <button className="acc-btn acc-btn-outline acc-btn-sm" onClick={() => setEditing({ id: c.id, name: c.name, address: c.address || '', email: c.email || '', contactPerson: c.contactPerson || '', contactNumber: c.contactNumber || '' })}>Edit</button>
                      <button className="acc-btn acc-btn-ghost acc-btn-sm" onClick={() => setToDelete(c)}>Delete</button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="acc-modal-backdrop" onClick={() => setEditing(null)}>
          <div className="acc-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="acc-modal-title">{editing.id ? 'Edit' : 'New'} {title.replace(/s$/, '')}</h3>
            <div className="acc-form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="acc-field span2"><label>Name <span className="req">*</span></label><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus /></div>
              <div className="acc-field span2"><label>Address</label><input value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></div>
              <div className="acc-field"><label>Email</label><input value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
              <div className="acc-field"><label>Contact Person</label><input value={editing.contactPerson} onChange={(e) => setEditing({ ...editing, contactPerson: e.target.value })} /></div>
              <div className="acc-field span2"><label>Contact Number</label><input value={editing.contactNumber} onChange={(e) => setEditing({ ...editing, contactNumber: e.target.value })} /></div>
            </div>
            <div className="acc-modal-foot">
              <button className="acc-btn acc-btn-outline" onClick={() => setEditing(null)}>Cancel</button>
              <button className="acc-btn acc-btn-primary" onClick={submit} disabled={save.isPending || !editing.name.trim()}>{save.isPending ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {toDelete && (
        <ConfirmModal
          title={`Delete ${toDelete.name}?`}
          message="This cannot be undone. Past records keep their saved copy of this contact."
          confirmLabel="Delete"
          tone="danger"
          busy={del.isPending}
          onCancel={() => setToDelete(null)}
          onConfirm={async () => { await del.mutateAsync(toDelete.id); setToDelete(null) }}
        />
      )}
    </div>
  )
}

export default function AccContacts() {
  return (
    <div className="acc-page">
      <div className="acc-head">
        <h1 className="acc-title">Customers / Suppliers</h1>
        <p className="acc-sub">Master data that feeds the dropdowns in Sales and Expenses</p>
      </div>
      <div className="acc-grid acc-grid-2">
        <ContactPanel kind="customers" title="Customers" />
        <ContactPanel kind="suppliers" title="Suppliers" />
      </div>
    </div>
  )
}
