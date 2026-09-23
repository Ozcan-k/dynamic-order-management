import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

// Store names (v2.92.0) — managed in Settings → Stores, seeded from the old SALES_STORES
// list. Pickers for new entries use the active list; report filters pass `all` so
// archived stores stay selectable for historical data.

export interface StoreItem {
  id: string
  name: string
  isActive: boolean
  sortOrder: number
}

export const STORES_QUERY_KEY = ['stores'] as const

export function useStores(opts: { all?: boolean } = {}) {
  const all = !!opts.all
  const q = useQuery({
    queryKey: [...STORES_QUERY_KEY, all ? 'all' : 'active'],
    queryFn: async () => {
      const { data } = await api.get<{ stores: string[]; items: StoreItem[] }>('/sales/stores', { params: all ? { all: '1' } : {} })
      return data
    },
    staleTime: 5 * 60_000,
  })
  return { ...q, names: q.data?.stores ?? [] }
}

// Keeps a record's current store selectable even when it has since been archived.
export function withCurrent(names: string[], current: string | null | undefined): string[] {
  return current && !names.includes(current) ? [...names, current] : names
}

// ─── Management (Settings → Stores, ADMIN) ────────────────────────────────────

export interface StoreUsage {
  activity: number
  directOrders: number
  returns: number
  total: number
  lastUsed: string | null
}

export interface ManagedStore extends StoreItem {
  usage: StoreUsage
}

export interface StoreHistoryEntry {
  id: string
  action: 'CREATE' | 'RENAME' | 'ARCHIVE' | 'RESTORE' | 'DELETE'
  fromName: string | null
  toName: string | null
  details: { activity?: number; directOrders?: number; returns?: number } | null
  username: string | null
  createdAt: string
}

export interface StoresManageResponse {
  stores: ManagedStore[]
  unlisted: { name: string; usage: StoreUsage }[]
  history: StoreHistoryEntry[]
}

export interface RenamePreview {
  from: string
  to: string
  usage: StoreUsage
  blocked: string | null
}

export function useStoresManage() {
  return useQuery({
    queryKey: [...STORES_QUERY_KEY, 'manage'],
    queryFn: async () => (await api.get<StoresManageResponse>('/sales/stores/manage')).data,
  })
}

export async function fetchRenamePreview(id: string, name: string): Promise<RenamePreview> {
  const { data } = await api.get<RenamePreview>(`/sales/stores/${id}/rename-preview`, { params: { name } })
  return data
}

export function apiError(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback
}

// Every store mutation refreshes all store lists (pickers + this screen)
export function useStoreMutation<V>(fn: (vars: V) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: STORES_QUERY_KEY }),
  })
}

export const storeActions = {
  create: (name: string) => api.post('/sales/stores', { name }),
  rename: ({ id, name }: { id: string; name: string }) => api.post(`/sales/stores/${id}/rename`, { name }),
  archive: (id: string) => api.post(`/sales/stores/${id}/archive`),
  restore: (id: string) => api.post(`/sales/stores/${id}/restore`),
  remove: (id: string) => api.delete(`/sales/stores/${id}`),
}
