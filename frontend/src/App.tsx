import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UserRole } from '@dom/shared'
import Login from './pages/Login'
import ScanLogin from './pages/ScanLogin'
import Inbound from './pages/Inbound'
import InboundScan from './pages/InboundScan'
import PickerAdmin from './pages/PickerAdmin'
import PickerAdminScan from './pages/PickerAdminScan'
import PickerMobile from './pages/PickerMobile'
import PackerAdmin from './pages/PackerAdmin'
import PackerAdminScan from './pages/PackerAdminScan'
import PackerMobile from './pages/PackerMobile'
import PackedReport from './pages/PackedReport'
import OutboundBoard from './pages/OutboundBoard'
import OutboundReport from './pages/OutboundReport'
import OldOrdersReport from './pages/OldOrdersReport'
import OutboundScan from './pages/OutboundScan'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import Archive from './pages/Archive'
import Reports from './pages/Reports'
import SalesDashboard from './pages/SalesDashboard'
import SalesEntry from './pages/SalesEntry'
import SalesOrders from './pages/SalesOrders'
import MarketingReport from './pages/MarketingReport'
import IncidentReport from './pages/IncidentReport'
import ReturnCancel from './pages/ReturnCancel'
import ReturnScanMobile from './pages/ReturnScanMobile'
import Products from './pages/inventory/Products'
import InventoryItems from './pages/inventory/InventoryItems'
import Warehouses from './pages/inventory/Warehouses'
import StockSummary from './pages/inventory/StockSummary'
import StockOut from './pages/inventory/StockOut'
import StockScan from './pages/StockScan'
import AccReport from './pages/accounting/AccReport'
import AccInvoices from './pages/accounting/AccInvoices'
import AccPurchases from './pages/accounting/AccPurchases'
import AccContacts from './pages/accounting/AccContacts'
import InvoiceForm from './pages/accounting/InvoiceForm'
import PurchaseForm from './pages/accounting/PurchaseForm'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/shared/AppLayout'
import { useAuthStore } from './stores/authStore'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

// Role-aware root route: ADMIN/INBOUND_ADMIN see the Dashboard at `/`,
// every other role gets sent to their own home so they don't dead-end on
// `/unauthorized` when an active session lands on the bare domain.
function RootRoute() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.role === UserRole.ADMIN || user.role === UserRole.INBOUND_ADMIN || user.role === UserRole.WAREHOUSE_ADMIN) {
    return <AppLayout><Dashboard /></AppLayout>
  }
  const homeByRole: Record<string, string> = {
    [UserRole.PICKER_ADMIN]: '/picker-admin',
    [UserRole.PACKER_ADMIN]: '/packer-admin',
    [UserRole.PICKER]: '/picker',
    [UserRole.PACKER]: '/packer',
    [UserRole.SALES_AGENT]: '/sales',
    [UserRole.STOCK_KEEPER]: '/stock/scan',
    [UserRole.RETURN_SCANNER]: '/returns/scan',
    [UserRole.OUTBOUND_ADMIN]: '/outbound',
    [UserRole.INCIDENT_REPORTER]: '/incident-report',
    [UserRole.ACCOUNTANT]: '/accounting',
  }
  return <Navigate to={homeByRole[user.role] ?? '/login'} replace />
}

// Placeholder pages — will be replaced in later phases
function PlaceholderPage({ title }: { title: string }) {
  const user = useAuthStore((s) => s.user)
  return (
    <div className="panel-root">
      <header className="panel-header">
        <div className="panel-header-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
              {title}
            </h1>
            <span style={{
              fontSize: '11px', fontWeight: 600, color: '#f59e0b',
              background: '#fef9c3', padding: '2px 8px', borderRadius: '9999px',
            }}>
              Coming Soon
            </span>
          </div>
          <span style={{ fontSize: '13px', color: '#64748b' }}>
            {user?.username} · {user?.role?.replace(/_/g, ' ')}
          </span>
        </div>
      </header>
      <main className="panel-body">
        <div className="empty-state">
          <div className="empty-state-icon">🚧</div>
          <p className="empty-state-title">This page is under construction</p>
          <p className="empty-state-desc">This section will be available in a future release.</p>
        </div>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/scan" element={<ScanLogin />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.INBOUND_ADMIN, UserRole.WAREHOUSE_ADMIN, UserRole.OUTBOUND_ADMIN]}>
                <AppLayout><Inbound /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/picker-admin"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.PICKER_ADMIN, UserRole.WAREHOUSE_ADMIN, UserRole.OUTBOUND_ADMIN]}>
                <AppLayout><PickerAdmin /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/packer-admin"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.PACKER_ADMIN, UserRole.WAREHOUSE_ADMIN, UserRole.OUTBOUND_ADMIN]}>
                <AppLayout><PackerAdmin /></AppLayout>
              </ProtectedRoute>
            }
          />
          {/* Packed Report — the former Outbound page, now under Packer Admin */}
          <Route
            path="/packed-report"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.PACKER_ADMIN, UserRole.WAREHOUSE_ADMIN]}>
                <AppLayout><PackedReport /></AppLayout>
              </ProtectedRoute>
            }
          />
          {/* Independent Outbound module — Admin + Outbound Admin only */}
          <Route
            path="/outbound"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.OUTBOUND_ADMIN]}>
                <AppLayout><OutboundBoard /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/outbound/report"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.OUTBOUND_ADMIN]}>
                <AppLayout><OutboundReport /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/outbound/report/old-orders"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.OUTBOUND_ADMIN]}>
                <AppLayout><OldOrdersReport /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/outbound/scan"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.OUTBOUND_ADMIN]}>
                <OutboundScan />
              </ProtectedRoute>
            }
          />
          <Route
            path="/returns"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN, UserRole.INBOUND_ADMIN]}>
                <AppLayout><ReturnCancel /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/returns/scan"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.RETURN_SCANNER]}>
                <ReturnScanMobile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/archive"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN]}>
                <AppLayout><Archive /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.INBOUND_ADMIN, UserRole.PICKER_ADMIN, UserRole.PACKER_ADMIN, UserRole.WAREHOUSE_ADMIN]}>
                <AppLayout><Reports /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                <AppLayout><Settings /></AppLayout>
              </ProtectedRoute>
            }
          />
          {/* Handheld scan pages — no sidebar, role-protected */}
          <Route
            path="/inbound-scan"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.INBOUND_ADMIN, UserRole.WAREHOUSE_ADMIN]}>
                <InboundScan />
              </ProtectedRoute>
            }
          />
          <Route
            path="/picker-admin-scan"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.PICKER_ADMIN, UserRole.WAREHOUSE_ADMIN]}>
                <PickerAdminScan />
              </ProtectedRoute>
            }
          />
          <Route
            path="/packer-admin-scan"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.PACKER_ADMIN, UserRole.WAREHOUSE_ADMIN]}>
                <PackerAdminScan />
              </ProtectedRoute>
            }
          />
          {/* Mobile routes — no sidebar */}
          <Route
            path="/picker"
            element={
              <ProtectedRoute allowedRoles={[UserRole.PICKER]}>
                <PickerMobile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/packer"
            element={
              <ProtectedRoute allowedRoles={[UserRole.PACKER]}>
                <PackerMobile />
              </ProtectedRoute>
            }
          />
          {/* Sales Agent module — independent of warehouse pipeline */}
          <Route
            path="/sales"
            element={
              <ProtectedRoute allowedRoles={[UserRole.SALES_AGENT]}>
                <AppLayout><SalesDashboard /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/sales/entry"
            element={
              <ProtectedRoute allowedRoles={[UserRole.SALES_AGENT]}>
                <AppLayout><SalesEntry /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/sales/orders"
            element={
              <ProtectedRoute allowedRoles={[UserRole.SALES_AGENT]}>
                <AppLayout><SalesOrders /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/marketing-report"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SALES_AGENT]}>
                <AppLayout><MarketingReport /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/incident-report"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN, UserRole.INCIDENT_REPORTER]}>
                <AppLayout><IncidentReport /></AppLayout>
              </ProtectedRoute>
            }
          />
          {/* Accounting module — independent of the order pipeline */}
          <Route
            path="/accounting"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.ACCOUNTANT]}>
                <AppLayout><AccReport /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/accounting/sales"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.ACCOUNTANT]}>
                <AppLayout><AccInvoices /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/accounting/expenses"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.ACCOUNTANT]}>
                <AppLayout><AccPurchases /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/accounting/contacts"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.ACCOUNTANT]}>
                <AppLayout><AccContacts /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/accounting/sales/new"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.ACCOUNTANT]}>
                <AppLayout><InvoiceForm /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/accounting/sales/:id/edit"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.ACCOUNTANT]}>
                <AppLayout><InvoiceForm /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/accounting/expenses/new"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.ACCOUNTANT]}>
                <AppLayout><PurchaseForm /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/accounting/expenses/:id/edit"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.ACCOUNTANT]}>
                <AppLayout><PurchaseForm /></AppLayout>
              </ProtectedRoute>
            }
          />
          {/* Inventory module — Product / Inventory / Warehouse / Stock */}
          <Route
            path="/inventory"
            element={<Navigate to="/inventory/stock" replace />}
          />
          <Route
            path="/inventory/products"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN]}>
                <AppLayout><Products /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory/items"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN]}>
                <AppLayout><InventoryItems /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory/warehouses"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN]}>
                <AppLayout><Warehouses /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory/stock"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN]}>
                <AppLayout><StockSummary /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory/stock-out"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN]}>
                <AppLayout><StockOut /></AppLayout>
              </ProtectedRoute>
            }
          />
          {/* Legacy /stock routes redirect into the new module */}
          <Route path="/stock" element={<Navigate to="/inventory/stock" replace />} />
          <Route path="/stock/create" element={<Navigate to="/inventory/items" replace />} />
          <Route
            path="/stock/scan"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.STOCK_KEEPER, UserRole.WAREHOUSE_ADMIN]}>
                <StockScan />
              </ProtectedRoute>
            }
          />
          <Route
            path="/unauthorized"
            element={<PlaceholderPage title="403 — Forbidden" />}
          />
          <Route path="/" element={<RootRoute />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
