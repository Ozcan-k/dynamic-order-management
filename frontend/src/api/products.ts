import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { StockUnit } from '@dom/shared'

export interface ProductCategory {
  id: string
  name: string
  createdAt: string
}

export interface Product {
  id: string
  productCode: string
  name: string
  categoryId: string
  defaultUnit: StockUnit
  reservedThreshold: number
  createdAt: string
  updatedAt: string
  category: { id: string; name: string }
}

export interface ProductInput {
  categoryId: string
  productCode: string
  name: string
  defaultUnit: StockUnit
  reservedThreshold: number
}

// ─── Categories ─────────────────────────────────────────────────────────────

export function useProductCategories() {
  return useQuery({
    queryKey: ['product-categories'],
    queryFn: async () => {
      const res = await api.get<{ categories: ProductCategory[] }>('/products/categories')
      return res.data.categories
    },
    staleTime: 30_000,
  })
}

export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string }) => {
      const res = await api.post<ProductCategory>('/products/categories', input)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-categories'] })
    },
  })
}

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/products/categories/${id}`)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-categories'] })
    },
  })
}

// ─── Products ───────────────────────────────────────────────────────────────

export function useProducts(filters?: { categoryId?: string }) {
  return useQuery({
    queryKey: ['products', filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.categoryId) params.set('categoryId', filters.categoryId)
      const qs = params.toString()
      const res = await api.get<{ products: Product[] }>(`/products${qs ? `?${qs}` : ''}`)
      return res.data.products
    },
    staleTime: 10_000,
  })
}

export function useCreateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ProductInput) => {
      const res = await api.post<Product>('/products', input)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['stock-summary'] })
    },
  })
}

export function useUpdateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<ProductInput> }) => {
      const res = await api.put<Product>(`/products/${id}`, input)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['stock-summary'] })
    },
  })
}

export function useDeleteProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/products/${id}`)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['stock-summary'] })
    },
  })
}
