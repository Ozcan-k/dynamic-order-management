import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

export interface Warehouse {
  id: string
  name: string
  address: string
  itemsCount?: number
  createdAt: string
  updatedAt: string
}

export interface WarehouseInput {
  name: string
  address: string
}

export function useWarehouses() {
  return useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const res = await api.get<{ warehouses: Warehouse[] }>('/warehouses')
      return res.data.warehouses
    },
    staleTime: 10_000,
  })
}

export function useCreateWarehouse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: WarehouseInput) => {
      const res = await api.post<Warehouse>('/warehouses', input)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warehouses'] }),
  })
}

export function useUpdateWarehouse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<WarehouseInput> }) => {
      const res = await api.put<Warehouse>(`/warehouses/${id}`, input)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warehouses'] }),
  })
}

export function useDeleteWarehouse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/warehouses/${id}`)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warehouses'] }),
  })
}
