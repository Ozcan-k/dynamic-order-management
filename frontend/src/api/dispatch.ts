import { api } from './client'
import { Platform, Carrier, DispatchSource } from '@dom/shared'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface DispatchRow {
  id: string
  trackingNumber: string
  source: DispatchSource
  platform: Platform
  carrier: Carrier
  shopName: string
  orderId: string | null
  createdAt: string
  createdBy: { username: string }
}

export interface OrderLookupResult {
  found: boolean
  platform: Platform | null
  shopName: string | null
  carrierName: string | null
}

export interface ShopCount {
  shopName: string
  count: number
}

export interface CarrierGroup {
  carrierName: string
  totalOrders: number
  shops: ShopCount[]
}

export interface DispatchStats {
  total: number
  inHouse: number
  external: number
  historical: boolean
}

export interface DispatchReportRow {
  carrier: string
  total: number
  inHouse: number
  external: number
}

export interface DispatchReport {
  carriers: DispatchReportRow[]
  totals: { total: number; inHouse: number; external: number }
}

export interface CreateDispatchInput {
  trackingNumber: string
  source: DispatchSource
  platform: Platform
  carrier: Carrier
  shopName?: string
}

// ─── Calls ──────────────────────────────────────────────────────────────────────

export async function lookupOrder(trackingNumber: string): Promise<OrderLookupResult> {
  const res = await api.get<OrderLookupResult>('/dispatch/lookup', { params: { trackingNumber } })
  return res.data
}

export async function createDispatch(input: CreateDispatchInput): Promise<DispatchRow> {
  const res = await api.post<DispatchRow>('/dispatch', input)
  return res.data
}

export async function getDispatchGrouped(date?: string): Promise<CarrierGroup[]> {
  const res = await api.get<CarrierGroup[]>('/dispatch/grouped', { params: date ? { date } : {} })
  return res.data
}

export async function getDispatchStats(date?: string): Promise<DispatchStats> {
  const res = await api.get<DispatchStats>('/dispatch/stats', { params: date ? { date } : {} })
  return res.data
}

export async function getDispatchReport(from?: string, to?: string): Promise<DispatchReport> {
  const res = await api.get<DispatchReport>('/dispatch/report', { params: { from, to } })
  return res.data
}
