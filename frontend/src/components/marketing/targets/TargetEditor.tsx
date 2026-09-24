import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SALES_TARGET_INFO, SALES_TARGET_METRICS, type SalesTargetMetric, type TargetSettingsResponse } from '@dom/shared'
import { fetchTargetSettings, saveTargetSettings } from '../../../api/marketing'

// ADMIN target editor (v2.94.0): the default monthly targets for every agent, and per-agent
// overrides — switch a target off (e.g. sales-only agents) or give it a different value.

type Row = { value: string; enabled: boolean; useDefault: boolean }
type Form = Record<SalesTargetMetric, Row>
const DEFAULT = 'DEFAULT'

function formFor(s: TargetSettingsResponse, scope: string): Form {
  const f = {} as Form
  for (const m of SALES_TARGET_METRICS) {
    if (scope === DEFAULT) {
      f[m] = { value: String(s.defaults[m].value), enabled: s.defaults[m].enabled, useDefault: false }
    } else {
      const o = s.agents.find((a) => a.agentId === scope)?.overrides[m]
      f[m] = { value: o?.value != null ? String(o.value) : '', enabled: o ? o.enabled : s.defaults[m].enabled, useDefault: !o || o.value == null }
    }
  }
  return f
}

export default function TargetEditor({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['marketing-target-settings'], queryFn: fetchTargetSettings })
  const [scope, setScope] = useState<string>(DEFAULT)
  const [form, setForm] = useState<Form | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => { if (q.data) { setForm(formFor(q.data, scope)); setError(null) } }, [q.data, scope])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = useMutation({
    mutationFn: saveTargetSettings,
    onSuccess: (data) => {
      qc.setQueryData(['marketing-target-settings'], data)
      qc.invalidateQueries({ queryKey: ['marketing-targets'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
    onError: (e: unknown) => setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not save targets'),
  })

  const s = q.data
  const isDefault = scope === DEFAULT
  const scopes = useMemo(() => [
    { id: DEFAULT, label: 'Default — all agents', custom: false },
    ...(s?.agents ?? []).map((a) => ({ id: a.agentId, label: a.username, custom: Object.keys(a.overrides).length > 0 })),
  ], [s])

  const submit = () => {
    if (!form || !s) return
    setError(null)
    const metrics = SALES_TARGET_METRICS.map((m) => {
      const r = form[m]
      const useDefault = !isDefault && r.useDefault
      const n = Number(r.value)
      return { metric: m, value: useDefault ? null : n, enabled: r.enabled, bad: !useDefault && (!r.value.trim() || !Number.isFinite(n) || n <= 0) }
    })
    const bad = metrics.find((x) => x.bad && (isDefault || x.enabled))
    if (bad) { setError(`Enter a positive number for ${SALES_TARGET_INFO[bad.metric].label}`); return }
    save.mutate({
      scope,
      // a switched-off metric without its own value keeps following the default value
      metrics: metrics.map(({ metric, value, enabled, bad: b }) => ({ metric, value: b ? null : value, enabled })),
    })
  }

  const set = (m: SalesTargetMetric, patch: Partial<Row>) => setForm((f) => (f ? { ...f, [m]: { ...f[m], ...patch } } : f))

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="tg-editor" role="dialog" aria-modal="true" aria-label="Edit monthly targets" onClick={(e) => e.stopPropagation()}>
        <header className="tg-editor-head">
          <div>
            <h3>Monthly targets</h3>
            <p>Targets apply to every month shown in the report, including past months.</p>
          </div>
          <button type="button" className="mkt-btn-ghost" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="tg-editor-body">
          <nav className="tg-scopes" aria-label="Whose targets">
            {scopes.map((sc) => (
              <button key={sc.id} type="button" className={scope === sc.id ? 'is-on' : ''} aria-pressed={scope === sc.id} onClick={() => setScope(sc.id)}>
                <span>{sc.label}</span>
                {sc.custom && <em>custom</em>}
              </button>
            ))}
          </nav>

          <div className="tg-form">
            {!s || !form ? <div className="tg-skel" /> : (
              <>
                <p className="tg-form-hint">
                  {isDefault
                    ? 'These targets apply to every sales agent unless you change them for a specific agent.'
                    : 'Leave “Use default” ticked to follow the default target. Switch a target off if this agent does not do that activity.'}
                </p>
                <table className="tg-form-table">
                  <thead>
                    <tr>
                      <th scope="col">Target</th>
                      <th scope="col">Tracked</th>
                      {!isDefault && <th scope="col">Use default</th>}
                      <th scope="col">Monthly value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SALES_TARGET_METRICS.map((m) => {
                      const r = form[m]
                      const info = SALES_TARGET_INFO[m]
                      return (
                        <tr key={m} className={r.enabled ? '' : 'is-off'}>
                          <th scope="row"><b>{info.label}</b><small>{info.measures}</small></th>
                          <td>
                            <label className="tg-switch">
                              <input type="checkbox" checked={r.enabled} onChange={(e) => set(m, { enabled: e.target.checked })} aria-label={`Track ${info.label}`} />
                              <span aria-hidden="true" />
                            </label>
                          </td>
                          {!isDefault && (
                            <td>
                              <input type="checkbox" checked={r.useDefault} disabled={!r.enabled} onChange={(e) => set(m, { useDefault: e.target.checked })} aria-label={`Use default ${info.label}`} />
                            </td>
                          )}
                          <td>
                            <div className="tg-input">
                              {info.unit === 'php' && <span>₱</span>}
                              <input
                                inputMode="decimal"
                                value={!isDefault && r.useDefault ? '' : r.value}
                                placeholder={!isDefault ? `${s.defaults[m].value.toLocaleString('en-US')} (default)` : ''}
                                disabled={!r.enabled || (!isDefault && r.useDefault)}
                                onChange={(e) => { if (/^\d*\.?\d*$/.test(e.target.value)) set(m, { value: e.target.value }) }}
                                aria-label={`${info.label} target`}
                              />
                              {info.unit === 'hours' && <span>h</span>}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {error && <p className="tg-form-error" role="alert">{error}</p>}
              </>
            )}
          </div>
        </div>

        <footer className="tg-editor-foot">
          {saved && <span className="tg-saved" role="status">✓ Saved</span>}
          <button type="button" className="mkt-btn-ghost" onClick={onClose}>Close</button>
          <button type="button" className="tg-edit" onClick={submit} disabled={!form || save.isPending}>{save.isPending ? 'Saving…' : 'Save targets'}</button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
