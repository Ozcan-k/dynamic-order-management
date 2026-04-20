import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { SalesStore } from '@dom/shared'
import PageShell from '../components/shared/PageShell'
import StoreSelector from '../components/sales/StoreSelector'
import ContentPostingSection from '../components/sales/ContentPostingSection'
import LiveSellingSection from '../components/sales/LiveSellingSection'
import MarketplaceSection from '../components/sales/MarketplaceSection'
import {
  fetchActivity,
  saveActivity,
  type ActivityResponse,
  type ContentPostState,
  type LiveSellingState,
  type MarketplaceState,
} from '../api/sales'
import { useAuthStore } from '../stores/authStore'

function PenIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  )
}

function todayManila(): string {
  // YYYY-MM-DD in Asia/Manila (UTC+8). Pure arithmetic — no Intl needed.
  const ms = Date.now() + 8 * 60 * 60 * 1000
  return new Date(ms).toISOString().slice(0, 10)
}

const SECTION_TITLES = {
  content: 'Content Posting',
  live: 'Live Selling',
  marketplace: 'Marketplace Reporting',
} as const

export default function SalesEntry() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const [date, setDate] = useState<string>(todayManila())
  const [store, setStore] = useState<SalesStore | null>(null)
  const [draft, setDraft] = useState<ActivityResponse | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [openSection, setOpenSection] = useState<keyof typeof SECTION_TITLES>('content')

  const enabled = !!store
  const queryKey = useMemo(() => ['sales-activity', date, store] as const, [date, store])

  const { data, isLoading, isFetching } = useQuery({
    queryKey,
    queryFn: () => fetchActivity(date, store as string),
    enabled,
    staleTime: 5_000,
  })

  // Sync server data into local draft whenever the day/store changes
  useEffect(() => {
    if (data) {
      setDraft(data)
      setSavedAt(null)
    }
  }, [data])

  const mutation = useMutation({
    mutationFn: saveActivity,
    onSuccess: () => {
      setSavedAt(new Date())
      queryClient.invalidateQueries({ queryKey: ['sales-calendar'] })
    },
  })

  // Debounced auto-save (1.5s after last change)
  const saveTimer = useRef<number | null>(null)
  useEffect(() => {
    if (!draft || !store) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      mutation.mutate(draft)
    }, 1500)
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  // Progress for the header chip — counts filled sections (3 in P2)
  const progress = useMemo(() => {
    if (!draft) return { done: 0, total: 3 }
    let done = 0
    if (draft.contentPosts.some((p) => p.completed)) done++
    if (draft.liveSelling.some((m) => m.hours > 0 || m.orders > 0 || m.followers > 0)) done++
    if (draft.marketplace.inquiries > 0 || draft.marketplace.listingsCreated > 0) done++
    return { done, total: 3 }
  }, [draft])

  function updateContentPosts(next: ContentPostState[]) {
    setDraft((d) => (d ? { ...d, contentPosts: next } : d))
  }
  function updateLive(next: LiveSellingState[]) {
    setDraft((d) => (d ? { ...d, liveSelling: next } : d))
  }
  function updateMarketplace(next: MarketplaceState) {
    setDraft((d) => (d ? { ...d, marketplace: next } : d))
  }

  const saveLabel = mutation.isPending
    ? 'Saving…'
    : savedAt
      ? `Saved ${formatRelative(savedAt)}`
      : isFetching
        ? 'Loading…'
        : 'Auto-save on'

  return (
    <PageShell
      icon={<PenIcon />}
      title="Daily Activity Entry"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
    >
      {/* Top controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '14px' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Report Date</span>
          <input
            type="date"
            value={date}
            max={todayManila()}
            onChange={(e) => setDate(e.target.value)}
            style={{
              fontSize: '13px',
              padding: '7px 10px',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              background: '#fff',
              outline: 'none',
            }}
          />
        </label>

        <div style={{
          marginLeft: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          color: '#64748b',
        }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 10px',
            background: progress.done === progress.total ? '#dcfce7' : '#f1f5f9',
            color: progress.done === progress.total ? '#166534' : '#475569',
            borderRadius: '9999px',
            fontWeight: 600,
            fontSize: '11px',
          }}>
            {progress.done}/{progress.total} sections
          </span>
          <span style={{
            padding: '5px 10px',
            background: mutation.isPending ? '#fef9c3' : '#eff6ff',
            color: mutation.isPending ? '#854d0e' : '#1d4ed8',
            borderRadius: '9999px',
            fontWeight: 600,
            fontSize: '11px',
          }}>
            {saveLabel}
          </span>
        </div>
      </div>

      {/* Store selector */}
      <div style={{ marginBottom: '14px' }}>
        <StoreSelector value={store} onChange={(s) => { setStore(s); setOpenSection('content') }} />
      </div>

      {!store && (
        <div style={{
          padding: '40px 20px',
          textAlign: 'center',
          background: '#fff',
          border: '1px dashed #cbd5e1',
          borderRadius: '12px',
          color: '#64748b',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🏬</div>
          <strong style={{ display: 'block', color: '#0f172a', marginBottom: '4px' }}>Select a store to begin</strong>
          <span style={{ fontSize: '13px' }}>Pick one of the stores above. You can switch any time — each store has its own daily report.</span>
        </div>
      )}

      {store && isLoading && !draft && (
        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading…</div>
      )}

      {store && draft && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <SectionCard
            title={SECTION_TITLES.content}
            badge="Required Daily"
            badgeTone="warn"
            open={openSection === 'content'}
            onToggle={() => setOpenSection(openSection === 'content' ? 'content' : 'content')}
            forceOpen={() => setOpenSection('content')}
            isOpenSection={openSection === 'content'}
          >
            <ContentPostingSection posts={draft.contentPosts} onChange={updateContentPosts} />
          </SectionCard>

          <SectionCard
            title={SECTION_TITLES.live}
            open={openSection === 'live'}
            onToggle={() => setOpenSection(openSection === 'live' ? 'live' : 'live')}
            forceOpen={() => setOpenSection('live')}
            isOpenSection={openSection === 'live'}
          >
            <LiveSellingSection metrics={draft.liveSelling} onChange={updateLive} />
          </SectionCard>

          <SectionCard
            title={SECTION_TITLES.marketplace}
            open={openSection === 'marketplace'}
            onToggle={() => setOpenSection(openSection === 'marketplace' ? 'marketplace' : 'marketplace')}
            forceOpen={() => setOpenSection('marketplace')}
            isOpenSection={openSection === 'marketplace'}
          >
            <MarketplaceSection value={draft.marketplace} onChange={updateMarketplace} />
          </SectionCard>

          <div style={{
            background: '#fff',
            border: '1px dashed #cbd5e1',
            borderRadius: '12px',
            padding: '14px',
            color: '#64748b',
            fontSize: '13px',
            textAlign: 'center',
          }}>
            <strong style={{ color: '#0f172a' }}>Direct Orders</strong> — coming in Phase 3.
          </div>
        </div>
      )}
    </PageShell>
  )
}

interface SectionCardProps {
  title: string
  badge?: string
  badgeTone?: 'warn' | 'info'
  children: React.ReactNode
  open: boolean
  onToggle: () => void
  forceOpen: () => void
  isOpenSection: boolean
}

function SectionCard({ title, badge, badgeTone, children, isOpenSection, forceOpen }: SectionCardProps) {
  return (
    <section style={{
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: '14px',
      boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
      overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={forceOpen}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          background: isOpenSection ? '#f8fafc' : '#fff',
          border: 'none',
          borderBottom: isOpenSection ? '1px solid #e2e8f0' : 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <strong style={{ fontSize: '14px', color: '#0f172a' }}>{title}</strong>
          {badge && (
            <span style={{
              fontSize: '10px',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '9999px',
              background: badgeTone === 'warn' ? '#fef9c3' : '#eff6ff',
              color: badgeTone === 'warn' ? '#854d0e' : '#1d4ed8',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}>
              {badge}
            </span>
          )}
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isOpenSection ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {isOpenSection && (
        <div style={{ padding: '16px', background: '#f8fafc' }}>
          {children}
        </div>
      )}
    </section>
  )
}

function formatRelative(d: Date): string {
  const diffSec = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000))
  if (diffSec < 5) return 'just now'
  if (diffSec < 60) return `${diffSec}s ago`
  const min = Math.round(diffSec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  return `${hr}h ago`
}
