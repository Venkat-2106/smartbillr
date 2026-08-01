import React, { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Spinner } from '../shared/components'
import DashboardLayout from './layouts/DashboardLayout'
import LoginPage from '../features/auth/pages/LoginPage'
import SignupPage from '../features/auth/pages/SignupPage'
import ResetPasswordPage from '../features/auth/pages/ResetPasswordPage'
import UnauthorizedPage from '../features/auth/pages/UnauthorizedPage'
import ProtectedRoute from '../features/auth/components/ProtectedRoute'
import AdminProtectedRoute from '../features/admin/components/AdminProtectedRoute'
import LandingPage from '../features/public/pages/LandingPage'

const DashboardPage  = React.lazy(() => import('../features/dashboard/pages/DashboardPage'))
const CategoriesPage = React.lazy(() => import('../features/categories/pages/CategoriesPage'))
const ProductsPage   = React.lazy(() => import('../features/products/pages/ProductsPage'))
const CustomersPage  = React.lazy(() => import('../features/customers/pages/CustomersPage'))
const SuppliersPage  = React.lazy(() => import('../features/suppliers/pages/SuppliersPage'))
const SalesPage      = React.lazy(() => import('../features/sales/pages/SalesPage'))
const CreateSalePage = React.lazy(() => import('../features/sales/pages/CreateSalePage'))
const PaymentsPage   = React.lazy(() => import('../features/payments/pages/PaymentsPage'))
const PurchasesPage  = React.lazy(() => import('../features/purchases/pages/PurchasesPage'))
const CreatePurchasePage = React.lazy(() => import('../features/purchases/pages/CreatePurchasePage'))
const StockPage = React.lazy(() => import('../features/stock/pages/StockPage'))
const ExpensesPage = React.lazy(() => import('../features/expenses/pages/ExpensesPage'))
const SalesReturnsPage = React.lazy(() => import('../features/salesReturns/pages/SalesReturnsPage'))
const PurchaseReturnsPage = React.lazy(() => import('../features/purchaseReturns/pages/PurchaseReturnsPage'))
const SettingsPage = React.lazy(() => import('../features/settings/pages/SettingsPage'))
const SubscriptionPage = React.lazy(() => import('../features/subscription/pages/SubscriptionPage'))
const StaffPage = React.lazy(() => import('../features/staff/pages/StaffPage'))
const ReportsPage = React.lazy(() => import('../features/reports/pages/ReportsPage'))
const UserGuidePage = React.lazy(() => import('../features/help/pages/UserGuidePage'))

const PricingPage = React.lazy(() => import('../features/billing/pages/PricingPage'))
const BillingSuccessPage = React.lazy(() => import('../features/billing/pages/BillingSuccessPage'))

const DashboardLayoutAdmin   = React.lazy(() => import('./layouts/admin/AdminDashboardLayout'))
const AdminLoginPage         = React.lazy(() => import('../features/admin/pages/AdminLoginPage'))
const AdminBusinessesPage    = React.lazy(() => import('../features/admin/pages/AdminBusinessesPage'))
const AdminBusinessDetailPage = React.lazy(() => import('../features/admin/pages/AdminBusinessDetailPage'))

// ─── Router ───────────────────────────────────────────────────────────────────
export default function AppRouter() {
  return (
    <BrowserRouter>
      {/* Outer Suspense boundary for lazy routes that don't live inside
          DashboardLayout (which has its own local Suspense around <Outlet/>).
          This covers: PricingPage, BillingSuccessPage, AdminLoginPage,
          DashboardLayoutAdmin → AdminBusinessesPage / AdminBusinessDetailPage. */}
      <Suspense fallback={
        <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spinner />
        </div>
      }>
      <Routes>

        {/* Public routes — no auth needed */}
        <Route path="/"               element={<LandingPage />} />
        <Route path="/login"          element={<LoginPage />} />
        <Route path="/signup"         element={<SignupPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/unauthorized"   element={<UnauthorizedPage />} />
        <Route path="/subscription"   element={<SubscriptionPage />} />
        <Route path="/pricing"        element={<PricingPage />} />
        <Route path="/billing/success" element={<BillingSuccessPage />} />
        <Route path="/user-guide"     element={<UserGuidePage />} />

        {/* Super admin routes — separate from business tenant flow */}
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route
          element={
            <AdminProtectedRoute>
              <DashboardLayoutAdmin />
            </AdminProtectedRoute>
          }
        >
          <Route path="/admin/businesses" element={<AdminBusinessesPage />} />
          <Route path="/admin/businesses/:id" element={<AdminBusinessDetailPage />} />
        </Route>

        {/* Protected routes — all inside DashboardLayout */}
        <Route
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route
            path="/payments"
            element={
              <ProtectedRoute permission="payments.manage">
                <PaymentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sales"
            element={
              <ProtectedRoute permission="sales.view">
                <SalesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sales/new"
            element={
              <ProtectedRoute permission="sales.create">
                <CreateSalePage />
              </ProtectedRoute>
            }
          />

          {/* ── Step 5.13 — Customers (real page, was ComingSoon) ──────── */}
          <Route
            path="/customers"
            element={
              <ProtectedRoute permission="customers.manage">
                <CustomersPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/products"
            element={
              <ProtectedRoute permission="products.view">
                <ProductsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/stock"
            element={
              <ProtectedRoute permission="stock.view">
                <StockPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sales-returns"
            element={
              <ProtectedRoute permission="sales_returns.manage">
                <SalesReturnsPage />
              </ProtectedRoute>
            }
          />

          {/* ── Manager + Admin ────────────────────────────────────────── */}
          <Route
            path="/purchases"
            element={
              <ProtectedRoute permission="purchases.view">
                <PurchasesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/purchases/new"
            element={
              <ProtectedRoute permission="purchases.create">
                <CreatePurchasePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/suppliers"
            element={
              <ProtectedRoute permission="suppliers.manage">
                <SuppliersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/categories"
            element={
              <ProtectedRoute permission="products.view">
                <CategoriesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/expenses"
            element={
              <ProtectedRoute permission="expenses.manage">
                <ExpensesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/purchase-returns"
            element={
              <ProtectedRoute permission="purchase_returns.manage">
                <PurchaseReturnsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute permission="reports.view">
                <ReportsPage />
              </ProtectedRoute>
            }
          />

          {/* ── Admin only ─────────────────────────────────────────────── */}
          <Route
            path="/settings"
            element={
              <ProtectedRoute permission="settings.manage">
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff"
            element={
              <ProtectedRoute permission="staff.manage">
                <StaffPage />
              </ProtectedRoute>
            }
          />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />

      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}