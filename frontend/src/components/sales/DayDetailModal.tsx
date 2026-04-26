import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { SALE_CHANNEL_LABELS } from '@dom/shared'
import { fetchDayDetail, type DayDetailStore, type DirectOrder } from '../../api/sales'

interface DayDetailModalProps {
  date: string
  isToday: boolean
  onClose: () => void
}

const MAX_ORDER_ROWS = 5

export default function DayDetailModal({ date, isToday, onClose }: DayDetailModalProps) {
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['sales-day-detail', date],
    queryFn: () => fetchDayDetail(date),
    staleTime: 5_000,
  })

  // Esc to close + scroll lock
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
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
      sales: orders.reduce((s, o) => s + o.totalAmount, 0),
    }
  }, [data])

  const orders = data?.directOrders ?? []
  const visibleOrders = orders.slice(0, MAX_ORDER_ROWS)
  const overflow = orders.length - visibleOrders.length

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.55)',
        zIndex: 200,
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
          width: '100%',
          maxWidth: '760px',
          borderRadius: '14px',
          boxShadow: '0 24px 60px rgba(15,23,42,0.30)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          background: 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <strong style={{ fontSize: '17px', letterSpacing: '0.01em' }}>{formatHumanDate(date)}</strong>
            {isToday && (
              <span style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '3px 10px',
                background: '#fff',
                color: '#1d4ed8',
                borderRadius: '9999px',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}>Today</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: '32px',
              height: '32px',
              fontSize: '18px',
              fontWeight: 700,
              border: 'none',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              cursor: 'pointer',
            }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {isLoading ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
              Loading day detail…
            </div>
          ) : (
            <>
              {/* 4 metric tiles */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '10px',
              }}>
                <Tile icon="📝" label="Posts" value={String(totals.posts)} />
                <Tile icon="🔴" label="Live Hours" value={formatHours(totals.liveHours)} />
                <Tile icon="🛍️" label="Live Orders" value={String(totals.liveOrders)} />
                <Tile icon="💰" label="Direct Sales" value={formatPHP(totals.sales)} highlight />
                <Tile icon="🛒" label="Inquiries" value={String(totals.inquiries)} />
              </div>

              {/* Stores reported */}
              <Section title="Stores reported">
                {data && data.stores.length > 0 ? (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: '8px',
                  }}>
                    {data.stores.map((s) => <StoreRow key={s.store} store={s} />)}
                  </div>
                ) : (
                  <EmptyHint text="No store activity logged for this day yet." />
                )}
              </Section>

              {/* Live Sales Orders */}
              <Section title={`Live Sales Orders${totals.liveOrders > 0 ? ` · ${totals.liveOrders}` : ''}`}>
                {data && data.stores.some((s) => s.liveSellingOrders > 0) ? (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: '8px',
                  }}>
                    {data.stores.filter((s) => s.liveSellingOrders > 0).map((s) => (
                      <div key={s.store} style={{
                        background: '#fff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        padding: '10px 12px',
                      }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
                          {s.store}
                        </div>
                        <div style={{ fontSize: '11px', color: '#475569' }}>
                          🛍️ {s.liveSellingOrders} order{s.liveSellingOrders !== 1 ? 's' : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyHint text="No live selling orders for this day." />
                )}
              </Section>

              {/* Direct orders */}
              <Section title={`Direct orders${orders.length > 0 ? ` · ${orders.length}` : ''}`}>
                {orders.length === 0 ? (
                  <EmptyHint text="No direct orders for this day." />
                ) : (
                  <>
                    <div style={{
                      background: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      overflow: 'hidden',
                    }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <Th>Channel</Th>
                            <Th>Company</Th>
                            <Th>Customer</Th>
                            <Th align="right">Total</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleOrders.map((o) => <OrderRow key={o.id} order={o} />)}
                        </tbody>
                      </table>
                    </div>
                    {overflow > 0 && (
                      <button
                        type="button"
                        onClick={() => navigate('/sales/orders')}
                        style={{
                          marginTop: '6px',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#1d4ed8',
                          background: 'none',
                          border: 'none',
                          padding: '4px 0',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        View all {orders.length} in My Orders →
                      </button>
                    )}
                  </>
                )}
              </Section>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid #e2e8f0',
          background: '#f8fafc',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            Edit details in the entry form →
          </span>
          <button
            type="button"
            onClick={() => navigate(`/sales/entry?date=${date}`)}
            style={{
              fontSize: '13px',
              fontWeight: 700,
              padding: '9px 16px',
              border: 'none',
              borderRadius: '10px',
              background: '#1d4ed8',
              color: '#fff',
              cursor: 'pointer',
            }}
          >Open in Daily Entry →</button>
        </div>
      </div>
    </div>
  )
}

function Tile({ icon, label, value, highlight }: { icon: string; label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{
      background: highlight ? 'linear-gradient(135deg, #15803d 0%, #22c55e 100%)' : '#f8fafc',
      color: highlight ? '#fff' : '#0f172a',
      border: highlight ? 'none' : '1px solid #e2e8f0',
      borderRadius: '12px',
      padding: '12px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
    }}>
      <span style={{ fontSize: '22px' }}>{icon}</span>
      <div>
        <div style={{
          fontSize: '10px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: highlight ? 'rgba(255,255,255,0.85)' : '#64748b',
          marginBottom: '2px',
        }}>{label}</div>
        <div style={{ fontSize: '17px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: '11px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: '#64748b',
        marginBottom: '8px',
      }}>{title}</div>
      {children}
    </div>
  )
}

function StoreRow({ store }: { store: DayDetailStore }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: '10px',
      padding: '10px 12px',
    }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
        {store.store}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '11px', color: '#475569' }}>
        {store.contentPostsCount > 0 && <Pill text={`📝 ${store.contentPostsCount}`} />}
        {store.liveSellingHours > 0 && <Pill text={`🔴 ${formatHours(store.liveSellingHours)}h`} />}
        {store.liveSellingOrders > 0 && <Pill text={`🛍️ ${store.liveSellingOrders}`} />}
        {store.marketplaceInquiries > 0 && <Pill text={`🛒 ${store.marketplaceInquiries}`} />}
      </div>
    </div>
  )
}

function Pill({ text }: { text: string }) {
  return (
    <span style={{
      padding: '2px 8px',
      background: '#eff6ff',
      color: '#1d4ed8',
      borderRadius: '9999px',
      fontWeight: 600,
    }}>{text}</span>
  )
}

function OrderRow({ order }: { order: DirectOrder }) {
  return (
    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
      <Td>
        <span style={{
          display: 'inline-block',
          padding: '2px 8px',
          fontSize: '11px',
          fontWeight: 600,
          borderRadius: '9999px',
          background: '#eff6ff',
          color: '#1d4ed8',
        }}>{SALE_CHANNEL_LABELS[order.saleChannel]}</span>
      </Td>
      <Td>{order.companyName}</Td>
      <Td>{order.customerName}</Td>
      <Td align="right"><strong style={{ color: '#0f172a' }}>{formatPHP(order.totalAmount)}</strong></Td>
    </tr>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th style={{
      textAlign: align ?? 'left',
      padding: '8px 12px',
      fontSize: '11px',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      color: '#64748b',
    }}>{children}</th>
  )
}

function Td({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <td style={{
      textAlign: align ?? 'left',
      padding: '8px 12px',
      verticalAlign: 'top',
      color: '#0f172a',
      fontSize: '13px',
    }}>{children}</td>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div style={{
      padding: '14px',
      textAlign: 'center',
      background: '#f8fafc',
      border: '1px dashed #cbd5e1',
      borderRadius: '10px',
      color: '#64748b',
      fontSize: '12px',
    }}>{text}</div>
  )
}

function formatHumanDate(d: string): string {
  // YYYY-MM-DD → "Saturday, April 19, 2026"
  const [y, m, day] = d.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, day))
  return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

function formatHours(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1)
}

function formatPHP(n: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(n)
}
