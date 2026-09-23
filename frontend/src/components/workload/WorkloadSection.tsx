import { useMemo } from 'react'
import type { PerfRole } from '@dom/shared'
import SectionHeader from '../shared/SectionHeader'
import { filterWorkers, ROLE_TEXT, sortWorkers, type PulseSummary, type WorkerView, type WorkloadFilter, type WorkloadSort } from './model'
import WorkerCard from './WorkerCard'

const FILTERS: { id: WorkloadFilter; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'WORKING', label: 'Working' },
  { id: 'IDLE', label: 'Idle' },
  { id: 'NOT_STARTED', label: 'Not started' },
  { id: 'OFF', label: 'Off / done' },
]

const SORTS: { id: WorkloadSort; label: string; hint: string }[] = [
  { id: 'attention', label: 'Needs attention', hint: 'Heavy queue, idle and not-started first' },
  { id: 'load', label: 'Least loaded', hint: 'Who can take work — fewest open orders first' },
  { id: 'output', label: 'Most done', hint: 'Highest output today first' },
  { id: 'name', label: 'Name', hint: 'Alphabetical' },
]

interface Props {
  role: PerfRole
  workers: WorkerView[]
  summary: PulseSummary | null     // null = live data unavailable (read-only viewer / loading error)
  currentHour: number | null
  filter: WorkloadFilter
  sort: WorkloadSort
  onFilter: (f: WorkloadFilter) => void
  onSort: (s: WorkloadSort) => void
  onOpen: (w: WorkerView) => void
  onPrefetch?: (w: WorkerView) => void
  emptyHint: string
}

export default function WorkloadSection({ role, workers, summary, currentHour, filter, sort, onFilter, onSort, onOpen, onPrefetch, emptyHint }: Props) {
  const hasLive = summary !== null
  const shown = useMemo(
    () => sortWorkers(hasLive ? filterWorkers(workers, filter) : workers, hasLive ? sort : 'name'),
    [workers, filter, sort, hasLive],
  )

  return (
    <div id="workload-section" className="wl-section" style={{ '--wl-accent': ROLE_TEXT[role].accent, '--wl-soft': ROLE_TEXT[role].accentSoft } as React.CSSProperties}>
      <SectionHeader title={`${ROLE_TEXT[role].one} Workload`} count={workers.length} />

      {hasLive && workers.length > 0 && (
        <div className="wl-toolbar">
          <div className="wl-seg" role="group" aria-label="Filter by status">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => onFilter(f.id)}>
                {f.label}
                <b>{summary!.counts[f.id]}</b>
              </button>
            ))}
          </div>
          <label className="wl-sort">
            <span>Sort</span>
            <select value={sort} onChange={(e) => onSort(e.target.value as WorkloadSort)}>
              {SORTS.map((s) => <option key={s.id} value={s.id} title={s.hint}>{s.label}</option>)}
            </select>
          </label>
        </div>
      )}

      {workers.length === 0 ? (
        <div className="empty-state" style={{ marginTop: '12px' }}>
          <p className="empty-state-title">No {ROLE_TEXT[role].many.toLowerCase()} found</p>
          <p className="empty-state-desc">{emptyHint}</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="wl-empty">
          Nobody is {FILTERS.find((f) => f.id === filter)?.label.toLowerCase()} right now.
          <button type="button" onClick={() => onFilter('ALL')}>Show all</button>
        </div>
      ) : (
        <div className="wl-grid">
          {shown.map((w) => (
            <WorkerCard
              key={w.id}
              role={role}
              worker={w}
              currentHour={currentHour}
              onOpen={() => onOpen(w)}
              onPrefetch={onPrefetch ? () => onPrefetch(w) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}
