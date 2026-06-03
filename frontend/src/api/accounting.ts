import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  AccContact, AccSale, AccExpense, AccCompanyProfile, AccDashboardSummary, AccPaginated,
} from '@dom/shared'
import { api } from './client'

const BASE = '/accounting'
export const PESO = '₱'
export function money(n: number): string {
  return PESO + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ─── Contacts ──────────────────────────────────────────────────────────────────
type Kind = 'customers' | 'suppliers'
type ContactInput = Pick<AccContact, 'name' | 'address' | 'email' | 'contactPerson' | 'contactNumber'>

export function useAccContacts(kind: Kind) {
  return useQuery({
    queryKey: ['acc', kind],
    queryFn: async () => (await api.get<AccContact[]>(`${BASE}/${kind}`)).data,
  })
}
export function useSaveAccContact(kind: Kind) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ContactInput & { id?: string }) =>
      input.id
        ? (await api.put(`${BASE}/${kind}/${input.id}`, input)).data
        : (await api.post(`${BASE}/${kind}`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['acc', kind] }),
  })
}
export function useDeleteAccContact(kind: Kind) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`${BASE}/${kind}/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['acc', kind] }),
  })
}

// ─── Sales ─────────────────────────────────────────────────────────────────────
export interface AccSaleFilters {
  from?: string; to?: string; paymentMethod?: string; salesStatus?: string
  customerId?: string; search?: string; page?: number; pageSize?: number
}
export function useAccSales(filters: AccSaleFilters) {
  return useQuery({
    queryKey: ['acc', 'sales', filters],
    queryFn: async () => {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v != null))
      return (await api.get<AccPaginated<AccSale>>(`${BASE}/sales`, { params })).data
    },
  })
}
export function useSaveAccSale() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: any) =>
      input.id ? (await api.put(`${BASE}/sales/${input.id}`, input)).data : (await api.post(`${BASE}/sales`, input)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['acc', 'sales'] })
      qc.invalidateQueries({ queryKey: ['acc', 'dashboard'] })
    },
  })
}
export function useDeleteAccSale() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`${BASE}/sales/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['acc', 'sales'] })
      qc.invalidateQueries({ queryKey: ['acc', 'dashboard'] })
    },
  })
}
export function useCreateAccInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (saleId: string) => (await api.post(`${BASE}/invoices`, { saleId })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['acc', 'sales'] }),
  })
}

// ─── Expenses ─────────────────────────────────────────────────────────────────
export interface AccExpenseFilters {
  from?: string; to?: string; country?: string; category?: string
  paidFrom?: string; supplierId?: string; search?: string; page?: number; pageSize?: number
}
export function useAccExpenses(filters: AccExpenseFilters) {
  return useQuery({
    queryKey: ['acc', 'expenses', filters],
    queryFn: async () => {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v != null))
      return (await api.get<AccPaginated<AccExpense>>(`${BASE}/expenses`, { params })).data
    },
  })
}
export function useSaveAccExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: any) =>
      input.id ? (await api.put(`${BASE}/expenses/${input.id}`, input)).data : (await api.post(`${BASE}/expenses`, input)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['acc', 'expenses'] })
      qc.invalidateQueries({ queryKey: ['acc', 'dashboard'] })
    },
  })
}
export function useDeleteAccExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`${BASE}/expenses/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['acc', 'expenses'] })
      qc.invalidateQueries({ queryKey: ['acc', 'dashboard'] })
    },
  })
}

// ─── Company + Dashboard ────────────────────────────────────────────────────────
export function useAccCompany() {
  return useQuery({
    queryKey: ['acc', 'company'],
    queryFn: async () => (await api.get<AccCompanyProfile>(`${BASE}/company`)).data,
  })
}
export function useSaveAccCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (form: FormData) =>
      (await api.put(`${BASE}/company`, form, { headers: { 'Content-Type': 'multipart/form-data' } })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['acc', 'company'] }),
  })
}
export function useAccDashboard() {
  return useQuery({
    queryKey: ['acc', 'dashboard'],
    queryFn: async () => (await api.get<AccDashboardSummary>(`${BASE}/dashboard`)).data,
  })
}
