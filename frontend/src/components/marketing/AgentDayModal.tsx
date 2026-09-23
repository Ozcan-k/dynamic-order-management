import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SALE_CHANNEL_LABELS, SALES_PLATFORM_LABELS, UserRole, type SaleChannel, type SalesPlatform, type SalesStore } from '@dom/shared'
import { deleteAgentDirectOrder, fetchAgentDayDetail, updateAgentDirectOrder } from '../../api/marketing'
import type { DirectOrder } from '../../api/sales'
import { useAuthStore } from '../../stores/authStore'
import DirectOrderFormModal from '../sales/DirectOrderFormModal'
import { AgentAvatar } from './chartKit'
import { formatCompact, formatHours, formatInt, formatPct, formatPHP, longDate } from './format'
import { IconX } from './icons'
import { CHANNEL_COLOR, completionStatus, METRIC_COLOR, OTHER, PLATFORM_COLOR } from './palette'

const PAGE = 10

interface Props {
  agentId: string
  agentName: string
  agentColor: string
  date: string
  isToday: boolean
  onClose: () => void
}

export default function AgentDayModal({ agentId, agentName, agentColor, date, isToday, onClose }: Props) {
  const queryClient = useQueryClient()
  const isAdmin = useAuthStore((s) => s.user?.role) === UserRole.ADMIN
  const [editingOrder, setEditingOrder] = useState<DirectOrder | null>(null)
  const [page, setPage] = useState(0)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['marketing-agent-day', agentId, date],
    queryFn: () => fetchAgentDayDetail(agentId, date),
    staleTime: 30_000,
  })

  function invalidateAll() {
    for (const key of ['marketing-agent-day', 'marketing-agent-calendar', 'marketing-agent-summary', 'marketing-overview', 'marketing-activity-grid', 'marketing-leaderboard', 'marketing-comparison']) {
      queryClient.invalidateQueries({ queryKey: [key] })
    }
  }

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof updateAgentDirectOrder>[1] }) => updateAgentDirectOrder(id, payload),
    onSuccess: () => { invalidateAll(); setEditingOrder(null) },
  })
  const deleteMutation = useMutation({ mutationFn: deleteAgentDirectOrder, onSuccess: invalidateAll })

  function handleDelete(order: DirectOrder) {
    if (deleteMutation.isPending) return
    const ok = window.confirm(
      `Delete ${agentName}'s order?\n\n${order.date} · ${order.companyName} · ${order.customerName}\n${formatPHP(Number(order.totalAmount))}`,
    )
    if (ok) deleteMutation.mutate(order.id)
  }

  // Body scroll lock + Esc (only when the edit form isn't on top)
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !editingOrder) onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose, editingOrder])

  const totals = useMemo(() => {
    const stores = data?.stores ?? []
    const orders = data?.directOrders ?? []
    return {
      postsDone: stores.reduce((s, x) => s + (x.contentPostsDone ?? x.contentPostsCount), 0),
      postsRequired: stores.reduce((s, x) => s + (x.contentPostsRequired ?? 0), 0),
      liveHours: stores.reduce((s, x) => s + x.liveSellingHours, 0),
      liveOrders: stores.reduce((s, x) => s + x.liveSellingOrders, 0),
      inquiries: stores.reduce((s, x) => s + x.marketplaceInquiries, 0),
      sales: orders.reduce((s, o) => s + Number(o.totalAmount), 0),
    }
  }, [data])

  const orders = data?.directOrders ?? []
  const pages = Math.max(1, Math.ceil(orders.length / PAGE))
  const pageOrders = orders.slice(page * PAGE, page * PAGE + PAGE)
  const rate = totals.postsRequired > 0 ? totals.postsDone / totals.postsRequired : null

  return (
    <div className="mkt-modal-backdrop" onClick={onClose}>
      <div className="mkt-modal" role="dialog" aria-modal="true" aria-label={`${agentName} on ${longDate(date)}`} onClick={(e) => e.stopPropagation()}>
        <header className="mkt-modal-head" style={{ '--agent': agentColor } as React.CSSProperties}>
          <AgentAvatar name={agentName} color={agentColor} size={40} />
          <div className="mkt-modal-title">
            <span>{agentName}</span>
            <strong>
              {longDate(date)}
              {isToday && <em>Today</em>}
            </strong>
          </div>
          <button type="button" className="mkt-modal-close" onClick={onClose} aria-label="Close"><IconX size={16} /></button>
        </header>

        <div className="mkt-modal-body">
          {isLoading && <div className="mkt-chart-skeleton" style={{ height: 260 }} />}
          {isError && <div className="mkt-error" role="alert">Could not load this day.</div>}

          {data && (
            <>
              <div className="mkt-day-tiles">
                <DayTile color={METRIC_COLOR.content} label="Content" value={rate === null ? '—' : formatPct(rate)} sub={rate === null ? 'no store report' : `${totals.postsDone} of ${totals.postsRequired} posts`} />
                <DayTile color={METRIC_COLOR.directSales} label="Direct sales" value={formatPHP(totals.sales)} sub={`${orders.length} order${orders.length === 1 ? '' : 's'}`} />
                <DayTile color={METRIC_COLOR.liveOrders} label="Live orders" value={formatInt(totals.liveOrders)} sub={`${formatHours(totals.liveHours)}h live`} />
                <DayTile color={METRIC_COLOR.inquiries} label="Inquiries" value={formatInt(totals.inquiries)} sub={`${data.stores.length} store${data.stores.length === 1 ? '' : 's'} reported`} />
              </div>

              <h3 className="mkt-modal-h">Stores reported</h3>
              {data.stores.length === 0 ? (
                <p className="mkt-modal-empty">No activity logged for this day.</p>
              ) : (
                <div className="mkt-day-stores">
                  {data.stores.map((s) => {
                    const req = s.contentPostsRequired ?? 0
                    const done = s.contentPostsDone ?? s.contentPostsCount
                    const st = req ? completionStatus(done / req) : null
                    return (
                      <article key={s.store} className="mkt-day-store">
                        <header>
                          <h4>{s.store}</h4>
                          {st && <span className="mkt-status" style={{ '--st': st.color } as React.CSSProperties}>{st.label}</span>}
                        </header>
                        {req > 0 && (
                          <div className="mkt-day-progress" title={`${done} of ${req} mandatory posts`}>
                            <div><span style={{ width: `${(done / req) * 100}%`, background: METRIC_COLOR.content }} /></div>
                            <small>{done}/{req} posts</small>
                          </div>
                        )}
                        {(s.live ?? []).length > 0 && (
                          <ul className="mkt-day-live">
                            {(s.live ?? []).map((l) => {
                              const eng = l.likes + l.comments + l.shares
                              return (
                                <li key={l.platform}>
                                  <span className="mkt-swatch mkt-swatch--dot" style={{ background: PLATFORM_COLOR[l.platform] ?? OTHER }} />
                                  <strong>{SALES_PLATFORM_LABELS[l.platform as SalesPlatform] ?? l.platform}</strong>
                                  <span>{formatHours(l.hours)}h</span>
                                  <span>{l.orders} orders</span>
                                  <span title={`${l.likes} likes · ${l.comments} comments · ${l.shares} shares`}>{formatCompact(l.views)} views{l.views ? ` · ${formatPct(eng / l.views, 1)} eng.` : ''}</span>
                                  {l.followers > 0 && <span>+{l.followers} followers</span>}
                                </li>
                              )
                            })}
                          </ul>
                        )}
                        {(s.marketplaceInquiries > 0 || (s.listingsCreated ?? 0) > 0) && (
                          <p className="mkt-day-market">Marketplace · {s.marketplaceInquiries} {s.marketplaceInquiries === 1 ? 'inquiry' : 'inquiries'} · {s.listingsCreated ?? 0} {(s.listingsCreated ?? 0) === 1 ? 'listing' : 'listings'}</p>
                        )}
                      </article>
                    )
                  })}
                </div>
              )}

              <h3 className="mkt-modal-h">Direct orders{orders.length > 0 ? ` · ${orders.length}` : ''}</h3>
              {orders.length === 0 ? (
                <p className="mkt-modal-empty">No direct orders for this day.</p>
              ) : (
                <>
                  <div className="mkt-table-scroll">
                    <table className="mkt-table mkt-table--compact">
                      <thead>
                        <tr>
                          <th scope="col">Channel</th>
                          <th scope="col">Store</th>
                          <th scope="col">Company</th>
                          <th scope="col">Customer</th>
                          <th scope="col" className="mkt-num">Items</th>
                          <th scope="col" className="mkt-num">Total</th>
                          {isAdmin && <th scope="col" className="mkt-num"><span className="sr-only">Actions</span></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {pageOrders.map((o) => (
                          <tr key={o.id}>
                            <td>
                              <span className="mkt-chan">
                                <span className="mkt-swatch mkt-swatch--dot" style={{ background: CHANNEL_COLOR[o.saleChannel] ?? OTHER }} />
                                {SALE_CHANNEL_LABELS[o.saleChannel as SaleChannel] ?? o.saleChannel}
                              </span>
                            </td>
                            <td>{o.store}</td>
                            <td>{o.companyName}</td>
                            <td>{o.customerName}</td>
                            <td className="mkt-num" title={o.items.map((it) => `${it.quantity} × ${it.productName}`).join('\n')}>{o.items.reduce((s, it) => s + it.quantity, 0)}</td>
                            <td className="mkt-num"><strong>{formatPHP(Number(o.totalAmount))}</strong></td>
                            {isAdmin && (
                              <td className="mkt-num">
                                <div className="mkt-row-actions">
                                  <button type="button" onClick={() => setEditingOrder(o)}>Edit</button>
                                  <button
                                    type="button"
                                    className="mkt-danger"
                                    onClick={() => handleDelete(o)}
                                    disabled={deleteMutation.isPending && deleteMutation.variables === o.id}
                                  >
                                    {deleteMutation.isPending && deleteMutation.variables === o.id ? '…' : 'Delete'}
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {pages > 1 && (
                    <div className="mkt-pager">
                      <button type="button" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>‹ Prev</button>
                      <span>{page * PAGE + 1}–{Math.min(orders.length, (page + 1) * PAGE)} of {orders.length}</span>
                      <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page >= pages - 1}>Next ›</button>
                    </div>
                  )}
                  {(updateMutation.isError || deleteMutation.isError) && (
                    <div className="mkt-error" role="alert" style={{ marginTop: 10 }}>The change could not be saved. Try again.</div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {editingOrder && (
        <div onClick={(e) => e.stopPropagation()}>
          <DirectOrderFormModal
            mode="edit"
            lockDateStore={false}
            date={editingOrder.date}
            store={editingOrder.store as SalesStore}
            initialOrder={editingOrder}
            submitting={updateMutation.isPending}
            onSubmit={(payload) => updateMutation.mutate({ id: editingOrder.id, payload })}
            onCancel={() => setEditingOrder(null)}
          />
        </div>
      )}
    </div>
  )
}

function DayTile({ color, label, value, sub }: { color: string; label: string; value: string; sub: string }) {
  return (
    <div className="mkt-mini" style={{ '--kpi': color } as React.CSSProperties}>
      <div className="mkt-mini-label">{label}</div>
      <div className="mkt-mini-value">{value}</div>
      <div className="mkt-mini-sub">{sub}</div>
    </div>
  )
}
