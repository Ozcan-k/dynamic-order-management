// ════════════════════════════════════════════════════════════════════════════
// TARGET PERFORMANCE (v2.84.0) — shared types for the Warehouse Report
// picker / packer target report and the per-employee report.
//
// Output = completed Picker/Packer assignments per Manila day. A day's target
// is scaled by the employee's schedule (Employee Schedule module) when the
// system user is linked to an employee record:
//   Present → full target · Half Day → half target · Day Off / leave / Absent →
//   excluded. Without a schedule entry, any positive output counts as a full
//   working day (same rule as the original Excel report).
// ════════════════════════════════════════════════════════════════════════════

import type { AttendanceStatus } from './employeeSchedule'

export type PerfRole = 'PICKER' | 'PACKER'

/** Daily output target per role (orders completed per working day). */
export const PERF_DAILY_TARGET: Record<PerfRole, number> = {
  PICKER: 210,
  PACKER: 280,
}

/** Achievement ≥ this ratio (but < 1) is "Near Target". */
export const PERF_NEAR_TARGET_RATIO = 0.9

/** Longest selectable report window, in days. */
export const PERF_MAX_RANGE_DAYS = 92

export type PerfStatus = 'TARGET_ACHIEVED' | 'NEAR_TARGET' | 'BELOW_TARGET' | 'NO_ACTIVITY'

export const PERF_STATUS_LABEL: Record<PerfStatus, string> = {
  TARGET_ACHIEVED: 'Target Achieved',
  NEAR_TARGET: 'Near Target',
  BELOW_TARGET: 'Below Target',
  NO_ACTIVITY: 'No Activity',
}

/** Outcome of a single day for one worker. */
export type PerfDayOutcome = 'MET' | 'NEAR' | 'BELOW' | 'OFF' | 'IN_PROGRESS'

export interface PerfDay {
  date: string // YYYY-MM-DD (Manila)
  output: number
  /** Employee Schedule entry for that day (null = no entry / not linked). */
  attendance: AttendanceStatus | null
  /** Share of the daily target expected that day: 0, 0.5 or 1. */
  factor: number
  /** factor × daily target. */
  target: number
  outcome: PerfDayOutcome
  /** Today is still running — shown, but excluded from every total and rate. */
  inProgress: boolean
  /** Data-quality hint for the reviewer. */
  flag: 'NO_SCHEDULE' | 'WORKED_ON_LEAVE' | null
}

export interface PerfWorkerRow {
  userId: string
  username: string
  /** Employee full name when linked, otherwise the username. */
  displayName: string
  empNo: number | null
  linked: boolean
  totalOutput: number
  /** Sum of day factors (Half Day = 0.5). */
  activeDays: number
  targetOutput: number
  avgPerActiveDay: number
  /** totalOutput / targetOutput (ratio, 1 = 100%). */
  achievement: number
  daysMetTarget: number
  /** Number of days that carried a target (factor > 0). */
  targetDays: number
  /** daysMetTarget / targetDays (ratio). */
  hitRate: number
  bestDay: number
  bestDayDate: string | null
  status: PerfStatus
  /** 1-based rank by avg / active day; null when there was no activity. */
  rank: number | null
  days: PerfDay[]
}

export interface PerfTeamDaily {
  date: string
  output: number
  /** Workers expected that day (sum of factors). */
  activeWorkers: number
  avgPerActiveWorker: number
  inProgress: boolean
}

export interface PerfTeamSummary {
  workers: number
  totalOutput: number
  activeDays: number
  targetOutput: number
  teamAvgPerActiveDay: number
  achievement: number
  daysMetTarget: number
  targetDays: number
  hitRate: number
}

export interface PerfTeamReport {
  role: PerfRole
  dailyTarget: number
  from: string
  to: string
  today: string
  dates: string[]
  summary: PerfTeamSummary
  daily: PerfTeamDaily[]
  rows: PerfWorkerRow[]
  /** Workers without a linked Employee Schedule record. */
  unlinkedCount: number
}

export interface PerfEmployeeReport {
  role: PerfRole
  dailyTarget: number
  from: string
  to: string
  today: string
  worker: PerfWorkerRow
  teamSize: number
  teamAvgPerActiveDay: number
  teamDaily: PerfTeamDaily[]
  /** Output per Manila hour of day (0–23) across the period. */
  hourly: number[]
  /** Average output per active day by weekday (0 = Sunday). */
  weekday: { weekday: number; output: number; activeDays: number; avg: number }[]
  outcomes: { met: number; near: number; below: number; off: number }
}

// ─── Live floor (v2.85.0) ────────────────────────────────────────────────────

/** Minutes without a completion before a worker who is mid-shift counts as idle. */
export const LIVE_IDLE_MINUTES = 20

/** Default shift length (hours) when a worker has no schedule entry. Present = 8h + OT, Half Day = 4h. */
export const LIVE_DEFAULT_SHIFT_HOURS = 8

/**
 * WORKING     — completed something in the last LIVE_IDLE_MINUTES, or has work in hand
 * IDLE        — started today, no completion for LIVE_IDLE_MINUTES+, shift not over
 * NOT_STARTED — scheduled Present / Half Day but nothing completed yet
 * DONE        — shift length elapsed since first completion (or any worker on a past day)
 * OFF         — scheduled Day Off / leave / Absent and no output
 * NO_ACTIVITY — no schedule entry and no output (e.g. not rostered today)
 */
export type LiveState = 'WORKING' | 'IDLE' | 'NOT_STARTED' | 'DONE' | 'OFF' | 'NO_ACTIVITY'

export interface LiveWorker {
  userId: string
  username: string
  displayName: string
  empNo: number | null
  linked: boolean
  attendance: AttendanceStatus | null
  /** Share of the daily target expected today: 0, 0.5 or 1. */
  factor: number
  target: number
  /** Expected shift length in hours (8 + OT, 4 for Half Day, 8 when unscheduled). */
  shiftHours: number
  completed: number
  /** Open assignments right now: queued (…_ASSIGNED) + in hand (PICKING / PACKING). Live only. */
  queued: number
  inHand: number
  lastHour: number
  hourly: number[]
  firstAt: string | null
  lastAt: string | null
  /** Completions per hour since the first completion (min. 1h window). */
  pacePerHour: number
  /** Live: completed + pace × remaining shift hours. Past day: completed. */
  projected: number
  /** completed / target (0 when no target). */
  progress: number
  /** Result vs target — on projection while live, on actual output for a past day. */
  outcome: PerfDayOutcome
  state: LiveState
  /** Minutes since the last completion (live only). */
  minutesSinceLast: number | null
}

export interface LiveRoleTotals {
  completed: number
  target: number
  projected: number
  queued: number
  inHand: number
  lastHour: number
  /** Team completions per hour since the first completion of the day. */
  pacePerHour: number
  working: number
  idle: number
  notStarted: number
  done: number
  off: number
  noActivity: number
  /** Expected workers (factor > 0) projected to meet / nearly meet / miss the target. */
  onTrack: number
  near: number
  behind: number
}

export interface LiveRoleBoard {
  role: PerfRole
  dailyTarget: number
  totals: LiveRoleTotals
  hourly: number[]
  workers: LiveWorker[]
}

export interface LiveBoard {
  date: string
  isLive: boolean
  generatedAt: string
  /** Manila hour 0–23 (live only). */
  currentHour: number | null
  roles: Record<PerfRole, LiveRoleBoard>
}

/** Active picker/packer users that can be picked in the employee report or linked to an employee. */
export interface PerfWorkerOption {
  userId: string
  username: string
  role: PerfRole
  displayName: string
  linkedEmployeeId: string | null
}
