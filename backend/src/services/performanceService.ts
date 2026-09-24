import {
  UserRole,
  OrderStatus,
  AttendanceStatus,
  PERF_DAILY_TARGET,
  PERF_NEAR_TARGET_RATIO,
  PERF_MAX_RANGE_DAYS,
  LIVE_IDLE_MINUTES,
  LIVE_DEFAULT_SHIFT_HOURS,
  cellDayFactor,
  type LiveBoard,
  type LiveRoleBoard,
  type LiveRoleSnapshot,
  type LiveRoleTotals,
  type LiveState,
  type LiveWorker,
  type PerfRole,
  type PerfDay,
  type PerfDayOutcome,
  type PerfStatus,
  type PerfWorkerRow,
  type PerfTeamDaily,
  type PerfTeamReport,
  type PerfEmployeeReport,
  type PerfWorkerOption,
} from '@dom/shared'
import { prisma } from '../lib/prisma'
import { getManilaDateString, getManilaStartOf } from '../lib/manila'

// ════════════════════════════════════════════════════════════════════════════
// Target performance (v2.84.0) — Warehouse Report picker/packer target report
// + per-employee report. Read-only: never writes, never touches the order
// pipeline. Output = completed Picker/Packer assignments per Manila day.
// ════════════════════════════════════════════════════════════════════════════

export class PerfRangeError extends Error {}
export class PerfWorkerNotFoundError extends Error {}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function dateList(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

/** UTC instant → naive 'YYYY-MM-DD HH:MM:SS.mmm' matching the UTC wall-clock stored in timestamp(3) columns. */
function naiveUtc(d: Date): string {
  return d.toISOString().replace('T', ' ').replace('Z', '')
}

/** Validate/default a report window. Default = last 30 days ending today (Manila). */
export function resolveRange(fromInput?: string, toInput?: string): { from: string; to: string; today: string } {
  const today = getManilaDateString()
  if (fromInput && !DATE_RE.test(fromInput)) throw new PerfRangeError('Invalid "from" date (expected YYYY-MM-DD)')
  if (toInput && !DATE_RE.test(toInput)) throw new PerfRangeError('Invalid "to" date (expected YYYY-MM-DD)')
  const to = toInput || today
  const from = fromInput || addDays(to, -29)
  if (from > to) throw new PerfRangeError('"from" must be on or before "to"')
  if (to > today) throw new PerfRangeError('Future dates are not allowed')
  if (dateList(from, to).length > PERF_MAX_RANGE_DAYS) {
    throw new PerfRangeError(`Date range is too long (max ${PERF_MAX_RANGE_DAYS} days)`)
  }
  return { from, to, today }
}

// ─── data loading ───────────────────────────────────────────────────────────

interface WorkerSource {
  userId: string
  username: string
  employee: { id: string; empNo: number; firstName: string; lastName: string } | null
}

/**
 * Active picker/packer users of the role. A user whose linked Employee Schedule
 * record is inactive (left the company) is excluded as well.
 */
async function loadWorkers(tenantId: string, role: PerfRole): Promise<WorkerSource[]> {
  const users = await prisma.user.findMany({
    where: { tenantId, role: role === 'PICKER' ? UserRole.PICKER : UserRole.PACKER, isActive: true },
    select: {
      id: true,
      username: true,
      employee: { select: { id: true, empNo: true, firstName: true, lastName: true, isActive: true } },
    },
    orderBy: { username: 'asc' },
  })
  return users
    .filter((u) => !u.employee || u.employee.isActive)
    .map((u) => ({
      userId: u.id,
      username: u.username,
      employee: u.employee
        ? { id: u.employee.id, empNo: u.employee.empNo, firstName: u.employee.firstName, lastName: u.employee.lastName }
        : null,
    }))
}

/** userId → (Manila date → completed count). Aggregated in the DB (Manila = UTC+8, no DST). */
async function loadDailyCounts(role: PerfRole, userIds: string[], from: string, to: string): Promise<Map<string, Map<string, number>>> {
  const result = new Map<string, Map<string, number>>()
  if (userIds.length === 0) return result
  const start = naiveUtc(getManilaStartOf(from))
  const end = naiveUtc(new Date(getManilaStartOf(to).getTime() + DAY_MS))

  type Row = { userId: string; day: string; n: number }
  const rows = role === 'PICKER'
    ? await prisma.$queryRaw<Row[]>`
        SELECT picker_id AS "userId",
               to_char((completed_at + interval '8 hours')::date, 'YYYY-MM-DD') AS day,
               COUNT(*)::int AS n
        FROM picker_assignments
        WHERE picker_id = ANY(${userIds}::text[])
          AND completed_at >= ${start}::timestamp
          AND completed_at < ${end}::timestamp
        GROUP BY 1, 2`
    : await prisma.$queryRaw<Row[]>`
        SELECT packer_id AS "userId",
               to_char((completed_at + interval '8 hours')::date, 'YYYY-MM-DD') AS day,
               COUNT(*)::int AS n
        FROM packer_assignments
        WHERE packer_id = ANY(${userIds}::text[])
          AND completed_at >= ${start}::timestamp
          AND completed_at < ${end}::timestamp
        GROUP BY 1, 2`

  for (const r of rows) {
    if (!result.has(r.userId)) result.set(r.userId, new Map())
    result.get(r.userId)!.set(r.day, Number(r.n))
  }
  return result
}

/** One worker's output per Manila hour of day (0–23) over the window. */
async function loadHourly(role: PerfRole, userId: string, from: string, to: string): Promise<number[]> {
  const start = naiveUtc(getManilaStartOf(from))
  const end = naiveUtc(new Date(getManilaStartOf(to).getTime() + DAY_MS))
  type Row = { h: number; n: number }
  const rows = role === 'PICKER'
    ? await prisma.$queryRaw<Row[]>`
        SELECT EXTRACT(HOUR FROM completed_at + interval '8 hours')::int AS h, COUNT(*)::int AS n
        FROM picker_assignments
        WHERE picker_id = ${userId} AND completed_at >= ${start}::timestamp AND completed_at < ${end}::timestamp
        GROUP BY 1`
    : await prisma.$queryRaw<Row[]>`
        SELECT EXTRACT(HOUR FROM completed_at + interval '8 hours')::int AS h, COUNT(*)::int AS n
        FROM packer_assignments
        WHERE packer_id = ${userId} AND completed_at >= ${start}::timestamp AND completed_at < ${end}::timestamp
        GROUP BY 1`
  const hourly = new Array(24).fill(0)
  for (const r of rows) hourly[Number(r.h) % 24] = Number(r.n)
  return hourly
}

interface SchedDay { status: AttendanceStatus; workedHours: number | null }

/** employeeId → (date → attendance status + Partial Day hours). */
async function loadSchedule(tenantId: string, employeeIds: string[], from: string, to: string): Promise<Map<string, Map<string, SchedDay>>> {
  const result = new Map<string, Map<string, SchedDay>>()
  if (employeeIds.length === 0) return result
  const entries = await prisma.empSchedule.findMany({
    where: {
      tenantId,
      employeeId: { in: employeeIds },
      date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) },
    },
    select: { employeeId: true, date: true, status: true, workedHours: true },
  })
  for (const e of entries) {
    if (!result.has(e.employeeId)) result.set(e.employeeId, new Map())
    result.get(e.employeeId)!.set(e.date.toISOString().slice(0, 10), { status: e.status as AttendanceStatus, workedHours: e.workedHours })
  }
  return result
}

// ─── computation ────────────────────────────────────────────────────────────

function statusOf(activeDays: number, achievement: number): PerfStatus {
  if (activeDays === 0) return 'NO_ACTIVITY'
  if (achievement >= 1) return 'TARGET_ACHIEVED'
  if (achievement >= PERF_NEAR_TARGET_RATIO) return 'NEAR_TARGET'
  return 'BELOW_TARGET'
}

function buildDay(date: string, output: number, attendance: AttendanceStatus | null, linked: boolean, dailyTarget: number, today: string, workedHours: number | null = null): PerfDay {
  let factor = 0
  let flag: PerfDay['flag'] = null
  if (attendance === AttendanceStatus.PRESENT) factor = 1
  else if (attendance === AttendanceStatus.HALF_DAY) factor = 0.5
  // v2.93.0: target scales with the hours actually scheduled (3 h → 3/8 of the day)
  else if (attendance === AttendanceStatus.PARTIAL_DAY) factor = cellDayFactor(attendance, workedHours)
  else if (attendance) {
    // Scheduled off / leave / absent: excluded — unless they actually produced output.
    if (output > 0) { factor = 1; flag = 'WORKED_ON_LEAVE' }
  } else if (output > 0) {
    // No schedule entry: any positive output is a working day (original Excel rule).
    factor = 1
    if (linked) flag = 'NO_SCHEDULE'
  }
  const target = factor * dailyTarget
  const inProgress = date === today
  let outcome: PerfDayOutcome
  if (inProgress) outcome = 'IN_PROGRESS'
  else if (factor === 0) outcome = 'OFF'
  else if (output >= target) outcome = 'MET'
  else if (output >= target * PERF_NEAR_TARGET_RATIO) outcome = 'NEAR'
  else outcome = 'BELOW'
  return { date, output, attendance, factor, target, outcome, inProgress, flag }
}

function buildRow(w: WorkerSource, days: PerfDay[]): PerfWorkerRow {
  let totalOutput = 0, activeDays = 0, targetOutput = 0, daysMetTarget = 0, targetDays = 0
  let bestDay = 0
  let bestDayDate: string | null = null
  for (const d of days) {
    if (d.inProgress) continue
    totalOutput += d.output
    activeDays += d.factor
    targetOutput += d.target
    if (d.factor > 0) targetDays++
    if (d.outcome === 'MET') daysMetTarget++
    if (d.output > bestDay) { bestDay = d.output; bestDayDate = d.date }
  }
  const achievement = targetOutput > 0 ? totalOutput / targetOutput : 0
  return {
    userId: w.userId,
    username: w.username,
    displayName: w.employee ? `${w.employee.firstName} ${w.employee.lastName}`.trim() : w.username,
    empNo: w.employee?.empNo ?? null,
    linked: !!w.employee,
    totalOutput,
    activeDays,
    targetOutput,
    avgPerActiveDay: activeDays > 0 ? totalOutput / activeDays : 0,
    achievement,
    daysMetTarget,
    targetDays,
    hitRate: targetDays > 0 ? daysMetTarget / targetDays : 0,
    bestDay,
    bestDayDate,
    status: statusOf(activeDays, achievement),
    rank: null,
    days,
  }
}

/** Rank by avg / active day (desc); workers with no activity go last, unranked. */
function rankRows(rows: PerfWorkerRow[]): PerfWorkerRow[] {
  const sorted = [...rows].sort((a, b) => {
    const aActive = a.activeDays > 0 ? 1 : 0
    const bActive = b.activeDays > 0 ? 1 : 0
    if (aActive !== bActive) return bActive - aActive
    return b.avgPerActiveDay - a.avgPerActiveDay
      || b.totalOutput - a.totalOutput
      || a.displayName.localeCompare(b.displayName)
  })
  let rank = 0
  for (const r of sorted) r.rank = r.activeDays > 0 ? ++rank : null
  return sorted
}

function teamDaily(rows: PerfWorkerRow[], dates: string[], today: string): PerfTeamDaily[] {
  return dates.map((date, i) => {
    let output = 0, activeWorkers = 0
    for (const r of rows) {
      const d = r.days[i]
      output += d.output
      activeWorkers += d.factor
    }
    return {
      date,
      output,
      activeWorkers,
      avgPerActiveWorker: activeWorkers > 0 ? output / activeWorkers : 0,
      inProgress: date === today,
    }
  })
}

// ─── public API ─────────────────────────────────────────────────────────────

export async function getTeamPerformance(tenantId: string, role: PerfRole, fromInput?: string, toInput?: string): Promise<PerfTeamReport> {
  const { from, to, today } = resolveRange(fromInput, toInput)
  const dailyTarget = PERF_DAILY_TARGET[role]
  const dates = dateList(from, to)

  const workers = await loadWorkers(tenantId, role)
  const employeeIds = workers.flatMap((w) => (w.employee ? [w.employee.id] : []))
  const [counts, schedule] = await Promise.all([
    loadDailyCounts(role, workers.map((w) => w.userId), from, to),
    loadSchedule(tenantId, employeeIds, from, to),
  ])

  const rows = rankRows(workers.map((w) => {
    const userCounts = counts.get(w.userId)
    const empSchedule = w.employee ? schedule.get(w.employee.id) : undefined
    const days = dates.map((date) =>
      buildDay(date, userCounts?.get(date) ?? 0, empSchedule?.get(date)?.status ?? null, !!w.employee, dailyTarget, today, empSchedule?.get(date)?.workedHours ?? null))
    return buildRow(w, days)
  }))

  const summary = rows.reduce(
    (acc, r) => {
      acc.totalOutput += r.totalOutput
      acc.activeDays += r.activeDays
      acc.targetOutput += r.targetOutput
      acc.daysMetTarget += r.daysMetTarget
      acc.targetDays += r.targetDays
      return acc
    },
    { workers: rows.length, totalOutput: 0, activeDays: 0, targetOutput: 0, teamAvgPerActiveDay: 0, achievement: 0, daysMetTarget: 0, targetDays: 0, hitRate: 0 },
  )
  summary.teamAvgPerActiveDay = summary.activeDays > 0 ? summary.totalOutput / summary.activeDays : 0
  summary.achievement = summary.targetOutput > 0 ? summary.totalOutput / summary.targetOutput : 0
  summary.hitRate = summary.targetDays > 0 ? summary.daysMetTarget / summary.targetDays : 0

  return {
    role,
    dailyTarget,
    from,
    to,
    today,
    dates,
    summary,
    daily: teamDaily(rows, dates, today),
    rows,
    unlinkedCount: rows.filter((r) => !r.linked).length,
  }
}

export async function getEmployeePerformance(tenantId: string, userId: string, fromInput?: string, toInput?: string): Promise<PerfEmployeeReport> {
  const range = resolveRange(fromInput, toInput)
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId, isActive: true, role: { in: [UserRole.PICKER, UserRole.PACKER] } },
    select: { role: true },
  })
  if (!user) throw new PerfWorkerNotFoundError()
  const role: PerfRole = user.role === UserRole.PICKER ? 'PICKER' : 'PACKER'

  const team = await getTeamPerformance(tenantId, role, range.from, range.to)
  const worker = team.rows.find((r) => r.userId === userId)
  if (!worker) throw new PerfWorkerNotFoundError() // e.g. linked employee is inactive

  const hourly = await loadHourly(role, userId, range.from, range.to)

  const weekdayAgg = Array.from({ length: 7 }, (_, weekday) => ({ weekday, output: 0, activeDays: 0, avg: 0 }))
  const outcomes = { met: 0, near: 0, below: 0, off: 0 }
  for (const d of worker.days) {
    if (d.inProgress) continue
    if (d.outcome === 'MET') outcomes.met++
    else if (d.outcome === 'NEAR') outcomes.near++
    else if (d.outcome === 'BELOW') outcomes.below++
    else outcomes.off++
    if (d.factor > 0) {
      const w = weekdayAgg[new Date(`${d.date}T00:00:00.000Z`).getUTCDay()]
      w.output += d.output
      w.activeDays += d.factor
    }
  }
  for (const w of weekdayAgg) w.avg = w.activeDays > 0 ? w.output / w.activeDays : 0

  return {
    role,
    dailyTarget: team.dailyTarget,
    from: team.from,
    to: team.to,
    today: team.today,
    worker,
    teamSize: team.rows.filter((r) => r.activeDays > 0).length,
    teamAvgPerActiveDay: team.summary.teamAvgPerActiveDay,
    teamDaily: team.daily,
    hourly,
    weekday: weekdayAgg,
    outcomes,
  }
}

// ─── Live floor (v2.85.0) ───────────────────────────────────────────────────

const HOUR_MS = 3_600_000

interface LiveRaw {
  hourly: number[]
  lastHour: number
  firstAt: string | null
  lastAt: string | null
}

/** One day's completions per worker: hourly buckets, last-hour count, first/last timestamps (ISO UTC). */
async function loadDayCompletions(role: PerfRole, userIds: string[], date: string, lastHourCut: Date): Promise<Map<string, LiveRaw>> {
  const result = new Map<string, LiveRaw>()
  if (userIds.length === 0) return result
  const start = naiveUtc(getManilaStartOf(date))
  const end = naiveUtc(new Date(getManilaStartOf(date).getTime() + DAY_MS))
  const cut = naiveUtc(lastHourCut)
  type Row = { userId: string; h: number; n: number; lh: number; first: string; last: string }
  const iso = `YYYY-MM-DD"T"HH24:MI:SS.MS"Z"`
  const rows = role === 'PICKER'
    ? await prisma.$queryRaw<Row[]>`
        SELECT picker_id AS "userId",
               EXTRACT(HOUR FROM completed_at + interval '8 hours')::int AS h,
               COUNT(*)::int AS n,
               COUNT(*) FILTER (WHERE completed_at >= ${cut}::timestamp)::int AS lh,
               to_char(MIN(completed_at), ${iso}) AS first,
               to_char(MAX(completed_at), ${iso}) AS last
        FROM picker_assignments
        WHERE picker_id = ANY(${userIds}::text[])
          AND completed_at >= ${start}::timestamp
          AND completed_at < ${end}::timestamp
        GROUP BY 1, 2`
    : await prisma.$queryRaw<Row[]>`
        SELECT packer_id AS "userId",
               EXTRACT(HOUR FROM completed_at + interval '8 hours')::int AS h,
               COUNT(*)::int AS n,
               COUNT(*) FILTER (WHERE completed_at >= ${cut}::timestamp)::int AS lh,
               to_char(MIN(completed_at), ${iso}) AS first,
               to_char(MAX(completed_at), ${iso}) AS last
        FROM packer_assignments
        WHERE packer_id = ANY(${userIds}::text[])
          AND completed_at >= ${start}::timestamp
          AND completed_at < ${end}::timestamp
        GROUP BY 1, 2`
  for (const r of rows) {
    let raw = result.get(r.userId)
    if (!raw) {
      raw = { hourly: new Array(24).fill(0), lastHour: 0, firstAt: null, lastAt: null }
      result.set(r.userId, raw)
    }
    raw.hourly[Number(r.h) % 24] += Number(r.n)
    raw.lastHour += Number(r.lh)
    if (!raw.firstAt || r.first < raw.firstAt) raw.firstAt = r.first
    if (!raw.lastAt || r.last > raw.lastAt) raw.lastAt = r.last
  }
  return result
}

/**
 * Open assignments right now, same definition as the Picker / Packer Admin
 * workload cards: order still in that stage (…_ASSIGNED = queued, PICKING /
 * PACKING = in hand) and not archived.
 */
async function loadOpenWork(tenantId: string, role: PerfRole, userIds: string[]): Promise<Map<string, { queued: number; inHand: number }>> {
  const result = new Map<string, { queued: number; inHand: number }>()
  if (userIds.length === 0) return result
  const bump = (id: string, inHand: boolean) => {
    const cur = result.get(id) ?? { queued: 0, inHand: 0 }
    if (inHand) cur.inHand++
    else cur.queued++
    result.set(id, cur)
  }
  if (role === 'PICKER') {
    const rows = await prisma.pickerAssignment.findMany({
      where: {
        pickerId: { in: userIds },
        completedAt: null,
        order: { tenantId, archivedAt: null, status: { in: [OrderStatus.PICKER_ASSIGNED, OrderStatus.PICKING] } },
      },
      select: { pickerId: true, order: { select: { status: true } } },
    })
    for (const r of rows) bump(r.pickerId, r.order.status === OrderStatus.PICKING)
  } else {
    const rows = await prisma.packerAssignment.findMany({
      where: {
        packerId: { in: userIds },
        completedAt: null,
        order: { tenantId, archivedAt: null, status: { in: [OrderStatus.PACKER_ASSIGNED, OrderStatus.PACKING] } },
      },
      select: { packerId: true, order: { select: { status: true } } },
    })
    for (const r of rows) bump(r.packerId, r.order.status === OrderStatus.PACKING)
  }
  return result
}

function buildLiveWorker(
  w: WorkerSource,
  raw: LiveRaw | undefined,
  open: { queued: number; inHand: number } | undefined,
  sched: { status: AttendanceStatus; otHours: number; workedHours: number | null } | undefined,
  dailyTarget: number,
  isLive: boolean,
  now: Date,
): LiveWorker {
  const hourly = raw?.hourly ?? new Array(24).fill(0)
  const completed = hourly.reduce((a, b) => a + b, 0)
  const queued = isLive ? open?.queued ?? 0 : 0
  const inHand = isLive ? open?.inHand ?? 0 : 0
  const hasWork = queued + inHand > 0
  const attendance = sched?.status ?? null

  let factor = 0
  let shiftHours = LIVE_DEFAULT_SHIFT_HOURS
  if (attendance === AttendanceStatus.PRESENT) {
    factor = 1
    shiftHours = LIVE_DEFAULT_SHIFT_HOURS + (sched?.otHours ?? 0)
  } else if (attendance === AttendanceStatus.HALF_DAY) {
    factor = 0.5
    shiftHours = LIVE_DEFAULT_SHIFT_HOURS / 2
  } else if (attendance === AttendanceStatus.PARTIAL_DAY) {
    factor = cellDayFactor(attendance, sched?.workedHours)
    shiftHours = sched?.workedHours ?? 0
  } else if (attendance) {
    factor = completed > 0 ? 1 : 0 // worked on a scheduled off day
  } else {
    factor = completed > 0 || hasWork ? 1 : 0
  }
  const target = factor * dailyTarget

  const firstMs = raw?.firstAt ? new Date(raw.firstAt).getTime() : null
  const lastMs = raw?.lastAt ? new Date(raw.lastAt).getTime() : null
  const sinceFirstH = firstMs !== null ? (now.getTime() - firstMs) / HOUR_MS : 0
  const minutesSinceLast = isLive && lastMs !== null ? Math.max(0, Math.floor((now.getTime() - lastMs) / 60_000)) : null

  let pacePerHour = 0
  if (completed > 0 && firstMs !== null) {
    const spanEnd = isLive ? now.getTime() : (lastMs ?? firstMs)
    pacePerHour = completed / Math.max(1, (spanEnd - firstMs) / HOUR_MS)
  }
  const projected = isLive && completed > 0
    ? completed + pacePerHour * Math.max(0, shiftHours - sinceFirstH)
    : completed

  let state: LiveState
  if (!isLive) {
    state = completed > 0 ? 'DONE' : factor > 0 ? 'NOT_STARTED' : attendance ? 'OFF' : 'NO_ACTIVITY'
  } else if (completed === 0) {
    // work in hand = started; only queued (assigned, not picked up yet) = not started
    state = inHand > 0 ? 'WORKING' : factor > 0 ? 'NOT_STARTED' : attendance ? 'OFF' : 'NO_ACTIVITY'
  } else if (minutesSinceLast !== null && minutesSinceLast < LIVE_IDLE_MINUTES) {
    state = 'WORKING'
  } else if (hasWork && sinceFirstH < shiftHours + 1) {
    state = inHand > 0 ? 'WORKING' : 'IDLE'
  } else {
    // +1h allowance for the break before calling the shift over
    state = sinceFirstH >= shiftHours + 1 ? 'DONE' : 'IDLE'
  }

  const basis = isLive ? projected : completed
  const outcome: PerfDayOutcome = target === 0 ? 'OFF'
    : basis >= target ? 'MET'
    : basis >= target * PERF_NEAR_TARGET_RATIO ? 'NEAR'
    : 'BELOW'

  return {
    userId: w.userId,
    username: w.username,
    displayName: w.employee ? `${w.employee.firstName} ${w.employee.lastName}`.trim() : w.username,
    empNo: w.employee?.empNo ?? null,
    linked: !!w.employee,
    attendance,
    factor,
    target,
    shiftHours,
    completed,
    queued,
    inHand,
    lastHour: isLive ? raw?.lastHour ?? 0 : 0,
    hourly,
    firstAt: raw?.firstAt ?? null,
    lastAt: raw?.lastAt ?? null,
    pacePerHour: Math.round(pacePerHour * 10) / 10,
    projected: Math.round(projected),
    progress: target > 0 ? completed / target : 0,
    outcome,
    state,
    minutesSinceLast,
  }
}

function liveTotals(workers: LiveWorker[]): LiveRoleTotals {
  const t: LiveRoleTotals = {
    completed: 0, target: 0, projected: 0, queued: 0, inHand: 0, lastHour: 0, pacePerHour: 0,
    working: 0, idle: 0, notStarted: 0, done: 0, off: 0, noActivity: 0, onTrack: 0, near: 0, behind: 0,
  }
  let pace = 0
  for (const w of workers) {
    t.completed += w.completed
    t.target += w.target
    t.projected += w.projected
    t.queued += w.queued
    t.inHand += w.inHand
    t.lastHour += w.lastHour
    pace += w.pacePerHour
    if (w.state === 'WORKING') t.working++
    else if (w.state === 'IDLE') t.idle++
    else if (w.state === 'NOT_STARTED') t.notStarted++
    else if (w.state === 'DONE') t.done++
    else if (w.state === 'OFF') t.off++
    else t.noActivity++
    if (w.target > 0) {
      if (w.outcome === 'MET') t.onTrack++
      else if (w.outcome === 'NEAR') t.near++
      else t.behind++
    }
  }
  t.pacePerHour = Math.round(pace * 10) / 10
  return t
}

/** Live floor board for both roles. `date` omitted / today = live; a past day (≤ 90 days back) = replay. */
/**
 * Shared engine for the live floor. Only the requested roles are loaded, so a
 * single-role consumer (Picker/Packer Admin workload, v2.90) runs half the queries.
 */
async function loadLiveRoles(tenantId: string, dateInput: string | undefined, roles: PerfRole[]) {
  const today = getManilaDateString()
  let date = today
  if (dateInput && dateInput !== today) {
    if (!DATE_RE.test(dateInput)) throw new PerfRangeError('Invalid date (expected YYYY-MM-DD)')
    if (dateInput > today) throw new PerfRangeError('Future dates are not allowed')
    if (dateList(dateInput, today).length > 90) throw new PerfRangeError('Date out of range (max 90 days back)')
    date = dateInput
  }
  const isLive = date === today
  const now = new Date()
  const lastHourCut = new Date(now.getTime() - HOUR_MS)

  const want = (r: PerfRole) => roles.includes(r)
  const [pickers, packers] = await Promise.all([
    want('PICKER') ? loadWorkers(tenantId, 'PICKER') : Promise.resolve([] as WorkerSource[]),
    want('PACKER') ? loadWorkers(tenantId, 'PACKER') : Promise.resolve([] as WorkerSource[]),
  ])
  const employeeIds = [...pickers, ...packers].flatMap((w) => (w.employee ? [w.employee.id] : []))
  const noOpen = () => Promise.resolve(new Map<string, { queued: number; inHand: number }>())

  const [pickRaw, packRaw, pickOpen, packOpen, schedRows] = await Promise.all([
    want('PICKER') ? loadDayCompletions('PICKER', pickers.map((w) => w.userId), date, lastHourCut) : Promise.resolve(new Map<string, LiveRaw>()),
    want('PACKER') ? loadDayCompletions('PACKER', packers.map((w) => w.userId), date, lastHourCut) : Promise.resolve(new Map<string, LiveRaw>()),
    isLive && want('PICKER') ? loadOpenWork(tenantId, 'PICKER', pickers.map((w) => w.userId)) : noOpen(),
    isLive && want('PACKER') ? loadOpenWork(tenantId, 'PACKER', packers.map((w) => w.userId)) : noOpen(),
    employeeIds.length
      ? prisma.empSchedule.findMany({
          where: { tenantId, employeeId: { in: employeeIds }, date: new Date(`${date}T00:00:00.000Z`) },
          select: { employeeId: true, status: true, otHours: true, workedHours: true },
        })
      : Promise.resolve([]),
  ])
  const sched = new Map(schedRows.map((s) => [s.employeeId, { status: s.status as AttendanceStatus, otHours: s.otHours, workedHours: s.workedHours }]))

  const board = (role: PerfRole, list: WorkerSource[], raw: Map<string, LiveRaw>, open: Map<string, { queued: number; inHand: number }>): LiveRoleBoard => {
    const dailyTarget = PERF_DAILY_TARGET[role]
    const workers = list
      .map((w) => buildLiveWorker(w, raw.get(w.userId), open.get(w.userId), w.employee ? sched.get(w.employee.id) : undefined, dailyTarget, isLive, now))
      .sort((a, b) => b.completed - a.completed || a.displayName.localeCompare(b.displayName))
    const hourly = new Array(24).fill(0)
    for (const w of workers) w.hourly.forEach((v, i) => { hourly[i] += v })
    return { role, dailyTarget, totals: liveTotals(workers), hourly, workers }
  }

  return {
    date,
    isLive,
    generatedAt: now.toISOString(),
    currentHour: isLive ? new Date(now.getTime() + 8 * HOUR_MS).getUTCHours() : null,
    boards: {
      PICKER: want('PICKER') ? board('PICKER', pickers, pickRaw, pickOpen) : null,
      PACKER: want('PACKER') ? board('PACKER', packers, packRaw, packOpen) : null,
    },
  }
}

export async function getLiveBoard(tenantId: string, dateInput?: string): Promise<LiveBoard> {
  const { boards, ...meta } = await loadLiveRoles(tenantId, dateInput, ['PICKER', 'PACKER'])
  return { ...meta, roles: { PICKER: boards.PICKER!, PACKER: boards.PACKER! } }
}

/** One role of the live floor — Picker/Packer Admin workload cards (v2.90). */
export async function getLiveRoleBoard(tenantId: string, role: PerfRole, dateInput?: string): Promise<LiveRoleSnapshot> {
  const { boards, ...meta } = await loadLiveRoles(tenantId, dateInput, [role])
  return { ...meta, board: boards[role]! }
}

/** Active pickers + packers selectable in the employee report (inactive employees hidden). */
export async function listPerformanceWorkers(tenantId: string): Promise<PerfWorkerOption[]> {
  const [pickers, packers] = await Promise.all([loadWorkers(tenantId, 'PICKER'), loadWorkers(tenantId, 'PACKER')])
  const toOption = (role: PerfRole) => (w: WorkerSource): PerfWorkerOption => ({
    userId: w.userId,
    username: w.username,
    role,
    displayName: w.employee ? `${w.employee.firstName} ${w.employee.lastName}`.trim() : w.username,
    linkedEmployeeId: w.employee?.id ?? null,
  })
  const byName = (a: PerfWorkerOption, b: PerfWorkerOption) => a.displayName.localeCompare(b.displayName)
  return [...pickers.map(toOption('PICKER')).sort(byName), ...packers.map(toOption('PACKER')).sort(byName)]
}
