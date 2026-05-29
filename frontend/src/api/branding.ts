import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

export interface Branding {
  id: string | null
  companyName: string
  hasLogo: boolean
  logoMime: string | null
  updatedAt: string | null
}

export function useBranding() {
  return useQuery({
    queryKey: ['branding'],
    queryFn: async () => (await api.get<Branding>('/branding')).data,
    staleTime: 60_000,
  })
}

export function useUpdateBranding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ companyName, logo }: { companyName: string; logo: File | null }) => {
      const form = new FormData()
      form.append('companyName', companyName)
      if (logo) form.append('logo', logo)
      const res = await api.post<Branding>('/branding', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branding'] })
    },
  })
}

export function brandingLogoUrl(updatedAt: string | null): string {
  // Cache-busting query param so editing the logo refreshes the image
  return `/branding/logo${updatedAt ? `?v=${encodeURIComponent(updatedAt)}` : ''}`
}
