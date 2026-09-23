import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { api } from './client'
import { IncidentType, Platform, UserRole, type DisciplinaryAction, type IncidentCategory, type IncidentOccurrence } from '@dom/shared'

export interface IncidentTypeOption {
  value: IncidentType
  label: string
  requiresParcel: boolean
  requiresCost: boolean
}

export interface Incident {
  id: string
  tenantId: string
  incidentType: IncidentType
  incidentDate: string
  employeeUserId: string
  employeeFullName: string
  employeeEmail: string
  recipientEmail: string
  reportedByUserId: string
  reportedByFullName: string
  reportedByRole: string
  adminDescription: string
  trackingNumber: string | null
  platform: Platform | null
  shopName: string | null
  witnessName: string | null
  witnessPosition: string | null
  costAmount: number | null
  costQuantity: number | null
  shippingCost: number | null
  signedFilePath: string | null
  signedFileMime: string | null
  signedUploadedAt: string | null
  emailSentAt: string | null
  emailSentTo: string | null
  createdAt: string
  updatedAt: string
  /** v2.91.0 — null = not recorded (every incident before v2.91) */
  disciplinaryAction?: DisciplinaryAction | null
  /** v2.91.0 — computed at read time (list + detail) */
  occurrence?: IncidentOccurrence | null
  /** v2.91.0 — list only: uploaded documents (signed copies) */
  documentCount?: number
  hasSignedCopy?: boolean
}

export interface SelectableUser {
  id: string
  username: string
  email: string | null
  role: UserRole
}

export interface IncidentStats {
  total: number
  thisMonth: number
  topType: { type: IncidentType; count: number } | null
  smtpConfigured: boolean
}

export interface IncidentPivotRow {
  userId: string
  fullName: string
  total: number
  totalCost: number
  counts: Record<string, number>
}

export interface IncidentReportTrendPoint {
  label: string
  count: number
  cost: number
  /** v2.91.0 — incident count per IncidentCategory in this bucket */
  byCategory?: Record<string, number>
}

export interface IncidentRepeatPerson {
  personKey: string
  name: string
  userId: string
  count: number
  allTime: number
  warnings: number
  notRecorded: number
  highestAction: DisciplinaryAction | null
  lastDate: string
  cost: number
  topType: { type: IncidentType; label: string; count: number } | null
}

export interface IncidentReportByType {
  type: IncidentType
  label: string
  count: number
}

export interface IncidentReportByEmployeeCost {
  employeeUserId: string
  employeeFullName: string
  cost: number
}

export interface IncidentReport {
  trend: IncidentReportTrendPoint[]
  byType: IncidentReportByType[]
  byEmployeeCost: IncidentReportByEmployeeCost[]
  total: number
  totalCost: number
  // v2.91.0 additions
  employeesInvolved?: number
  repeatOffenders?: number
  warningsIssued?: number
  unsignedCount?: number
  byAction?: { action: DisciplinaryAction | 'NOT_RECORDED'; count: number }[]
  byCategory?: { category: IncidentCategory; count: number; cost: number }[]
  repeatList?: IncidentRepeatPerson[]
  previous?: { from: string; to: string; total: number; employeesInvolved: number; totalCost: number; warningsIssued: number } | null
}

export interface PersonHistory {
  personKey: string
  name: string | null
  userIds: string[]
  total: number
  last12Months: number
  warningCount: number
  notRecorded: number
  highestAction: DisciplinaryAction | null
  lastWarning: { action: DisciplinaryAction; date: string } | null
  suggestedNext: DisciplinaryAction
  totalCost: number
  byType: { type: IncidentType; label: string; count: number }[]
  incidents: {
    id: string
    incidentType: IncidentType
    incidentDate: string
    employeeUserId: string
    disciplinaryAction: DisciplinaryAction | null
    cost: number
    reportedByFullName: string
    hasSignedCopy: boolean
    occurrence: IncidentOccurrence | null
  }[]
}

export interface CreateIncidentInput {
  incidentType: IncidentType
  incidentDate: string
  employeeUserId: string
  employeeFullName: string
  employeeEmail: string
  recipientEmail: string
  reportedByUserId: string
  reportedByFullName: string
  reportedByRole: string
  adminDescription: string
  trackingNumber?: string
  platform?: Platform
  shopName?: string
  witnessName?: string
  witnessPosition?: string
  costAmount?: number
  costQuantity?: number
  shippingCost?: number
  /** v2.91.0 — omit to leave untouched on edit; null clears */
  disciplinaryAction?: DisciplinaryAction | null
}

// ─── Lookups ────────────────────────────────────────────────────────────────

export function useIncidentTypes() {
  return useQuery({
    queryKey: ['incident-types'],
    queryFn: async () => (await api.get<IncidentTypeOption[]>('/incidents/types')).data,
    staleTime: 60 * 60_000,
  })
}

export function useSelectableUsers() {
  return useQuery({
    queryKey: ['incidents', 'selectable-users'],
    queryFn: async () => (await api.get<SelectableUser[]>('/incidents/selectable-users')).data,
    staleTime: 60_000,
  })
}

/** v2.91.0 — one incident with its occurrence numbers (profile timeline → detail). */
export async function fetchIncident(id: string): Promise<Incident> {
  return (await api.get<Incident>(`/incidents/${id}`)).data
}

export async function fetchRememberedFullName(userId: string): Promise<string | null> {
  const res = await api.get<{ fullName: string | null }>(`/incidents/remembered-name/${userId}`)
  return res.data.fullName
}

export async function lookupTrackingNumber(tn: string): Promise<{ found: false } | { found: true; trackingNumber: string; platform: Platform; shopName: string | null }> {
  const res = await api.get(`/incidents/lookup-tn`, { params: { tn } })
  return res.data
}

// ─── List + stats + pivot ──────────────────────────────────────────────────

export interface ListIncidentsQuery {
  page?: number
  pageSize?: number
  search?: string
  type?: IncidentType
  employeeUserId?: string
  from?: string
  to?: string
  /** v2.91.0 */
  action?: DisciplinaryAction | 'NOT_RECORDED'
  category?: IncidentCategory
  /** every login of the person behind this user id */
  samePersonAs?: string
}

export function useIncidents(query: ListIncidentsQuery) {
  return useQuery({
    queryKey: ['incidents', query],
    queryFn: async () => {
      const res = await api.get<{ total: number; page: number; pageSize: number; rows: Incident[] }>(
        '/incidents', { params: query },
      )
      return res.data
    },
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  })
}

/** v2.91.0 — every incident of the person behind a login (all linked logins) + ladder summary. */
export function usePersonHistory(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['incidents', 'person-history', userId],
    queryFn: async () => (await api.get<PersonHistory>(`/incidents/people/${userId}/history`)).data,
    enabled: !!userId,
    staleTime: 30_000,
  })
}

export function useIncidentStats() {
  return useQuery({
    queryKey: ['incidents', 'stats'],
    queryFn: async () => (await api.get<IncidentStats>('/incidents/stats')).data,
    staleTime: 15_000,
  })
}

export function useIncidentPivot(range?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ['incidents', 'pivot', range ?? {}],
    queryFn: async () => (await api.get<{ rows: IncidentPivotRow[] }>('/incidents/pivot', { params: range })).data,
    staleTime: 15_000,
  })
}

export function useIncidentReport(range: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ['incidents', 'report', range],
    queryFn: async () => (await api.get<IncidentReport>('/incidents/report', { params: range })).data,
    staleTime: 15_000,
  })
}

// ─── Mutations ─────────────────────────────────────────────────────────────

export function useCreateIncident() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateIncidentInput) => {
      const res = await api.post<Incident>('/incidents', input)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incidents'] })
    },
  })
}

export function useUpdateIncident() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: CreateIncidentInput }) => {
      const res = await api.patch<Incident>(`/incidents/${id}`, input)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incidents'] })
    },
  })
}

export function useDeleteIncident() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete<{ id: string }>(`/incidents/${id}`)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incidents'] })
    },
  })
}

export function useUploadSignedFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ incidentId, file }: { incidentId: string; file: File }) => {
      const form = new FormData()
      form.append('file', file)
      const res = await api.post<Incident>(`/incidents/${incidentId}/signed`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incidents'] })
    },
  })
}

// ─── Multiple documents per incident ─────────────────────────────────────────
export interface IncidentDocument {
  id: string
  mime: string
  originalName: string | null
  uploadedAt: string
}

export function useIncidentDocuments(incidentId: string | null) {
  return useQuery({
    queryKey: ['incident-documents', incidentId],
    enabled: !!incidentId,
    queryFn: async () => (await api.get<{ documents: IncidentDocument[] }>(`/incidents/${incidentId}/documents`)).data.documents,
  })
}

export function useUploadIncidentDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ incidentId, file }: { incidentId: string; file: File }) => {
      const form = new FormData()
      form.append('file', file)
      const res = await api.post<IncidentDocument>(`/incidents/${incidentId}/documents`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return res.data
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['incident-documents', v.incidentId] })
      qc.invalidateQueries({ queryKey: ['incidents'] })
    },
  })
}

export function useDeleteIncidentDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ incidentId, docId }: { incidentId: string; docId: string }) =>
      (await api.delete(`/incidents/${incidentId}/documents/${docId}`)).data,
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['incident-documents', v.incidentId] })
      qc.invalidateQueries({ queryKey: ['incidents'] })
    },
  })
}

export function useSendIncidentEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (incidentId: string) => {
      const res = await api.post<{ sent: boolean; to: string[] }>(`/incidents/${incidentId}/email`)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incidents'] })
    },
  })
}

// ─── Authenticated file downloads ───────────────────────────────────────────
// A plain <a href> navigation does not carry the auth cookie/baseURL, so it hits
// the SPA fallback and renders the login screen. Fetch as a blob through the api
// client (withCredentials) instead, then trigger a save.

function saveBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

export async function downloadIncidentPdf(id: string) {
  const res = await api.get(`/incidents/${id}/pdf`, { responseType: 'blob' })
  saveBlob(res.data as Blob, `incident-${id.slice(0, 8)}.pdf`)
}

export async function downloadSignedFile(id: string) {
  const res = await api.get(`/incidents/${id}/signed`, { responseType: 'blob' })
  const mime = String(res.headers['content-type'] ?? '')
  const ext = mime.includes('pdf') ? 'pdf' : mime.includes('png') ? 'png' : 'jpg'
  saveBlob(res.data as Blob, `incident-${id.slice(0, 8)}-signed.${ext}`)
}

export async function downloadIncidentDocument(incidentId: string, docId: string, name?: string | null) {
  const res = await api.get(`/incidents/${incidentId}/documents/${docId}`, { responseType: 'blob' })
  const mime = String(res.headers['content-type'] ?? '')
  const ext = mime.includes('pdf') ? 'pdf' : mime.includes('png') ? 'png' : 'jpg'
  saveBlob(res.data as Blob, name || `incident-${incidentId.slice(0, 8)}-doc.${ext}`)
}
