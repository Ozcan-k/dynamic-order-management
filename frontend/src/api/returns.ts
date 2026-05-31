import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { api } from './client'
import { ReturnCancelType, Platform, Carrier } from '@dom/shared'

export interface ReturnCancelRow {
  id: string
  trackingNumber: string
  type: ReturnCancelType
  storeName: string
  platform: Platform
  carrier: Carrier
  createdAt: string
  createdBy: { username: string }
}

export interface ReturnCancelListResponse {
  rows: ReturnCancelRow[]
  total: number
  page: number
  pageSize: number
  stats: { total: number; returns: number; cancels: number }
}

export interface ListReturnCancelQuery {
  page?: number
  pageSize?: number
  search?: string
  type?: ReturnCancelType
  from?: string
  to?: string
}

export interface CreateReturnCancelInput {
  trackingNumber: string
  type: ReturnCancelType
  storeName: string
  platform: Platform
  carrier: Carrier
}

export function useReturnCancelList(query: ListReturnCancelQuery) {
  return useQuery({
    queryKey: ['returns', query],
    queryFn: async () => (await api.get<ReturnCancelListResponse>('/returns', { params: query })).data,
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  })
}

export function useCreateReturnCancel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateReturnCancelInput) => {
      const res = await api.post<ReturnCancelRow>('/returns', input)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['returns'] })
    },
  })
}

export function useDeleteReturnCancel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete<{ id: string }>(`/returns/${id}`)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['returns'] })
    },
  })
}
