import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { SalesStore } from '@dom/shared'
import PageShell from '../components/shared/PageShell'
import StoreSelector from '../components/sales/StoreSelector'
import ContentPostingSection from '../components/sales/ContentPostingSection'
import LiveSellingSection from '../components/sales/LiveSellingSection'
import MarketplaceSection from '../components/sales/MarketplaceSection'
import DirectOrderSection from '../components/sales/DirectOrderSection'
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
  direct: 'Direct Orders',
  marketplace: 'Marketplace Reporting',
} as const

export default function SalesEntry() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const [searchParams, setSearchParams] = useSearchParams()
  const initialDate = searchParams.get('date') ?? todayManila()
  const [date, setDate] = useState<string>(initialDate)
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

  // Sync server data into local draft whenever the day/store changes.
  // Validate shape — proxy/server misconfig can return non-JSON which axios
  // forwards as `data` (e.g. an HTML SPA fallback). Guard prevents a crash.
  useEffect(() => {
    if (data && Array.isArray(data.contentPosts) && Array.isArray(data.liveSelling) && data.marketplace) {
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
      {/* Top controls — Phase F: report-date picker + progress + save-state chips */}
      <div className="sales-entry-toolbar">
        <label className="filter-field">
          <span className="filter-field-label">Report Date</span>
          <input
            type="date"
            value={date}
            max={todayManila()}
            onChange={(e) => {
              setDate(e.target.value)
              const next = new URLSearchParams(searchParams)
              next.set('date', e.target.value)
              setSearchParams(next, { replace: true })
            }}
            className="filter-field-input"
          />
        </label>

        <div className="sales-entry-status">
          <span className={`sales-entry-progress${progress.done === progress.total ? ' sales-entry-progress--done' : ''}`}>
            {progress.done}/{progress.total} sections
          </span>
          <span className={`sales-entry-save${mutation.isPending ? ' sales-entry-save--saving' : ''}`}>
            {saveLabel}
          </span>
        </div>
      </div>

      {/* Store selector */}
      <div style={{ marginBottom: '14px' }}>
        <StoreSelector value={store} onChange={(s) => { setStore(s); setOpenSection('content') }} />
      </div>

      {!store && (
        <div className="empty-state">
          <div className="empty-state-icon">🏬</div>
          <div className="empty-state-title">Select a store to begin</div>
          <div className="empty-state-desc">Pick one of the stores above. You can switch any time — each store has its own daily report.</div>
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
            title={SECTION_TITLES.direct}
            badge="Optional"
            badgeTone="info"
            open={openSection === 'direct'}
            onToggle={() => setOpenSection(openSection === 'direct' ? 'direct' : 'direct')}
            forceOpen={() => setOpenSection('direct')}
            isOpenSection={openSection === 'direct'}
          >
            <DirectOrderSection date={date} store={store} />
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
    <section className="section-card">
      <button
        type="button"
        onClick={forceOpen}
        className={`section-card-header${isOpenSection ? ' section-card-header--open' : ''}`}
      >
        <span className="section-card-header-title">
          <strong>{title}</strong>
          {badge && (
            <span className={`section-card-badge section-card-badge--${badgeTone ?? 'info'}`}>
              {badge}
            </span>
          )}
        </span>
        <svg
          width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`section-card-chevron${isOpenSection ? ' section-card-chevron--open' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {isOpenSection && (
        <div className="section-card-body">
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
