import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { StockStatus, StockUnit, MovementType } from '@dom/shared'

export interface StockItem {
  id: string
  productId: string
  warehouseId: string
  unit: StockUnit
  quantity: number
  batchNumber: string
  status: StockStatus
  createdAt: string
  updatedAt: string
  product: {
    id: string
    name: string
    productCode: string
    category: { id: string; name: string }
  }
  warehouse: { id: string; name: string }
}

export interface StockMovement {
  id: string
  type: MovementType
  scannedAt: string
  scannedBy: string
  fromWarehouse: { id: string; name: string } | null
  toWarehouse: { id: string; name: string } | null
  item: {
    id: string
    productName: string
    productCode: string
    unit: StockUnit
    quantity: number
    batchNumber: string
    status: StockStatus
  }
}

export interface StockStats {
  totalProducts: number
  totalInStock: number
  totalOut: number
  lowStockProducts: number
  transfers30d: number
  used30d: number
  in30d: number
}

export interface StockSummaryRow {
  productId: string
  productCode: string
  productName: string
  categoryId: string
  categoryName: string
  defaultUnit: StockUnit
  reservedThreshold: number
  inStockCount: number
  transferCount: number
  usedCount: number
  lowStock: boolean
}

export interface ScanResultItem {
  id: string
  productName: string
  productCode: string
  unit: StockUnit
  quantity: number
  batchNumber: string
  status: StockStatus
  warehouseId: string
  warehouseName: string
}

export interface ScanResult {
  item: ScanResultItem
  type: MovementType
  fromWarehouse?: string
  toWarehouse?: string
  message: string
}

export interface ScanPayload {
  id: string
  warehouseId: string
}

export interface GenerateLabelsInput {
  productId: string
  warehouseId: string
  unit: StockUnit
  quantity: number
  count: number
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useStockItems(filters?: { status?: StockStatus; productId?: string; warehouseId?: string }) {
  return useQuery({
    queryKey: ['stock-items', filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.status) params.set('status', filters.status)
      if (filters?.productId) params.set('productId', filters.productId)
      if (filters?.warehouseId) params.set('warehouseId', filters.warehouseId)
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

export function useStockSummary() {
  return useQuery({
    queryKey: ['stock-summary'],
    queryFn: async () => {
      const res = await api.get<{ summary: StockSummaryRow[] }>('/stock/summary')
      return res.data.summary
    },
    staleTime: 5_000,
    refetchInterval: 30_000,
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useGenerateLabels() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: GenerateLabelsInput) => {
      const res = await api.post('/stock/labels', input, { responseType: 'blob' })
      const count = Number(res.headers['x-labels-generated'] ?? input.count)
      const batchNumber = String(res.headers['x-batch-number'] ?? '')
      return { blob: res.data as Blob, count, batchNumber }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-items'] })
      qc.invalidateQueries({ queryKey: ['stock-stats'] })
      qc.invalidateQueries({ queryKey: ['stock-summary'] })
    },
  })
}

export function useDeleteStockItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (itemId: string) => {
      const res = await api.delete(`/stock/items/${itemId}`)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-items'] })
      qc.invalidateQueries({ queryKey: ['stock-stats'] })
      qc.invalidateQueries({ queryKey: ['stock-summary'] })
      qc.invalidateQueries({ queryKey: ['stock-movements'] })
    },
  })
}

export function useScanStock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: ScanPayload) => {
      const res = await api.post<ScanResult>('/stock/scan', payload)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-items'] })
      qc.invalidateQueries({ queryKey: ['stock-stats'] })
      qc.invalidateQueries({ queryKey: ['stock-summary'] })
      qc.invalidateQueries({ queryKey: ['stock-movements'] })
    },
  })
}
