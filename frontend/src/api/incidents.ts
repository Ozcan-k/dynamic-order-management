import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { api } from './client'
import { IncidentType, Platform, UserRole } from '@dom/shared'

export interface IncidentTypeOption {
  value: IncidentType
  label: string
  requiresParcel: boolean
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
  signedFilePath: string | null
  signedFileMime: string | null
  signedUploadedAt: string | null
  emailSentAt: string | null
  emailSentTo: string | null
  createdAt: string
  updatedAt: string
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
  counts: Record<string, number>
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

export function useIncidentStats() {
  return useQuery({
    queryKey: ['incidents', 'stats'],
    queryFn: async () => (await api.get<IncidentStats>('/incidents/stats')).data,
    staleTime: 15_000,
  })
}

export function useIncidentPivot() {
  return useQuery({
    queryKey: ['incidents', 'pivot'],
    queryFn: async () => (await api.get<{ rows: IncidentPivotRow[] }>('/incidents/pivot')).data,
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
