import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import type {
  AccCustomer, AccVendor, AccItem, AccCategory, AccStore, AccSale, AccExpense,
  AccInvoiceAttachment, AccAttachmentCategory,
  AccCompanyProfile, AccPaginated, AccSalesAgent,
  AccSalesReport, AccExpenseReport, AccCatalogKind,
  AccLedger, AccSalesLedgerRow, AccExpenseLedgerRow,
  AccSalesStats, AccPaymentInput, AccPaymentLedgerRow,
  AccReceivablesOverview, AccCustomerStatement, AccExpensesStats, AccExpenseDuplicate,
  AccVendorStatement,
} from '@dom/shared'
import { api } from './client'

/** 'sales' or 'expenses' — the URL segment the attachment lives under. */
export type AttachmentResource = 'sales' | 'expenses'

const BASE = '/accounting'
export const PESO = '₱'
export function money(n: number): string {
  return PESO + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const clean = (o: Record<string, any>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null))

// Authenticated PDF download. A plain <a>/window.open navigation sends Accept: text/html,
// which nginx rewrites to the SPA fallback (→ login screen) instead of proxying to the
// backend. Fetch as a blob through the api client (carries the auth cookie) and save it.
// Mirrors the incident module's downloadIncidentPdf (see SOLUTIONS.md [2026-05-02] / [2026-06-03]).
export async function downloadInvoicePdf(id: string, invoiceNo: string) {
  const res = await api.get(`${BASE}/sales/${id}/pdf`, { responseType: 'blob' })
  const url = window.URL.createObjectURL(res.data as Blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(invoiceNo || id).replace(/\//g, '-')}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

// ─── Master data ────────────────────────────────────────────────────────────
export function useCustomers() {
  return useQuery({ queryKey: ['acc', 'customers'], queryFn: async () => (await api.get<AccCustomer[]>(`${BASE}/customers`)).data, staleTime: 5 * 60_000 })
}
export function useSaveCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: any) => input.id ? (await api.put(`${BASE}/customers/${input.id}`, input)).data : (await api.post(`${BASE}/customers`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['acc', 'customers'] }),
  })
}
export function useDeleteCustomer() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: async (id: string) => (await api.delete(`${BASE}/customers/${id}`)).data, onSuccess: () => qc.invalidateQueries({ queryKey: ['acc', 'customers'] }) })
}

export function useVendors() {
  return useQuery({ queryKey: ['acc', 'vendors'], queryFn: async () => (await api.get<AccVendor[]>(`${BASE}/vendors`)).data })
}
export function useSaveVendor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: any) => input.id ? (await api.put(`${BASE}/vendors/${input.id}`, input)).data : (await api.post(`${BASE}/vendors`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['acc', 'vendors'] }),
  })
}
export function useDeleteVendor() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: async (id: string) => (await api.delete(`${BASE}/vendors/${id}`)).data, onSuccess: () => qc.invalidateQueries({ queryKey: ['acc', 'vendors'] }) })
}

// Items — kind-scoped (Sales vs Expense catalogs are independent)
export function useItems(kind: AccCatalogKind) {
  return useQuery({ queryKey: ['acc', 'items', kind], queryFn: async () => (await api.get<AccItem[]>(`${BASE}/items`, { params: { kind } })).data, staleTime: 5 * 60_000 })
}
export function useCreateItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; unitCost?: number | null; kind: AccCatalogKind }) => (await api.post(`${BASE}/items`, input)).data,
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['acc', 'items', v.kind] }),
  })
}

// Categories — kind-scoped; EXPENSE entries carry nested `subcategories`
export function useCategories(kind: AccCatalogKind) {
  return useQuery({ queryKey: ['acc', 'categories', kind], queryFn: async () => (await api.get<AccCategory[]>(`${BASE}/categories`, { params: { kind } })).data, staleTime: 5 * 60_000 })
}
export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; kind: AccCatalogKind; parentId?: string | null }) => (await api.post(`${BASE}/categories`, input)).data,
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['acc', 'categories', v.kind] }),
  })
}
export function useUpdateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; name: string }) => (await api.put(`${BASE}/categories/${input.id}`, { name: input.name })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['acc', 'categories'] }),
  })
}
export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: async (id: string) => (await api.delete(`${BASE}/categories/${id}`)).data, onSuccess: () => qc.invalidateQueries({ queryKey: ['acc', 'categories'] }) })
}

// Stores (Invoice store dropdown) — managed list seeded from SALES_STORES
export function useStores() {
  return useQuery({ queryKey: ['acc', 'stores'], queryFn: async () => (await api.get<AccStore[]>(`${BASE}/stores`)).data, staleTime: 5 * 60_000 })
}
export function useCreateStore() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: async (input: { name: string }) => (await api.post(`${BASE}/stores`, input)).data, onSuccess: () => qc.invalidateQueries({ queryKey: ['acc', 'stores'] }) })
}
export function useSalesAgents() {
  return useQuery({ queryKey: ['acc', 'sales-agents'], queryFn: async () => (await api.get<AccSalesAgent[]>(`${BASE}/sales-agents`)).data, staleTime: 5 * 60_000 })
}
/** Sales list filter options: active agents + names found on invoices. */
export function useSalesAgentNames() {
  return useQuery({ queryKey: ['acc', 'sales', 'agent-names'], queryFn: async () => (await api.get<string[]>(`${BASE}/sales-agent-names`)).data, staleTime: 5 * 60_000 })
}

// ─── Invoices (Sales) ─────────────────────────────────────────────────────────
export interface SaleFilters {
  from?: string; to?: string; status?: string; late?: boolean; customerId?: string; saleChannel?: string
  salesAgent?: string; store?: string // snapshot names; 'none' = not set on the invoice
  search?: string; page?: number; pageSize?: number
}
export function useSales(filters: SaleFilters) {
  const params = clean({ ...filters, late: filters.late ? '1' : undefined })
  return useQuery({ queryKey: ['acc', 'sales', filters], queryFn: async () => (await api.get<AccPaginated<AccSale>>(`${BASE}/sales`, { params })).data, placeholderData: keepPreviousData, staleTime: 15_000 })
}
// Stats take the list's filters minus the status tab: date only → reconciles with the
// Report tab; with customer / agent / store / search → totals what the table shows.
export type SaleScope = Omit<SaleFilters, 'status' | 'late' | 'page' | 'pageSize'>
export function useSalesStats(p: SaleScope = {}) {
  return useQuery({ queryKey: ['acc', 'sales', 'stats', p], queryFn: async () => (await api.get<AccSalesStats>(`${BASE}/sales/stats`, { params: clean(p) })).data, staleTime: 15_000, placeholderData: keepPreviousData })
}

// ─── Payments against an invoice (v2.99.0) or an expense (v2.101.0) ─────────
// Both mutations answer with the refreshed record; it is written straight into the
// detail cache so the page updates from one response, then lists/stats refetch.
export type PaymentResource = 'sales' | 'expenses'
type PayRecord = AccSale | AccExpense
function afterPayment(qc: ReturnType<typeof useQueryClient>, resource: PaymentResource, id: string, rec: PayRecord) {
  qc.setQueryData(['acc', resource === 'sales' ? 'sale' : 'expense', id], rec)
  qc.invalidateQueries({ queryKey: ['acc', resource] })
  qc.invalidateQueries({ queryKey: ['acc', 'ledger'] })
  // The Overview (under 'sales') also shows what is owed to vendors.
  if (resource === 'expenses') qc.invalidateQueries({ queryKey: ['acc', 'sales', 'receivables'] })
}
export function useRecordPayment(resource: PaymentResource, id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: AccPaymentInput) => (await api.post<PayRecord>(`${BASE}/${resource}/${id}/payments`, input)).data,
    onSuccess: (rec) => afterPayment(qc, resource, id, rec),
  })
}
export function useVoidPayment(resource: PaymentResource, id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { paymentId: string; reason: string }) => (await api.post<PayRecord>(`${BASE}/${resource}/${id}/payments/${p.paymentId}/void`, { reason: p.reason })).data,
    onSuccess: (rec) => afterPayment(qc, resource, id, rec),
  })
}
export function useSale(id?: string) {
  return useQuery({ queryKey: ['acc', 'sale', id], enabled: !!id, queryFn: async () => (await api.get<AccSale>(`${BASE}/sales/${id}`)).data })
}
export function useNextInvoiceNo(enabled: boolean) {
  return useQuery({ queryKey: ['acc', 'sales', 'next'], enabled, queryFn: async () => (await api.get<{ invoiceNo: string }>(`${BASE}/sales/next-number`)).data })
}
export function useSaveSale() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: any) => input.id ? (await api.put(`${BASE}/sales/${input.id}`, input)).data : (await api.post(`${BASE}/sales`, input)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['acc', 'sales'] }); qc.invalidateQueries({ queryKey: ['acc', 'sale'] })
      qc.invalidateQueries({ queryKey: ['acc', 'report'] }); qc.invalidateQueries({ queryKey: ['acc', 'customers'] })
      qc.invalidateQueries({ queryKey: ['acc', 'ledger'] })
    },
  })
}
export function useDeleteSale() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: async (id: string) => (await api.delete(`${BASE}/sales/${id}`)).data, onSuccess: () => { qc.invalidateQueries({ queryKey: ['acc', 'sales'] }); qc.invalidateQueries({ queryKey: ['acc', 'report'] }); qc.invalidateQueries({ queryKey: ['acc', 'deleted'] }) } })
}

// ─── Purchases (Expenses) ──────────────────────────────────────────────────────
export interface ExpenseFilters { from?: string; to?: string; status?: string; late?: boolean; country?: string; vendorId?: string; category?: string; subcategory?: string; search?: string; page?: number; pageSize?: number }
export function useExpenses(filters: ExpenseFilters) {
  const params = clean({ ...filters, late: filters.late ? '1' : undefined })
  return useQuery({ queryKey: ['acc', 'expenses', filters], queryFn: async () => (await api.get<AccPaginated<AccExpense>>(`${BASE}/expenses`, { params })).data, placeholderData: keepPreviousData, staleTime: 15_000 })
}
export type ExpenseScope = Omit<ExpenseFilters, 'status' | 'late' | 'page' | 'pageSize'>
export function useExpensesStats(p: ExpenseScope = {}) {
  return useQuery({ queryKey: ['acc', 'expenses', 'stats', p], queryFn: async () => (await api.get<AccExpensesStats>(`${BASE}/expenses/stats`, { params: clean(p) })).data, staleTime: 15_000, placeholderData: keepPreviousData })
}
/** Possible double entries for the expense being typed (warning only). */
export function useExpenseDuplicates(p: { vendorName?: string; total?: number; dateIssued?: string; invoiceNumber?: string; excludeId?: string }, enabled: boolean) {
  return useQuery({
    queryKey: ['acc', 'expenses', 'duplicates', p],
    enabled,
    queryFn: async () => (await api.get<AccExpenseDuplicate[]>(`${BASE}/expenses/duplicates`, { params: clean({ ...p }) })).data,
    staleTime: 10_000,
  })
}
export function useExpense(id?: string) {
  return useQuery({ queryKey: ['acc', 'expense', id], enabled: !!id, queryFn: async () => (await api.get<AccExpense>(`${BASE}/expenses/${id}`)).data })
}
export function useNextPurchaseNo(enabled: boolean) {
  return useQuery({ queryKey: ['acc', 'expenses', 'next'], enabled, queryFn: async () => (await api.get<{ purchaseNo: string }>(`${BASE}/expenses/next-number`)).data })
}
export function useSaveExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: any) => input.id ? (await api.put(`${BASE}/expenses/${input.id}`, input)).data : (await api.post(`${BASE}/expenses`, input)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['acc', 'expenses'] }); qc.invalidateQueries({ queryKey: ['acc', 'expense'] })
      qc.invalidateQueries({ queryKey: ['acc', 'report'] }); qc.invalidateQueries({ queryKey: ['acc', 'ledger'] })
      qc.invalidateQueries({ queryKey: ['acc', 'sales', 'receivables'] })
    },
  })
}
export function useDeleteExpense() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: async (id: string) => (await api.delete(`${BASE}/expenses/${id}`)).data, onSuccess: () => { qc.invalidateQueries({ queryKey: ['acc', 'expenses'] }); qc.invalidateQueries({ queryKey: ['acc', 'report'] }); qc.invalidateQueries({ queryKey: ['acc', 'deleted'] }) } })
}

// ─── Invoice attachments (Sales + Expenses — photo or PDF) ──────────────────
// Every read goes through the api client so the auth header rides along. A bare
// <img src="/accounting/..."> or window.open() sends no credentials and gets nginx's
// SPA fallback (→ login screen) instead of the file. See downloadInvoicePdf above.
export function useAttachments(resource: AttachmentResource, recordId: string | undefined, category: AccAttachmentCategory) {
  return useQuery({
    queryKey: ['acc', resource, recordId, 'attachments', category],
    enabled: !!recordId,
    queryFn: async () => (await api.get<{ attachments: AccInvoiceAttachment[] }>(`${BASE}/${resource}/${recordId}/attachments`, { params: { category } })).data.attachments,
  })
}

export async function uploadAttachment(resource: AttachmentResource, recordId: string, category: AccAttachmentCategory, file: File, paymentId?: string): Promise<AccInvoiceAttachment> {
  const form = new FormData()
  form.append('file', file, file.name)
  const res = await api.post<AccInvoiceAttachment>(`${BASE}/${resource}/${recordId}/attachments`, form, { params: paymentId ? { category, paymentId } : { category } })
  return res.data
}

export function useUploadAttachment(resource: AttachmentResource, recordId: string | undefined, category: AccAttachmentCategory) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => uploadAttachment(resource, recordId!, category, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['acc', resource, recordId, 'attachments', category] }),
  })
}

/** Replaces the file behind an existing attachment in place — same id, new content, category unchanged. */
export async function replaceAttachment(resource: AttachmentResource, recordId: string, attId: string, file: File): Promise<AccInvoiceAttachment> {
  const form = new FormData()
  form.append('file', file, file.name)
  const res = await api.put<AccInvoiceAttachment>(`${BASE}/${resource}/${recordId}/attachments/${attId}`, form)
  return res.data
}

export function useReplaceAttachment(resource: AttachmentResource, recordId: string | undefined, category: AccAttachmentCategory) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ attId, file }: { attId: string; file: File }) => replaceAttachment(resource, recordId!, attId, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['acc', resource, recordId, 'attachments', category] }),
  })
}

export function useDeleteAttachment(resource: AttachmentResource, recordId: string | undefined, category: AccAttachmentCategory) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (attId: string) => (await api.delete(`${BASE}/${resource}/${recordId}/attachments/${attId}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['acc', resource, recordId, 'attachments', category] }),
  })
}

/** Caller owns the returned object URL and must revokeObjectURL it. */
export async function fetchAttachmentBlobUrl(resource: AttachmentResource, recordId: string, attId: string): Promise<string> {
  const res = await api.get(`${BASE}/${resource}/${recordId}/attachments/${attId}`, { responseType: 'blob' })
  return window.URL.createObjectURL(res.data as Blob)
}

export async function downloadAttachment(resource: AttachmentResource, recordId: string, att: AccInvoiceAttachment) {
  const url = await fetchAttachmentBlobUrl(resource, recordId, att.id)
  const a = document.createElement('a')
  a.href = url
  a.download = att.originalName || `invoice-${att.id.slice(0, 8)}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

// ─── Recycle Bin (soft-deleted Sales / Expenses) ────────────────────────────
export function useDeletedSales() {
  return useQuery({ queryKey: ['acc', 'deleted', 'sales'], queryFn: async () => (await api.get<AccSale[]>(`${BASE}/deleted/sales`)).data })
}
export function useDeletedExpenses() {
  return useQuery({ queryKey: ['acc', 'deleted', 'expenses'], queryFn: async () => (await api.get<AccExpense[]>(`${BASE}/deleted/expenses`)).data })
}
function invalidateSalesAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['acc', 'sales'] }); qc.invalidateQueries({ queryKey: ['acc', 'report'] })
  qc.invalidateQueries({ queryKey: ['acc', 'ledger'] }); qc.invalidateQueries({ queryKey: ['acc', 'deleted'] })
}
function invalidateExpensesAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['acc', 'expenses'] }); qc.invalidateQueries({ queryKey: ['acc', 'report'] })
  qc.invalidateQueries({ queryKey: ['acc', 'ledger'] }); qc.invalidateQueries({ queryKey: ['acc', 'deleted'] })
}
export function useRestoreSale() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: async (id: string) => (await api.post(`${BASE}/sales/${id}/restore`)).data, onSuccess: () => invalidateSalesAll(qc) })
}
export function useRestoreExpense() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: async (id: string) => (await api.post(`${BASE}/expenses/${id}/restore`)).data, onSuccess: () => invalidateExpensesAll(qc) })
}
export function usePurgeSale() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: async (id: string) => (await api.delete(`${BASE}/deleted/sales/${id}`)).data, onSuccess: () => qc.invalidateQueries({ queryKey: ['acc', 'deleted'] }) })
}
export function usePurgeExpense() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: async (id: string) => (await api.delete(`${BASE}/deleted/expenses/${id}`)).data, onSuccess: () => qc.invalidateQueries({ queryKey: ['acc', 'deleted'] }) })
}

// ─── Company + Report ───────────────────────────────────────────────────────────
export function useCompany() {
  return useQuery({ queryKey: ['acc', 'company'], queryFn: async () => (await api.get<AccCompanyProfile>(`${BASE}/company`)).data })
}
export function useSaveCompany() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: async (form: FormData) => (await api.put(`${BASE}/company`, form, { headers: { 'Content-Type': 'multipart/form-data' } })).data, onSuccess: () => qc.invalidateQueries({ queryKey: ['acc', 'company'] }) })
}
export interface SalesReportParams { from?: string; to?: string }
export function useSalesReport(p: SalesReportParams) {
  return useQuery({
    queryKey: ['acc', 'report', 'sales', p],
    queryFn: async () => (await api.get<AccSalesReport>(`${BASE}/report/sales`, { params: clean(p as any) })).data,
  })
}
export interface ExpenseReportParams { from?: string; to?: string; country?: string; vendorId?: string; category?: string; subcategory?: string }
export function useExpenseReport(p: ExpenseReportParams) {
  return useQuery({
    queryKey: ['acc', 'report', 'expenses', p],
    queryFn: async () => (await api.get<AccExpenseReport>(`${BASE}/report/expenses`, { params: clean(p as any) })).data,
  })
}

// ─── Export: every row behind the current list filters (v2.102.0) ────────────
// Pages through the same list endpoint the table uses (200 a page), so the export holds
// exactly what the filters show — never a different query. Capped at 50 pages.
async function fetchAllPages<T>(path: string, params: Record<string, unknown>): Promise<T[]> {
  const out: T[] = []
  for (let page = 1; page <= 50; page++) {
    const res = (await api.get<AccPaginated<T>>(`${BASE}${path}`, { params: { ...params, page, pageSize: 200 } })).data
    out.push(...res.items)
    if (out.length >= res.total || res.items.length === 0) break
  }
  return out
}
export function fetchAllSales(f: SaleFilters) {
  return fetchAllPages<AccSale>('/sales', clean({ ...f, page: undefined, pageSize: undefined, late: f.late ? '1' : undefined }))
}
export function fetchAllExpenses(f: ExpenseFilters) {
  return fetchAllPages<AccExpense>('/expenses', clean({ ...f, page: undefined, pageSize: undefined, late: f.late ? '1' : undefined }))
}

// ─── Receivables + customer statement (v2.100.0) ─────────────────────────────
export function useReceivablesOverview() {
  return useQuery({
    queryKey: ['acc', 'sales', 'receivables'],
    queryFn: async () => (await api.get<AccReceivablesOverview>(`${BASE}/receivables/overview`)).data,
    staleTime: 30_000,
  })
}
export function useCustomerStatement(customerId: string | undefined, p: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ['acc', 'sales', 'statement', customerId, p],
    enabled: !!customerId,
    queryFn: async () => (await api.get<AccCustomerStatement>(`${BASE}/customers/${customerId}/statement`, { params: clean(p) })).data,
    placeholderData: keepPreviousData,
  })
}
/** Blob download for the same reason as downloadInvoicePdf (nginx SPA fallback on html navigations). */
export async function downloadStatementPdf(customerId: string, name: string, p: { from?: string; to?: string }) {
  const res = await api.get(`${BASE}/customers/${customerId}/statement/pdf`, { params: clean(p), responseType: 'blob' })
  const url = window.URL.createObjectURL(res.data as Blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Statement-${name.replace(/[^A-Za-z0-9 _-]/g, '').trim().replace(/\s+/g, '-') || 'customer'}${p.to ? `-${p.to}` : ''}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

// ─── Vendor statement (v2.103.0) — under 'expenses' so expense saves/payments refresh it
export function useVendorStatement(vendorId: string | undefined, p: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ['acc', 'expenses', 'statement', vendorId, p],
    enabled: !!vendorId,
    queryFn: async () => (await api.get<AccVendorStatement>(`${BASE}/vendors/${vendorId}/statement`, { params: clean(p) })).data,
    placeholderData: keepPreviousData,
  })
}
export async function downloadVendorStatementPdf(vendorId: string, name: string, p: { from?: string; to?: string }) {
  const res = await api.get(`${BASE}/vendors/${vendorId}/statement/pdf`, { params: clean(p), responseType: 'blob' })
  const url = window.URL.createObjectURL(res.data as Blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Vendor-Statement-${name.replace(/[^A-Za-z0-9 _-]/g, '').trim().replace(/\s+/g, '-') || 'vendor'}${p.to ? `-${p.to}` : ''}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

// ─── Transactions ledger (flat per-line-item rows) ───────────────────────────
export interface LedgerParams { from?: string; to?: string }
export function useSalesLedger(p: LedgerParams, enabled = true) {
  return useQuery({
    queryKey: ['acc', 'ledger', 'sales', p],
    enabled,
    queryFn: async () => (await api.get<AccLedger<AccSalesLedgerRow>>(`${BASE}/ledger/sales`, { params: clean(p as any) })).data,
    placeholderData: keepPreviousData, staleTime: 15_000,
  })
}
export function usePaymentsLedger(p: LedgerParams, kind: 'sale' | 'expense' = 'sale', enabled = true) {
  return useQuery({
    queryKey: ['acc', 'ledger', 'payments', kind, p],
    enabled,
    queryFn: async () => (await api.get<AccLedger<AccPaymentLedgerRow>>(`${BASE}/ledger/payments`, { params: { ...clean(p as any), kind } })).data,
    placeholderData: keepPreviousData, staleTime: 15_000,
  })
}
export function useExpenseLedger(p: LedgerParams, enabled = true) {
  return useQuery({
    queryKey: ['acc', 'ledger', 'expenses', p],
    enabled,
    queryFn: async () => (await api.get<AccLedger<AccExpenseLedgerRow>>(`${BASE}/ledger/expenses`, { params: clean(p as any) })).data,
    placeholderData: keepPreviousData, staleTime: 15_000,
  })
}
