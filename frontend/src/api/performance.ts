import { api } from './client'
import type { PerfRole, PerfTeamReport, PerfEmployeeReport, PerfWorkerOption } from '@dom/shared'

// Target performance (v2.84.0) — Warehouse Report → Performance / Employee Report.

export async function getTargetPerformance(role: PerfRole, from: string, to: string): Promise<PerfTeamReport> {
  const res = await api.get<PerfTeamReport>('/reports/target-performance', { params: { role, from, to } })
  return res.data
}

export async function getEmployeePerformance(userId: string, from: string, to: string): Promise<PerfEmployeeReport> {
  const res = await api.get<PerfEmployeeReport>('/reports/employee-performance', { params: { userId, from, to } })
  return res.data
}

export async function getPerformanceWorkers(): Promise<PerfWorkerOption[]> {
  const res = await api.get<PerfWorkerOption[]>('/reports/performance-workers')
  return res.data
}
