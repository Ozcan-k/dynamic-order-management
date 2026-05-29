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

// ─── URLs (download links) ─────────────────────────────────────────────────

export function incidentPdfUrl(id: string): string {
  return `/incidents/${id}/pdf`
}

export function incidentSignedUrl(id: string): string {
  return `/incidents/${id}/signed`
}
