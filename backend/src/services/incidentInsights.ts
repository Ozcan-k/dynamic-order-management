// ─── Incident insights (v2.91.0) — occurrence numbers + disciplinary history ──
// Everything here is computed at read time from existing rows; nothing is
// written back. Incidents created before v2.91 have no disciplinary action
// (NULL = "Not recorded") and are counted as incidents, never as warnings.

import {
  DisciplinaryAction,
  highestOf,
  isWarningAction,
  type IncidentOccurrence,
} from '@dom/shared'
import { prisma } from '../lib/prisma'

const DAY_MS = 24 * 60 * 60 * 1000
const YEAR_MS = 365 * DAY_MS

export interface OccurrenceRow {
  id: string
  employeeUserId: string
  incidentType: string
  incidentDate: Date
  createdAt: Date
  disciplinaryAction: DisciplinaryAction | null
}

export interface Person {
  key: string            // EmpEmployee id when the login is linked, else the login's user id
  name: string | null    // employee full name when linked
  userIds: string[]
}

/** Stable chronological order: incident date, then creation time, then id. */
export function chronological(a: OccurrenceRow, b: OccurrenceRow): number {
  return a.incidentDate.getTime() - b.incidentDate.getTime()
    || a.createdAt.getTime() - b.createdAt.getTime()
    || a.id.localeCompare(b.id)
}

/**
 * Pure: occurrence numbers for every row, grouped by person.
 * @param personKeyOf login user id → person key (unknown ids fall back to the user id)
 */
export function computeOccurrences(rows: OccurrenceRow[], personKeyOf: (userId: string) => string): Map<string, IncidentOccurrence> {
  const byPerson = new Map<string, OccurrenceRow[]>()
  for (const r of rows) {
    const k = personKeyOf(r.employeeUserId)
    const list = byPerson.get(k)
    if (list) list.push(r)
    else byPerson.set(k, [r])
  }

  const out = new Map<string, IncidentOccurrence>()
  for (const [personKey, list] of byPerson) {
    list.sort(chronological)
    const typeCounts = new Map<string, number>()
    let warnings = 0
    let prev: { action: DisciplinaryAction; date: string } | null = null
    list.forEach((r, i) => {
      const typeNo = (typeCounts.get(r.incidentType) ?? 0) + 1
      typeCounts.set(r.incidentType, typeNo)
      const isWarning = isWarningAction(r.disciplinaryAction)
      if (isWarning) warnings += 1
      const since = r.incidentDate.getTime() - YEAR_MS
      const last12Months = list.slice(0, i + 1).filter((x) => x.incidentDate.getTime() > since).length
      out.set(r.id, {
        personKey,
        no: i + 1,
        typeNo,
        warningNo: isWarning ? warnings : null,
        personTotal: list.length,
        last12Months,
        previousAction: prev,
      })
      if (r.disciplinaryAction) prev = { action: r.disciplinaryAction, date: r.incidentDate.toISOString().slice(0, 10) }
    })
  }
  return out
}

/** Highest action on record (by ladder level) — shared with the frontend. */
export const highestAction = highestOf

// ─── Loaders ──────────────────────────────────────────────────────────────────

/** Every login in the tenant mapped to its person (linked Employee when available). */
export async function loadPeople(tenantId: string): Promise<{ keyOf: (userId: string) => string; people: Map<string, Person> }> {
  const users = await prisma.user.findMany({
    where: { tenantId },
    select: { id: true, employee: { select: { id: true, firstName: true, lastName: true } } },
  })
  const keyByUser = new Map<string, string>()
  const people = new Map<string, Person>()
  for (const u of users) {
    const key = u.employee?.id ?? u.id
    keyByUser.set(u.id, key)
    const p = people.get(key) ?? { key, name: u.employee ? `${u.employee.firstName} ${u.employee.lastName}`.trim() : null, userIds: [] }
    p.userIds.push(u.id)
    people.set(key, p)
  }
  return { keyOf: (id) => keyByUser.get(id) ?? id, people }
}

/** Minimal columns for every incident in the tenant (small table; all-time by design). */
export async function loadOccurrenceRows(tenantId: string): Promise<OccurrenceRow[]> {
  return prisma.incident.findMany({
    where: { tenantId },
    select: { id: true, employeeUserId: true, incidentType: true, incidentDate: true, createdAt: true, disciplinaryAction: true },
  }) as Promise<OccurrenceRow[]>
}

/** Occurrence numbers for the whole tenant (the table is small — 115 rows in prod at v2.91). */
export async function getTenantOccurrences(tenantId: string) {
  const [{ keyOf, people }, rows] = await Promise.all([loadPeople(tenantId), loadOccurrenceRows(tenantId)])
  return { occurrences: computeOccurrences(rows, keyOf), keyOf, people, rows }
}
