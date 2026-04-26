import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SalesDayMetrics, SalesStore } from '@dom/shared'
import PageShell from '../shared/PageShell'
import MonthCalendar from './MonthCalendar'
import DaySummaryCell from './DaySummaryCell'
import DirectOrderFormModal from './DirectOrderFormModal'
import {
  deleteAgentDirectOrder,
  fetchAgentCalendar,
  fetchAgentDayDetail,
  updateAgentDirectOrder,
  type MarketingAgent,
} from '../../api/marketing'
import type { DirectOrder } from '../../api/sales'
import { useAuthStore } from '../../stores/authStore'

interface AgentDetailPanelProps {
  agent: MarketingAgent
  onBack: () => void
}

function todayManila(): string {
  const ms = Date.now() + 8 * 60 * 60 * 1000
  return new Date(ms).toISOString().slice(0, 10)
}

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  )
}

function AgentIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

export default function AgentDetailPanel({ agent, onBack }: AgentDetailPanelProps) {
  const user = useAuthStore((s) => s.user)
  const today = todayManila()

  const [month, setMonth] = useState<string>(today.slice(0, 7))
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const calendarQuery = useQuery({
    queryKey: ['marketing-agent-calendar', agent.id, month],
    queryFn: () => fetchAgentCalendar(agent.id, month),
    staleTime: 30_000,
  })

  const metricsByDate = useMemo(() => {
    const map = new Map<string, SalesDayMetrics>()
    calendarQuery.data?.days?.forEach((d) => map.set(d.date, d))
    return map
  }, [calendarQuery.data])

  const monthTotals = useMemo(() => {
    const days = calendarQuery.data?.days ?? []
    return days.reduce(
      (acc, d) => ({
        posts: acc.posts + d.contentPostsCount,
        liveHours: acc.liveHours + d.liveSellingHours,
        sales: acc.sales + d.directSalesAmount,
        inquiries: acc.inquiries + d.marketplaceInquiries,
      }),
      { posts: 0, liveHours: 0, sales: 0, inquiries: 0 },
    )
  }, [calendarQuery.data])

  return (
    <PageShell
      icon={<AgentIcon />}
      title={agent.username}
      subtitle={`${user?.username} · viewing agent · sales agent`}
    >
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 14px',
          fontSize: '13px',
          fontWeight: 700,
          border: '1px solid #cbd5e1',
          borderRadius: '8px',
          background: '#fff',
          color: '#1d4ed8',
          cursor: 'pointer',
          marginBottom: '12px',
        }}
      >
        <BackIcon />
        Back to Comparison
      </button>

      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)',
        color: '#fff',
        borderRadius: '14px',
        padding: '18px 20px',
        marginBottom: '14px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '14px',
        boxShadow: '0 4px 12px rgba(29,78,216,0.18)',
      }}>
        <div>
          <div style={{
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.85)',
            marginBottom: '4px',
          }}>Agent · {month}</div>
          <div style={{ fontSize: '20px', fontWeight: 700 }}>{agent.username}</div>
          <div style={{ fontSize: '12px', opacity: 0.85, marginTop: '2px' }}>
            Joined {new Date(agent.createdAt).toLocaleDateString('en-PH')}
          </div>
        </div>
        <span style={{
          fontSize: '11px',
          fontWeight: 700,
          padding: '6px 12px',
          background: 'rgba(255,255,255,0.18)',
          color: '#fff',
          borderRadius: '9999px',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>Admin access</span>
      </div>

      {/* Month stat cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '12px',
        marginBottom: '16px',
      }}>
        <StatCard label="Posts (month)" value={String(monthTotals.posts)} icon="📝" />
        <StatCard label="Live Hours (month)" value={formatHours(monthTotals.liveHours)} icon="🔴" />
        <StatCard label="Direct Sales (month)" value={formatPHP(monthTotals.sales)} icon="💰" highlight />
        <StatCard label="Inquiries (month)" value={String(monthTotals.inquiries)} icon="🛒" />
      </div>

      {calendarQuery.isLoading && (
        <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>Loading calendar…</div>
      )}

      <MonthCalendar
        month={month}
        onMonthChange={setMonth}
        todayDate={today}
        renderCell={(date, ctx) => (
          <DaySummaryCell
            date={date}
            inMonth={ctx.inMonth}
            isToday={ctx.isToday}
            isFuture={ctx.isFuture}
            metrics={metricsByDate.get(date) ?? null}
            onClick={() => setSelectedDate(date)}
          />
        )}
      />

      {selectedDate && (
        <AgentDayModal
          agentId={agent.id}
          agentName={agent.username}
          date={selectedDate}
          isToday={selectedDate === today}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </PageShell>
  )
}

function AgentDayModal({ agentId, agentName, date, isToday, onClose }: {
  agentId: string
  agentName: string
  date: string
  isToday: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [editingOrder, setEditingOrder] = useState<DirectOrder | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['marketing-agent-day', agentId, date],
    queryFn: () => fetchAgentDayDetail(agentId, date),
    staleTime: 30_000,
  })

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['marketing-agent-day', agentId] })
    queryClient.invalidateQueries({ queryKey: ['marketing-agent-calendar', agentId] })
    queryClient.invalidateQueries({ queryKey: ['marketing-leaderboard'] })
    queryClient.invalidateQueries({ queryKey: ['marketing-comparison'] })
  }

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof updateAgentDirectOrder>[1] }) =>
      updateAgentDirectOrder(id, payload),
    onSuccess: () => { invalidateAll(); setEditingOrder(null) },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAgentDirectOrder,
    onSuccess: () => invalidateAll(),
  })

  function handleDelete(order: DirectOrder) {
    if (deleteMutation.isPending) return
    const ok = window.confirm(
      `Delete ${agentName}'s order?\n\n${order.date} · ${order.companyName} · ${order.customerName}\n${formatPHP(Number(order.totalAmount))}`,
    )
    if (!ok) return
    deleteMutation.mutate(order.id)
  }

  // Body scroll lock + Esc close
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const totals = useMemo(() => {
    const stores = data?.stores ?? []
    const orders = data?.directOrders ?? []
    return {
      posts: stores.reduce((s, x) => s + x.contentPostsCount, 0),
      liveHours: stores.reduce((s, x) => s + x.liveSellingHours, 0),
      liveOrders: stores.reduce((s, x) => s + x.liveSellingOrders, 0),
      inquiries: stores.reduce((s, x) => s + x.marketplaceInquiries, 0),
      directSales: orders.reduce((s, o) => s + Number(o.totalAmount), 0),
    }
  }, [data])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.55)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '40px 16px',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: '14px',
          width: '100%',
          maxWidth: '720px',
          boxShadow: '0 24px 60px rgba(15,23,42,0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)',
          color: '#fff',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)', marginBottom: '2px' }}>
              {agentName}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              {date}
              {isToday && <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', background: 'rgba(255,255,255,0.22)', borderRadius: '9999px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Today</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: '32px', height: '32px',
              border: 'none',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.18)',
              color: '#fff',
              fontSize: '20px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 20px' }}>
          {isLoading && <div style={{ color: '#94a3b8', fontSize: '13px' }}>Loading…</div>}

          {!isLoading && data && (
            <>
              {/* 4 metric tiles */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '10px',
                marginBottom: '16px',
              }}>
                <Tile icon="📝" label="Posts" value={String(totals.posts)} />
                <Tile icon="🔴" label="Live Hours" value={formatHours(totals.liveHours)} />
                <Tile icon="🛍️" label="Live Orders" value={String(totals.liveOrders)} />
                <Tile icon="💰" label="Direct Sales" value={formatPHP(totals.directSales)} highlight />
                <Tile icon="🛒" label="Inquiries" value={String(totals.inquiries)} />
              </div>

              {/* Stores */}
              <h3 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Stores reported</h3>
              {data.stores.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '16px' }}>No activity logged for this day.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px', marginBottom: '16px' }}>
                  {data.stores.map((s) => (
                    <div key={s.store} style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      background: '#f8fafc',
                    }}>
                      <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '13px', marginBottom: '6px' }}>{s.store}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {s.contentPostsCount > 0 && <Pill text={`📝 ${s.contentPostsCount}`} />}
                        {s.liveSellingHours > 0 && <Pill text={`🔴 ${formatHours(s.liveSellingHours)}h`} />}
                        {s.liveSellingOrders > 0 && <Pill text={`🛍️ ${s.liveSellingOrders}`} />}
                        {s.marketplaceInquiries > 0 && <Pill text={`🛒 ${s.marketplaceInquiries}`} />}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Live Sales Orders */}
              <h3 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                Live Sales Orders{totals.liveOrders > 0 ? ` · ${totals.liveOrders}` : ''}
              </h3>
              {data.stores.some((s) => s.liveSellingOrders > 0) ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px', marginBottom: '16px' }}>
                  {data.stores.filter((s) => s.liveSellingOrders > 0).map((s) => (
                    <div key={`live-${s.store}`} style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      background: '#f8fafc',
                    }}>
                      <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '13px', marginBottom: '6px' }}>{s.store}</div>
                      <div style={{ fontSize: '12px', color: '#475569' }}>
                        🛍️ {s.liveSellingOrders} order{s.liveSellingOrders !== 1 ? 's' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '16px' }}>No live selling orders for this day.</div>
              )}

              {/* Orders */}
              <h3 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Direct Orders</h3>
              {data.directOrders.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>No direct orders for this day.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th style={th}>Channel</th>
                        <th style={th}>Store</th>
                        <th style={th}>Company</th>
                        <th style={th}>Customer</th>
                        <th style={{ ...th, textAlign: 'right' }}>Total</th>
                        <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.directOrders.slice(0, 8).map((o) => (
                        <tr key={o.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                          <td style={td}>{o.saleChannel}</td>
                          <td style={td}>{o.store}</td>
                          <td style={td}>{o.companyName}</td>
                          <td style={td}>{o.customerName}</td>
                          <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#15803d' }}>{formatPHP(Number(o.totalAmount))}</td>
                          <td style={{ ...td, textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                              <button
                                type="button"
                                onClick={() => setEditingOrder(o)}
                                title="Edit order"
                                style={adminActionBtn('#1d4ed8')}
                              >Edit</button>
                              <button
                                type="button"
                                onClick={() => handleDelete(o)}
                                disabled={deleteMutation.isPending && deleteMutation.variables === o.id}
                                title="Delete order"
                                style={adminActionBtn('#dc2626', deleteMutation.isPending && deleteMutation.variables === o.id)}
                              >
                                {deleteMutation.isPending && deleteMutation.variables === o.id ? '…' : 'Delete'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.directOrders.length > 8 && (
                    <div style={{ marginTop: '6px', fontSize: '11px', color: '#94a3b8' }}>
                      Showing first 8 of {data.directOrders.length} orders.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {editingOrder && (
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
      )}
    </div>
  )
}

function adminActionBtn(color: string, disabled = false): React.CSSProperties {
  return {
    fontSize: '11px', fontWeight: 600,
    padding: '3px 8px',
    border: `1px solid ${color}`, borderRadius: '5px',
    background: '#fff', color,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  }
}

function Tile({ icon, label, value, highlight }: { icon: string; label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{
      background: highlight ? 'linear-gradient(135deg, #15803d 0%, #22c55e 100%)' : '#f8fafc',
      color: highlight ? '#fff' : '#0f172a',
      border: highlight ? 'none' : '1px solid #e2e8f0',
      borderRadius: '10px',
      padding: '10px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
    }}>
      <div style={{ fontSize: '18px' }}>{icon}</div>
      <div>
        <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: highlight ? 'rgba(255,255,255,0.85)' : '#64748b' }}>{label}</div>
        <div style={{ fontSize: '16px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      </div>
    </div>
  )
}

function Pill({ text }: { text: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: '9999px',
      fontSize: '11px',
      fontWeight: 600,
      color: '#475569',
    }}>{text}</span>
  )
}

function StatCard({ label, value, icon, highlight }: { label: string; value: string; icon: string; highlight?: boolean }) {
  return (
    <div style={{
      background: highlight ? 'linear-gradient(135deg, #15803d 0%, #22c55e 100%)' : '#fff',
      color: highlight ? '#fff' : '#0f172a',
      border: highlight ? 'none' : '1px solid #e2e8f0',
      borderRadius: '12px',
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    }}>
      <div style={{ fontSize: '24px' }}>{icon}</div>
      <div>
        <div style={{
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: highlight ? 'rgba(255,255,255,0.85)' : '#64748b',
          marginBottom: '4px',
        }}>{label}</div>
        <div style={{ fontSize: '20px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      </div>
    </div>
  )
}

const th: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'left',
  fontSize: '10px',
  fontWeight: 700,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const td: React.CSSProperties = {
  padding: '8px 10px',
}

function formatHours(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1)
}

function formatPHP(n: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(n)
}
