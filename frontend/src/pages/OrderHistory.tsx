import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { PLATFORM_LABELS, DISPATCH_SOURCE_LABELS, type Platform, type DispatchSource } from '@dom/shared'
import { useAuthStore } from '../stores/authStore'
import PageShell from '../components/shared/PageShell'
import { getOrderHistory, type OrderHistory as OrderHistoryData, type HistoryEventType, type HistoryWorkStage } from '../api/dispatch'
import { getCarrierStyle, getCarrierLabel } from '../components/shared/carrierStyle'
import { fmtManilaDateTime, fmtManilaShort, fmtDuration } from '../components/outbound/obFormat'

// Outbound → Order History (v2.98.0). Replaces the Warehouse Report "Order Timeline":
// one waybill end to end — who scanned it in, which picker and packer had it and
// when, and who scanned it out to the courier.

const HistoryIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l3 2" />
  </svg>
)

const ScanIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
    <path d="M7 8v8M10 8v8M13 8v8M16 8v8" />
  </svg>
)

const STATION_ICONS: Record<'inbound' | 'picker' | 'packer' | 'outbound', ReactNode> = {
  inbound: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 21h16" />
    </svg>
  ),
  picker: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 7h12l-1 13H7L6 7Z" /><path d="M9 7a3 3 0 0 1 6 0" />
    </svg>
  ),
  packer: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 8 12 3 3 8l9 5 9-5Z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" />
    </svg>
  ),
  outbound: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="1" y="3" width="15" height="13" rx="2" /><path d="M16 8h4l3 5v3h-7V8z" />
      <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  ),
}

const EVENT_COLORS: Record<HistoryEventType, string> = {
  inbound:         '#2563eb',
  picker_assigned: '#8b5cf6',
  picking:         '#a855f7',
  picker_complete: '#16a34a',
  packer_assigned: '#f59e0b',
  packing:         '#f97316',
  packer_complete: '#16a34a',
  ready:           '#0ea5e9',
  returned:        '#dc2626',
  outbound:        '#0f766e',
}

const D_STYLE = [
  { bg: '#f1f5f9', fg: '#475569', border: '#e2e8f0' },
  { bg: '#fefce8', fg: '#a16207', border: '#fde68a' },
  { bg: '#fff7ed', fg: '#c2410c', border: '#fed7aa' },
  { bg: '#fef2f2', fg: '#dc2626', border: '#fecaca' },
  { bg: '#fee2e2', fg: '#991b1b', border: '#fca5a5' },
]

const RECENT_KEY = 'outbound-history-recent'

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').slice(0, 6) : []
  } catch {
    return []
  }
}

function writeRecent(list: string[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6))) } catch { /* private mode */ }
}

function titleCase(v: string): string {
  return v.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

type StationState = 'done' | 'active' | 'pending'
const STATE_LABEL: Record<StationState, string> = { done: 'Done', active: 'In progress', pending: 'Not yet' }

function Station({ kind, title, state, stateLabel, person, personRole, facts, duration }: {
  kind: keyof typeof STATION_ICONS
  title: string
  state: StationState
  stateLabel?: string
  person: string | null
  personRole: string
  facts: [string, ReactNode][]
  duration?: { label: string; ms: number | null }
}) {
  return (
    <article className={`oh-station oh-station--${state}`}>
      <div className="oh-station-top">
        <div className="oh-station-step">
          <span className="oh-station-icon">{STATION_ICONS[kind]}</span>
          <span className="oh-station-name">{title}</span>
        </div>
        <span className="oh-station-state">{stateLabel ?? STATE_LABEL[state]}</span>
      </div>
      <div className={`oh-person${person ? '' : ' oh-person--none'}`}>{person ?? 'No one yet'}</div>
      <div className="oh-person-role">{personRole}</div>
      {facts.length > 0 && (
        <ul className="oh-facts">
          {facts.map(([k, v]) => <li key={k}><span>{k}</span><b>{v}</b></li>)}
        </ul>
      )}
      {duration && duration.ms != null && (
        <span className="oh-duration">{duration.label} {fmtDuration(duration.ms)}</span>
      )}
    </article>
  )
}

function workState(stage: HistoryWorkStage | null): StationState {
  if (!stage) return 'pending'
  return stage.completedAt ? 'done' : 'active'
}

function workFacts(stage: HistoryWorkStage | null, startLabel: string): [string, ReactNode][] {
  if (!stage) return []
  const facts: [string, ReactNode][] = [
    ['Assigned', fmtManilaShort(stage.assignedAt)],
    ['Assigned by', stage.assignedBy ?? '—'],
  ]
  if (stage.startedAt) facts.push([startLabel, fmtManilaShort(stage.startedAt)])
  facts.push(['Completed', stage.completedAt ? fmtManilaShort(stage.completedAt) : '—'])
  if (stage.assignments > 1) facts.push(['Assignments', `${stage.assignments}× (re-assigned)`])
  return facts
}

function Result({ data }: { data: OrderHistoryData }) {
  const { order, stages } = data
  const carrierKey = stages.outbound?.carrier ?? order?.carrierName ?? null
  const carrierStyle = getCarrierStyle(carrierKey)
  const platform = (order?.platform ?? stages.outbound?.platform) as Platform | undefined
  const shop = order?.shopName ?? stages.outbound?.shopName ?? null
  const d = order ? D_STYLE[Math.min(Math.max(order.delayLevel, 0), 4)] : null

  const packedDone = !!stages.packer?.completedAt
    || order?.status === 'PACKER_COMPLETE' || order?.status === 'OUTBOUND'
  const outboundState: StationState = stages.outbound ? 'done' : packedDone ? 'active' : 'pending'

  // Wait at each hand-off: previous station finished → this one finished.
  const inboundAt = stages.inbound?.at ?? null
  const pickDone = stages.picker?.completedAt ?? null
  const packDone = stages.packer?.completedAt ?? null
  const gap = (a: string | null, b: string | null) => (a && b ? new Date(b).getTime() - new Date(a).getTime() : null)

  return (
    <div className="ob-stack">
      {/* Waybill header */}
      <section className="ob-card">
        <div className="oh-waybill">
          <div style={{ minWidth: 0 }}>
            <div className="oh-search-label" style={{ color: '#64748b' }}>Waybill</div>
            <div className="oh-waybill-tn">{data.trackingNumber}</div>
            <div className="oh-barcode" aria-hidden="true" />
            <div className="oh-chips">
              {order && <span className="ob-pill" style={{ color: '#1d4ed8', background: '#eff6ff', borderColor: '#bfdbfe' }}>{titleCase(order.status)}</span>}
              {order && d && (
                <span className="ob-pill" style={{ color: d.fg, background: d.bg, borderColor: d.border }}>D{order.delayLevel}</span>
              )}
              {carrierKey && (
                <span className="ob-pill" style={{ color: carrierStyle.badgeText, background: carrierStyle.badgeBg, borderColor: carrierStyle.border }}>
                  {getCarrierLabel(carrierKey)}
                </span>
              )}
              {platform && <span className="ob-pill">{PLATFORM_LABELS[platform] ?? platform}</span>}
              {shop && <span className="ob-pill">{shop.replace(/_/g, ' ')}</span>}
              {order?.archived && <span className="ob-pill ob-pill--muted">Archived</span>}
              {!order && <span className="ob-pill ob-pill--warn">Not in order system</span>}
            </div>
          </div>
          <div className="oh-total">
            <div className="oh-total-label">Inbound → Outbound</div>
            <div className="oh-total-value">
              {inboundAt && stages.outbound ? fmtDuration(gap(inboundAt, stages.outbound.at)) : fmtDuration(data.totalDurationMs)}
            </div>
            <div className="oh-total-sub">
              {inboundAt && stages.outbound ? 'Total time in the warehouse' : stages.outbound ? 'Outbound record only' : 'So far — not shipped yet'}
            </div>
          </div>
        </div>
      </section>

      {!order && (
        <div className="oh-note oh-note--info">
          This waybill is not in the order system — it was dispatched as an external parcel, so only the outbound scan is recorded.
        </div>
      )}
      {data.otherOrders > 0 && (
        <div className="oh-note">
          This tracking number was used by {data.otherOrders} older {data.otherOrders === 1 ? 'order' : 'orders'} too — showing the most recent one.
        </div>
      )}

      {/* Journey */}
      <div className="oh-journey">
        <Station
          kind="inbound"
          title="Inbound"
          state={stages.inbound ? 'done' : 'pending'}
          person={stages.inbound?.by ?? null}
          personRole="Scanned in by"
          facts={stages.inbound ? [['Scanned', fmtManilaShort(stages.inbound.at)]] : []}
        />
        <Station
          kind="picker"
          title="Picker"
          state={workState(stages.picker)}
          person={stages.picker?.worker ?? null}
          personRole="Picked by"
          facts={workFacts(stages.picker, 'Started')}
          duration={{ label: 'Picked in', ms: stages.picker?.durationMs ?? null }}
        />
        <Station
          kind="packer"
          title="Packer"
          state={workState(stages.packer)}
          person={stages.packer?.worker ?? null}
          personRole="Packed by"
          facts={workFacts(stages.packer, 'Started')}
          duration={{ label: 'Packed in', ms: stages.packer?.durationMs ?? null }}
        />
        <Station
          kind="outbound"
          title="Outbound"
          state={outboundState}
          stateLabel={outboundState === 'active' ? 'Waiting for scan' : undefined}
          person={stages.outbound?.by ?? null}
          personRole="Scanned out by"
          facts={stages.outbound ? [
            ['Scanned out', fmtManilaShort(stages.outbound.at)],
            ['Courier', getCarrierLabel(stages.outbound.carrier)],
            ['Source', DISPATCH_SOURCE_LABELS[stages.outbound.source as DispatchSource] ?? stages.outbound.source],
          ] : []}
          duration={{ label: 'Waited after packing', ms: gap(packDone ?? pickDone, stages.outbound?.at ?? null) }}
        />
      </div>

      {/* Full event log */}
      <section className="ob-card">
        <div className="ob-card-head">
          <div>
            <h2 className="ob-card-title">Full history</h2>
            <p className="ob-card-sub">Every status change and scan, oldest first, with the time since the previous step.</p>
          </div>
          <span className="ob-pill">{data.timeline.length} events</span>
        </div>
        {data.timeline.length === 0 ? (
          <div className="ob-empty" style={{ padding: '24px 0' }}>No events recorded.</div>
        ) : (
          <ol className="oh-events">
            {data.timeline.map((e, i) => (
              <li key={`${e.timestamp}-${i}`} className="oh-event">
                <span className="oh-event-dot" style={{ '--oh-dot': EVENT_COLORS[e.type] ?? '#3b82f6' } as CSSProperties} />
                <div style={{ minWidth: 0 }}>
                  <div className="oh-event-label">{e.label}</div>
                  <div className="oh-event-meta">
                    by <b>{e.actor}</b>{e.detail ? <> · {e.detail}</> : null}
                  </div>
                </div>
                <div className="oh-event-side">
                  {fmtManilaDateTime(e.timestamp)}
                  {e.durationFromPrevMs != null && (
                    <div><span className="oh-gap">+{fmtDuration(e.durationFromPrevMs)}</span></div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

export default function OrderHistory() {
  const user = useAuthStore((s) => s.user)
  const [params, setParams] = useSearchParams()
  const searched = (params.get('tn') ?? '').trim()
  const [input, setInput] = useState(searched)
  const [recent, setRecent] = useState<string[]>(() => readRecent())

  // Keep the box in sync when the URL changes (Old Orders link, back/forward).
  useEffect(() => { setInput(searched) }, [searched])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['order-history', searched.toUpperCase()],
    queryFn: () => getOrderHistory(searched),
    enabled: !!searched,
    retry: false,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!data) return
    setRecent((prev) => {
      const next = [data.trackingNumber, ...prev.filter((t) => t.toUpperCase() !== data.trackingNumber.toUpperCase())].slice(0, 6)
      writeRecent(next)
      return next
    })
  }, [data])

  function search(tn: string) {
    const v = tn.trim()
    if (!v) return
    setParams({ tn: v })
  }

  const notFound = isError && isAxiosError(error) && error.response?.status === 404

  return (
    <PageShell
      icon={HistoryIcon}
      title="Order History"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
    >
      <div className="ob-stack">
        <form className="oh-search" onSubmit={(e) => { e.preventDefault(); search(input) }}>
          <div className="oh-search-label">Order history</div>
          <div className="oh-search-title">Who handled this parcel, and when?</div>
          <div className="oh-search-row">
            <label className="oh-search-field">
              <ScanIcon />
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Scan or type a tracking number"
                aria-label="Tracking number"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                autoFocus
              />
            </label>
            <button type="submit" className="oh-search-btn" disabled={!input.trim()}>Search</button>
          </div>
          {recent.length > 0 && (
            <div className="oh-recent">
              Recent:
              {recent.map((t) => <button key={t} type="button" onClick={() => search(t)}>{t}</button>)}
            </div>
          )}
        </form>

        {!searched && (
          <div className="ob-card ob-empty">
            <div className="ob-empty-icon"><ScanIcon /></div>
            <div className="ob-empty-title">Search a waybill</div>
            You'll see who scanned it in, the picker and packer with their times, and who scanned it out to the courier.
          </div>
        )}

        {searched && isLoading && (
          <div className="ob-card ob-empty"><span className="spinner spinner-sm" />Loading history…</div>
        )}

        {notFound && (
          <div className="oh-note oh-note--error">
            Nothing found for <b style={{ fontFamily: 'var(--font-mono)', margin: '0 4px' }}>{searched}</b> — no order and no outbound scan with this tracking number.
          </div>
        )}

        {isError && !notFound && (
          <div className="oh-note oh-note--error">Couldn't load the history. Please try again.</div>
        )}

        {data && <Result data={data} />}
      </div>
    </PageShell>
  )
}
