// Workload model shared by Picker Admin and Packer Admin (v2.90.0).
// Merges the admin page's own stats (fresh every 10 s) with the live floor
// (state / target / pace, every 30 s + socket) into one view per worker.

import type { LiveRoleSnapshot, LiveState, LiveWorker, PerfRole } from '@dom/shared'

/** Minimal per-worker numbers every admin page already has. */
export interface BaseWorker {
  id: string
  username: string
  active: number          // open assignments (queued + in hand)
  completedToday: number
  returned?: number       // picker only
}

export type LoadFlag = 'HEAVY' | 'NEEDS_WORK' | null

export interface WorkerView extends BaseWorker {
  live: LiveWorker | null
  state: LiveState | null
  flag: LoadFlag
}

export type WorkloadFilter = 'ALL' | 'WORKING' | 'IDLE' | 'NOT_STARTED' | 'OFF'
export type WorkloadSort = 'attention' | 'load' | 'output' | 'name'

export const STATE_META: Record<LiveState, { label: string; color: string; bg: string; order: number }> = {
  IDLE: { label: 'Idle', color: '#b45309', bg: '#fef3c7', order: 0 },
  NOT_STARTED: { label: 'Not started', color: '#b91c1c', bg: '#fee2e2', order: 1 },
  WORKING: { label: 'Working', color: '#15803d', bg: '#dcfce7', order: 2 },
  DONE: { label: 'Shift done', color: '#475569', bg: '#f1f5f9', order: 3 },
  OFF: { label: 'Off', color: '#64748b', bg: '#f8fafc', order: 4 },
  NO_ACTIVITY: { label: 'No activity', color: '#64748b', bg: '#f8fafc', order: 5 },
}

export const ROLE_TEXT: Record<PerfRole, { one: string; many: string; verb: string; accent: string; accentSoft: string }> = {
  PICKER: { one: 'Picker', many: 'Pickers', verb: 'picked', accent: '#2563eb', accentSoft: '#eff6ff' },
  PACKER: { one: 'Packer', many: 'Packers', verb: 'packed', accent: '#0e7490', accentSoft: '#ecfeff' },
}

/** Who can take work right now — present and not finished for the day. */
const isOnFloor = (s: LiveState | null) => s === 'WORKING' || s === 'IDLE' || s === 'NOT_STARTED'

export function mergeWorkers(base: BaseWorker[], live: LiveRoleSnapshot | undefined): WorkerView[] {
  const byId = new Map((live?.board.workers ?? []).map((w) => [w.userId, w]))
  const views: WorkerView[] = base.map((b) => {
    const lw = byId.get(b.id) ?? null
    return { ...b, live: lw, state: lw?.state ?? null, flag: null }
  })

  // Load flags only among people on the floor: a heavy queue is judged against the
  // team median, and "needs work" means working/idle with (almost) nothing assigned.
  const onFloor = views.filter((v) => isOnFloor(v.state))
  if (onFloor.length >= 2) {
    const loads = onFloor.map((v) => v.active).sort((a, b) => a - b)
    const median = loads[Math.floor(loads.length / 2)]
    for (const v of onFloor) {
      if (v.active >= 8 && v.active >= median * 1.5) v.flag = 'HEAVY'
      else if (v.active <= 1 && v.state !== 'NOT_STARTED') v.flag = 'NEEDS_WORK'
    }
  }
  return views
}

export function filterWorkers(list: WorkerView[], filter: WorkloadFilter): WorkerView[] {
  if (filter === 'ALL') return list
  if (filter === 'OFF') return list.filter((v) => v.state === 'OFF' || v.state === 'NO_ACTIVITY' || v.state === 'DONE')
  return list.filter((v) => v.state === filter)
}

export function sortWorkers(list: WorkerView[], sort: WorkloadSort): WorkerView[] {
  const arr = [...list]
  const name = (a: WorkerView, b: WorkerView) => a.username.localeCompare(b.username)
  const stateOrder = (v: WorkerView) => (v.state ? STATE_META[v.state].order : 9)
  if (sort === 'name') return arr.sort(name)
  if (sort === 'output') return arr.sort((a, b) => b.completedToday - a.completedToday || name(a, b))
  if (sort === 'load') {
    // Assignment view: people actually working (or idle) first, lightest load on top;
    // then scheduled-but-not-started, then everyone who is off or done for the day.
    const tier = (v: WorkerView) => (v.state === 'WORKING' || v.state === 'IDLE' ? 0 : v.state === 'NOT_STARTED' ? 1 : 2)
    return arr.sort((a, b) => tier(a) - tier(b) || a.active - b.active || name(a, b))
  }
  // attention: idle / not started / heavy queue / behind target first
  const score = (v: WorkerView) =>
    (v.flag === 'HEAVY' ? 0 : 10) + stateOrder(v) + (v.live?.outcome === 'BELOW' && isOnFloor(v.state) ? -0.5 : 0)
  return arr.sort((a, b) => score(a) - score(b) || b.active - a.active || name(a, b))
}

export interface PulseSummary {
  counts: Record<WorkloadFilter, number>
  completed: number
  target: number
  projected: number
  pacePerHour: number
  lastHour: number
  queued: number
  inHand: number
  heaviest: WorkerView | null
  available: WorkerView[]
}

export function summarize(views: WorkerView[], live: LiveRoleSnapshot | undefined): PulseSummary {
  const t = live?.board.totals
  const counts: Record<WorkloadFilter, number> = {
    ALL: views.length,
    WORKING: views.filter((v) => v.state === 'WORKING').length,
    IDLE: views.filter((v) => v.state === 'IDLE').length,
    NOT_STARTED: views.filter((v) => v.state === 'NOT_STARTED').length,
    OFF: views.filter((v) => v.state === 'OFF' || v.state === 'NO_ACTIVITY' || v.state === 'DONE').length,
  }
  const heavy = views.filter((v) => v.flag === 'HEAVY').sort((a, b) => b.active - a.active)
  // Where to move work: people who are working with the lightest load — at most half of the
  // heaviest queue (so the suggestion is meaningful), or anyone flagged as needing work.
  const heaviest = heavy[0] ?? null
  const available = views
    .filter((v) => v.id !== heaviest?.id && (v.flag === 'NEEDS_WORK' || (heaviest !== null && v.state === 'WORKING' && v.active <= heaviest.active / 2)))
    .sort((a, b) => a.active - b.active || a.username.localeCompare(b.username))
  return {
    counts,
    completed: views.reduce((s, v) => s + v.completedToday, 0),
    target: t?.target ?? 0,
    projected: t?.projected ?? 0,
    pacePerHour: t?.pacePerHour ?? 0,
    lastHour: t?.lastHour ?? 0,
    queued: t?.queued ?? 0,
    inHand: t?.inHand ?? 0,
    heaviest,
    available,
  }
}

export function minutesLabel(min: number | null): string {
  if (min === null) return ''
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  return `${h}h ${min % 60}m ago`
}
