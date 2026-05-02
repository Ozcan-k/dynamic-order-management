import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { StockStatus, MovementDirection } from '@dom/shared'

export interface StockItem {
  id: string
  productType: string
  category: string
  weightKg: number
  status: StockStatus
  createdAt: string
  updatedAt: string
}

export interface StockMovement {
  id: string
  direction: MovementDirection
  scannedAt: string
  scannedBy: string
  item: {
    id: string
    productType: string
    category: string
    weightKg: number
    status: StockStatus
  }
}

export interface StockStats {
  totalInStock: number
  totalOutOfStock: number
  totalItems: number
  categoriesCount: number
  byCategory: { category: string; in: number; out: number }[]
}

export interface ScanResult {
  item: {
    id: string
    productType: string
    category: string
    weightKg: number
    status: StockStatus
  }
  direction: MovementDirection
  message: string
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useStockItems(filters?: { status?: StockStatus; productType?: string; category?: string }) {
  return useQuery({
    queryKey: ['stock-items', filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.status) params.set('status', filters.status)
      if (filters?.productType) params.set('productType', filters.productType)
      if (filters?.category) params.set('category', filters.category)
      const qs = params.toString()
      const res = await api.get<{ items: StockItem[] }>(`/stock/items${qs ? `?${qs}` : ''}`)
      return res.data.items
    },
    staleTime: 10_000,
  })
}

export function useStockMovements(limit = 100) {
  return useQuery({
    queryKey: ['stock-movements', limit],
    queryFn: async () => {
      const res = await api.get<{ movements: StockMovement[] }>(`/stock/movements?limit=${limit}`)
      return res.data.movements
    },
    staleTime: 5_000,
  })
}

export function useStockStats() {
  return useQuery({
    queryKey: ['stock-stats'],
    queryFn: async () => {
      const res = await api.get<StockStats>('/stock/stats')
      return res.data
    },
    staleTime: 5_000,
    refetchInterval: 30_000,
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateBulkItems() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { productType: string; category: string; weightKg: number; quantity: number }) => {
      const res = await api.post('/stock/items/bulk', input, { responseType: 'blob' })
      // Pull the created count from the custom response header for UX feedback
      const count = Number(res.headers['x-items-created'] ?? input.quantity)
      return { blob: res.data as Blob, count }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-items'] })
      qc.invalidateQueries({ queryKey: ['stock-stats'] })
    },
  })
}

export function useScanStock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (stockItemId: string) => {
      const res = await api.post<ScanResult>('/stock/scan', { stockItemId })
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-items'] })
      qc.invalidateQueries({ queryKey: ['stock-stats'] })
      qc.invalidateQueries({ queryKey: ['stock-movements'] })
    },
  })
}
