import { api } from './client'
import type { LiveBoard, LiveRoleSnapshot, PerfRole, PerfTeamReport, PerfEmployeeReport, PerfWorkerOption } from '@dom/shared'

// Target performance (v2.84.0) — Warehouse Report → Performance / Employee Report.

export async function getTargetPerformance(role: PerfRole, from: string, to: string): Promise<PerfTeamReport> {
  const res = await api.get<PerfTeamReport>('/reports/target-performance', { params: { role, from, to } })
  return res.data
}

export async function getEmployeePerformance(userId: string, from: string, to: string): Promise<PerfEmployeeReport> {
  const res = await api.get<PerfEmployeeReport>('/reports/employee-performance', { params: { userId, from, to } })
  return res.data
}

/** Live floor board (v2.85.0). No date = today (live). */
export async function getLiveBoard(date?: string): Promise<LiveBoard> {
  const res = await api.get<LiveBoard>('/reports/live-board', { params: date ? { date } : {} })
  return res.data
}

/** One role of the live floor — Picker/Packer Admin workload cards (v2.90.0). */
export async function getLiveWorkers(role: PerfRole): Promise<LiveRoleSnapshot> {
  const res = await api.get<LiveRoleSnapshot>('/reports/live-workers', { params: { role } })
  return res.data
}

export async function getPerformanceWorkers(): Promise<PerfWorkerOption[]> {
  const res = await api.get<PerfWorkerOption[]>('/reports/performance-workers')
  return res.data
}
