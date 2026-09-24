import { useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { colors, radius, shadow, font } from '../theme'
import PageShell from '../components/shared/PageShell'
import Donut from '../components/shared/Donut'
import LivePerformanceTab from './reports/LivePerformanceTab'
import TargetPerformanceTab from './reports/TargetPerformanceTab'
import EmployeePerformanceTab from './reports/EmployeePerformanceTab'
import { presetRange, type PerfRange } from './reports/perf/perfUi'
import { getManilaDateString } from '../lib/manila'
import type { PerfRole } from '@dom/shared'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SlaData {
  days: number
  dateRange: { from: string; to: string }
  distribution: { d0: number; d1: number; d2: number; d3: number; d4: number }
  avgCompletionMinutes: number | null
  completedCount: number
  d4Unresolved: {
    id: string
    trackingNumber: string
    platform: string
    shopName: string | null
    carrierName: string | null
    slaStartedAt: string
    status: string
  }[]
}

interface TimelineEvent {
  type: string
  timestamp: string
  actor: string
  label: string
  durationFromPrevMs: number | null
}

interface TimelineData {
  order: {
    id: string
    trackingNumber: string
    status: string
    delayLevel: number
    slaStartedAt: string
    slaCompletedAt: string | null
    totalDurationMs: number
  }
  timeline: TimelineEvent[]
}

type ActiveTab = 'performance' | 'employee' | 'live' | 'sla' | 'timeline'

// ─── Icons ────────────────────────────────────────────────────────────────────

const ReportsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
    <line x1="2" y1="20" x2="22" y2="20" />
  </svg>
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatManila(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Manila',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function durationLabel(ms: number): string {
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// ─── Day Range Toggle ─────────────────────────────────────────────────────────

function DayRangeToggle({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
      <span style={{ fontSize: '12px', color: colors.textSecondary, fontWeight: 500, marginRight: '4px' }}>
        Range:
      </span>
      {[7, 14, 30].map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          style={{
            padding: '5px 12px',
            fontSize: '12px',
            fontWeight: 600,
            borderRadius: radius.md,
            border: `1.5px solid ${value === d ? '#6366f1' : colors.border}`,
            background: value === d ? '#eef2ff' : colors.surface,
            color: value === d ? '#4338ca' : colors.textSecondary,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {d}d
        </button>
      ))}
    </div>
  )
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.xl,
      boxShadow: shadow.card,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 20px',
        borderBottom: `1px solid ${colors.border}`,
        background: colors.surfaceAlt,
      }}>
        <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: colors.textPrimary }}>{title}</h2>
      </div>
      {children}
    </div>
  )
}

// ─── Export Buttons ───────────────────────────────────────────────────────────

function ExportPdfButton({ type, days, variant }: { type?: 'picker' | 'packer'; days: number; variant?: 'sla' }) {
  const baseUrl = import.meta.env.VITE_API_URL || ''
  const href = variant === 'sla'
    ? `${baseUrl}/reports/sla/export-pdf?days=${days}`
    : `${baseUrl}/reports/performance/export-pdf?type=${type}&days=${days}`
  return (
    <a
      href={href}
      download
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '5px',
        padding: '5px 12px', fontSize: '12px', fontWeight: 600,
        borderRadius: radius.md, border: `1.5px solid #fca5a5`,
        background: '#fff5f5', color: '#b91c1c',
        cursor: 'pointer', textDecoration: 'none', transition: 'all 0.15s',
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
      PDF
    </a>
  )
}

// ─── SLA Distribution Bar ─────────────────────────────────────────────────────

const D_COLORS = ['#64748b', '#eab308', '#f97316', '#ef4444', '#991b1b']
const D_BG    = ['#e5e7eb', '#fef9c3', '#fed7aa', '#fecaca', '#fca5a5']
const D_LABELS = ['D0', 'D1', 'D2', 'D3', 'D4']

function SlaDistributionBar({ dist }: { dist: SlaData['distribution'] }) {
  const counts = [dist.d0, dist.d1, dist.d2, dist.d3, dist.d4]
  const total = counts.reduce((s, v) => s + v, 0)
  const segments = counts.map((value, i) => ({
    label: D_LABELS[i],
    value,
    color: D_COLORS[i],
  }))
  return (
    <Donut
      segments={segments}
      size={160}
      thickness={22}
      centerLabel="Total"
      centerValue={total.toLocaleString()}
    />
  )
}

// ─── SLA Analytics Section ────────────────────────────────────────────────────

function SlaAnalyticsSection({ days }: { days: number }) {
  const { data, isLoading, isError } = useQuery<SlaData>({
    queryKey: ['reports', 'sla', days],
    queryFn: () => api.get(`/reports/sla?days=${days}`).then((r) => r.data),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  if (isLoading) {
    return <div style={{ textAlign: 'center', padding: '60px', color: colors.textSecondary }}>Loading SLA analytics...</div>
  }
  if (isError) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#ef4444', background: '#fef2f2', borderRadius: radius.lg, border: '1px solid #fecaca' }}>
        Failed to load SLA analytics.
      </div>
    )
  }
  if (!data) return null

  const avgH = data.avgCompletionMinutes != null
    ? `${Math.floor(data.avgCompletionMinutes / 60)}h ${data.avgCompletionMinutes % 60}m`
    : 'N/A'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Summary cards */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {[
          { label: 'Avg Completion Time', value: avgH, color: colors.primary },
          { label: 'Completed in Range', value: data.completedCount.toLocaleString(), color: colors.success },
          { label: 'D4 Unresolved', value: data.d4Unresolved.length.toString(), color: '#991b1b' },
        ].map((card) => (
          <div
            key={card.label}
            style={{
              flex: '1 1 140px',
              background: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.lg,
              boxShadow: shadow.card,
              padding: '16px 20px',
            }}
          >
            <div style={{ fontSize: font.xs, color: colors.textSecondary, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
              {card.label}
            </div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: card.color, fontVariantNumeric: 'tabular-nums' }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Distribution */}
      <SectionCard title={`SLA Level Distribution — Last ${days} Days`}>
        <div style={{ padding: '20px' }}>
          <SlaDistributionBar dist={data.distribution} />
        </div>
      </SectionCard>

      {/* D4 Unresolved */}
      {data.d4Unresolved.length > 0 && (
        <SectionCard title={`D4 Unresolved Orders (${data.d4Unresolved.length})`}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#fef2f2', borderBottom: `2px solid #fecaca` }}>
                  {['Tracking Number', 'Platform', 'Shop', 'Carrier', 'SLA Started', 'Elapsed', 'Status'].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.d4Unresolved.map((order, i) => {
                  const elapsedMs = Date.now() - new Date(order.slaStartedAt).getTime()
                  return (
                    <tr key={order.id} style={{ background: i % 2 === 0 ? colors.surface : '#fef2f2', borderBottom: `1px solid #fecaca` }}>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 600, fontSize: '12px', color: '#991b1b' }}>
                        {order.trackingNumber}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: '12px', color: colors.textPrimary }}>{order.platform}</td>
                      <td style={{ padding: '10px 14px', fontSize: '12px', color: colors.textPrimary, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {order.shopName ?? '—'}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: '12px', color: colors.textPrimary }}>{order.carrierName ?? '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: '12px', color: colors.textSecondary, whiteSpace: 'nowrap' }}>
                        {formatManila(order.slaStartedAt)}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 700, color: '#991b1b', whiteSpace: 'nowrap' }}>
                        {durationLabel(elapsedMs)}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: '12px', color: colors.textSecondary }}>
                        {order.status.replace(/_/g, ' ')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  )
}

// ─── Order Timeline Section ───────────────────────────────────────────────────

const EVENT_COLORS: Record<string, string> = {
  status_change:   '#3b82f6',
  picker_assigned: '#8b5cf6',
  picker_complete: '#10b981',
  packer_assigned: '#f59e0b',
  packer_complete: '#22c55e',
}

function OrderTimelineSection() {
  const [inputVal, setInputVal] = useState('')
  const [searchedTn, setSearchedTn] = useState('')

  const { data, isLoading, isError, error } = useQuery<TimelineData>({
    queryKey: ['reports', 'order-timeline', searchedTn],
    queryFn: () => api.get(`/reports/order-timeline?trackingNumber=${encodeURIComponent(searchedTn)}`).then((r) => r.data),
    enabled: !!searchedTn,
    retry: false,
    staleTime: 30_000,
  })

  function handleSearch() {
    const tn = inputVal.trim()
    if (tn) setSearchedTn(tn)
  }

  const is404 = isError && (error as any)?.response?.status === 404

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Search bar */}
      <div style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.xl,
        boxShadow: shadow.card,
        padding: '20px',
        display: 'flex',
        gap: '10px',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <div style={{ flex: '1 1 260px', display: 'flex', gap: '8px' }}>
          <input
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Enter tracking number..."
            style={{
              flex: 1,
              padding: '8px 14px',
              borderRadius: radius.md,
              border: `1.5px solid ${colors.border}`,
              fontSize: '13px',
              color: colors.textPrimary,
              outline: 'none',
              fontFamily: 'monospace',
              background: colors.surface,
            }}
          />
          <button
            onClick={handleSearch}
            disabled={!inputVal.trim()}
            style={{
              padding: '8px 18px',
              borderRadius: radius.md,
              border: 'none',
              background: inputVal.trim() ? colors.primary : colors.border,
              color: inputVal.trim() ? '#fff' : colors.textMuted,
              fontSize: '13px',
              fontWeight: 600,
              cursor: inputVal.trim() ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s',
              flexShrink: 0,
            }}
          >
            Search
          </button>
        </div>
        <span style={{ fontSize: '12px', color: colors.textMuted }}>
          Search by tracking number to view the full order lifecycle
        </span>
      </div>

      {/* Loading */}
      {isLoading && (
        <div style={{ textAlign: 'center', padding: '60px', color: colors.textSecondary }}>
          Loading timeline...
        </div>
      )}

      {/* 404 */}
      {is404 && (
        <div style={{
          textAlign: 'center', padding: '32px',
          background: '#fef2f2', border: '1px solid #fecaca',
          borderRadius: radius.lg, color: '#991b1b',
        }}>
          Order not found for tracking number <strong style={{ fontFamily: 'monospace' }}>{searchedTn}</strong>
        </div>
      )}

      {/* Other error */}
      {isError && !is404 && (
        <div style={{ textAlign: 'center', padding: '32px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: radius.lg, color: '#991b1b' }}>
          Failed to load order timeline. Please try again.
        </div>
      )}

      {/* Timeline */}
      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Order summary */}
          <div style={{
            background: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.xl,
            boxShadow: shadow.card,
            padding: '18px 20px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '16px',
            alignItems: 'center',
          }}>
            <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '16px', color: colors.textPrimary }}>
              {data.order.trackingNumber}
            </div>
            <div style={{
              padding: '3px 10px', borderRadius: '9999px', fontSize: '12px', fontWeight: 600,
              background: colors.primaryLight, color: colors.primary,
            }}>
              {data.order.status.replace(/_/g, ' ')}
            </div>
            <div style={{
              padding: '3px 10px', borderRadius: '9999px', fontSize: '12px', fontWeight: 700,
              background: D_BG[data.order.delayLevel], color: D_COLORS[data.order.delayLevel],
            }}>
              {D_LABELS[data.order.delayLevel]}
            </div>
            <div style={{ fontSize: '13px', color: colors.textSecondary }}>
              SLA started: <span style={{ color: colors.textPrimary, fontWeight: 600 }}>{formatManila(data.order.slaStartedAt)}</span>
            </div>
            {data.order.slaCompletedAt && (
              <div style={{ fontSize: '13px', color: colors.textSecondary }}>
                Completed in: <span style={{ color: colors.success, fontWeight: 700 }}>{durationLabel(data.order.totalDurationMs)}</span>
              </div>
            )}
          </div>

          {/* Events */}
          <SectionCard title={`Order Timeline — ${data.timeline.length} events`}>
            <div style={{ padding: '20px' }}>
              {data.timeline.length === 0 ? (
                <div style={{ textAlign: 'center', color: colors.textMuted, padding: '24px 0' }}>No events recorded.</div>
              ) : (
                <div>
                  {data.timeline.map((event, i) => (
                    <div key={i} style={{ display: 'flex', gap: '14px', marginBottom: i < data.timeline.length - 1 ? '0' : '0' }}>
                      {/* Dot + line */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                        <div style={{
                          width: '12px', height: '12px', borderRadius: '50%',
                          background: EVENT_COLORS[event.type] ?? colors.primary,
                          border: `2px solid ${colors.surface}`,
                          boxShadow: `0 0 0 2px ${EVENT_COLORS[event.type] ?? colors.primary}`,
                          marginTop: '4px',
                          flexShrink: 0,
                        }} />
                        {i < data.timeline.length - 1 && (
                          <div style={{ width: '2px', flex: 1, background: colors.border, minHeight: '28px', margin: '4px 0' }} />
                        )}
                      </div>

                      {/* Content */}
                      <div style={{ paddingBottom: i < data.timeline.length - 1 ? '20px' : '0', flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, fontSize: font.sm, color: colors.textPrimary }}>{event.label}</span>
                          <span style={{ fontSize: font.xs, color: colors.textSecondary }}>by {event.actor}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', marginTop: '3px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: font.xs, color: colors.textMuted }}>{formatManila(event.timestamp)}</span>
                          {event.durationFromPrevMs != null && (
                            <span style={{
                              fontSize: font.xs, fontWeight: 600,
                              color: colors.textSecondary,
                              background: colors.surfaceAlt,
                              border: `1px solid ${colors.border}`,
                              borderRadius: radius.sm,
                              padding: '1px 7px',
                            }}>
                              +{durationLabel(event.durationFromPrevMs)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Total duration footer */}
                  {data.order.totalDurationMs > 0 && (
                    <div style={{
                      marginTop: '16px', paddingTop: '16px', borderTop: `1px solid ${colors.border}`,
                      display: 'flex', justifyContent: 'flex-end',
                      fontSize: font.sm, color: colors.textSecondary,
                    }}>
                      Total time: <strong style={{ color: colors.textPrimary, marginLeft: '6px' }}>{durationLabel(data.order.totalDurationMs)}</strong>
                    </div>
                  )}
                </div>
              )}
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Reports() {
  const [days, setDays] = useState(30)
  // Optional deep link (v2.90.0, from Picker/Packer Admin): ?tab=performance|employee&role=&from=&to=&userId=
  // Read once for the initial state only — the page keeps its own state afterwards.
  const [sp] = useSearchParams()
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    const t = sp.get('tab')
    return t === 'performance' || t === 'employee' || t === 'live' || t === 'sla' || t === 'timeline' ? t : 'live'
  })

  // Live tab deep link (v2.93.0): ?tab=live&role=PACKER&date=YYYY-MM-DD (date = a past day to replay)
  const [liveRole] = useState<PerfRole | undefined>(() => {
    const r = sp.get('role')
    return r === 'PICKER' || r === 'PACKER' ? r : undefined
  })
  const [liveDate] = useState<string | undefined>(() => {
    const d = sp.get('date')
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d < getManilaDateString() ? d : undefined
  })

  // Shared by the Performance + Employee Report tabs so switching keeps the period.
  const [today] = useState(() => getManilaDateString())
  const [perfRange, setPerfRange] = useState<PerfRange>(() => {
    const from = sp.get('from')
    const to = sp.get('to')
    const re = /^\d{4}-\d{2}-\d{2}$/
    return from && to && re.test(from) && re.test(to) && from <= to
      ? { preset: 'custom', from, to }
      : presetRange('last30', getManilaDateString())
  })
  const [perfRole, setPerfRole] = useState<PerfRole>(() => (sp.get('role') === 'PACKER' ? 'PACKER' : 'PICKER'))
  const [employeeUserId, setEmployeeUserId] = useState<string | null>(() => sp.get('userId'))

  const openEmployee = useCallback((userId: string) => {
    setEmployeeUserId(userId)
    setActiveTab('employee')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: 'live', label: 'Live Performance' },
    { key: 'performance', label: 'Performance' },
    { key: 'employee', label: 'Employee Report' },
    { key: 'sla', label: 'SLA Analytics' },
    { key: 'timeline', label: 'Order Timeline' },
  ]

  return (
    <PageShell
      title="Warehouse Report"
      subtitle="Performance analytics, SLA tracking, and order lifecycle"
      icon={<ReportsIcon />}
      stats={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {activeTab === 'sla' && (
            <DayRangeToggle value={days} onChange={setDays} />
          )}
        </div>
      }
    >
      {/* Tab Bar */}
      <div style={{
        display: 'flex',
        gap: '2px',
        marginBottom: '24px',
        background: colors.surfaceAlt,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.lg,
        padding: '4px',
        width: 'fit-content',
        maxWidth: '100%',
        overflowX: 'auto',
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '7px 18px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: radius.md,
              border: 'none',
              background: activeTab === tab.key ? colors.surface : 'transparent',
              color: activeTab === tab.key ? colors.primary : colors.textSecondary,
              cursor: 'pointer',
              transition: 'all 0.15s',
              boxShadow: activeTab === tab.key ? shadow.card : 'none',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Performance Tab — target report (v2.84.0) */}
      {activeTab === 'performance' && (
        <TargetPerformanceTab
          role={perfRole}
          onRoleChange={setPerfRole}
          range={perfRange}
          onRangeChange={setPerfRange}
          today={today}
          onOpenEmployee={openEmployee}
        />
      )}

      {/* Employee Report Tab (v2.84.0) */}
      {activeTab === 'employee' && (
        <EmployeePerformanceTab
          role={perfRole}
          userId={employeeUserId}
          onUserChange={setEmployeeUserId}
          range={perfRange}
          onRangeChange={setPerfRange}
          today={today}
        />
      )}

      {/* SLA Analytics Tab */}
      {activeTab === 'sla' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <ExportPdfButton variant="sla" days={days} />
          </div>
          <SlaAnalyticsSection days={days} />
        </>
      )}

      {/* Live Performance Tab */}
      {activeTab === 'live' && <LivePerformanceTab onOpenEmployee={openEmployee} initialRole={liveRole} initialDate={liveDate} />}

      {/* Order Timeline Tab */}
      {activeTab === 'timeline' && <OrderTimelineSection />}
    </PageShell>
  )
}
