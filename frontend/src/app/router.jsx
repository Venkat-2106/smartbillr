// src/app/router.jsx
//
// CHANGES FROM EXISTING:
//   1. Added /unauthorized route (public — anyone can land here)
//   2. Sensitive routes now wrapped in ProtectedRoute with permission prop
//      instead of all routes sharing one global ProtectedRoute
//   3. ComingSoon component and all other routes unchanged
//   4. Added /staff route (was missing)
//   5. Step 5.13 — /customers now uses real CustomersPage (was ComingSoon)

import React, { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Spinner } from '../shared/components'
import DashboardLayout from './layouts/DashboardLayout'
import LoginPage from '../features/auth/pages/LoginPage'
import ResetPasswordPage from '../features/auth/pages/ResetPasswordPage'
import UnauthorizedPage from '../features/auth/pages/UnauthorizedPage'
import ProtectedRoute from '../features/auth/components/ProtectedRoute'


// FIX 5: React.lazy — each page loads only when first visited.
// ComingSoon is defined inline in this file so it cannot be lazy-loaded.
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


// ─── Premium "Coming Soon" placeholder ───────────────────────────────────────
// Unchanged from existing — kept exactly as-is
function ComingSoon({ name }) {
  return (
    <div style={{ animation: 'fadeUp 0.22s cubic-bezier(0.22,1,0.36,1) both' }}>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontSize: 28, fontWeight: 800, color: 'var(--text-primary)',
          letterSpacing: '-0.5px', margin: 0, marginBottom: 6,
        }}>
          {name}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
          Manage your {name.toLowerCase()} from here
        </p>
      </div>

      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 18,
        boxShadow: 'var(--shadow-card)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <div style={{
            height: 36, width: 240,
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            borderRadius: 9,
          }} />
          <div style={{
            height: 36, width: 120,
            background: 'linear-gradient(135deg, var(--accent-600), var(--accent-500))',
            borderRadius: 9,
            opacity: 0.15,
          }} />
        </div>

        <div style={{
          padding: '80px 32px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}>
          <div style={{
            width: 72, height: 72,
            borderRadius: '50%',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2rem',
            marginBottom: 4,
          }}>
            🚧
          </div>

          <div>
            <h3 style={{
              fontSize: 16, fontWeight: 700,
              color: 'var(--text-primary)', margin: 0, marginBottom: 6,
            }}>
              {name} — Coming Soon
            </h3>
            <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
              This page is under construction.<br />
              Backend APIs are ready — UI coming in next step.
            </p>
          </div>

          <div style={{
            marginTop: 8,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--accent-50)',
            border: '1px solid var(--accent-ring)',
            borderRadius: 99,
            padding: '5px 14px',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-600)' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-600)' }}>
              Phase 5 — In Progress
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Router ───────────────────────────────────────────────────────────────────
export default function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <Spinner size={32} />
        </div>
      }>
      <Routes>

        {/* Public routes — no auth needed */}
        <Route path="/login"          element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/unauthorized"   element={<UnauthorizedPage />} />

        {/* Protected routes — all inside DashboardLayout */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />

          {/* ── All roles ──────────────────────────────────────────────── */}
          <Route path="dashboard" element={<DashboardPage />} />
          <Route
            path="payments"
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
              <ProtectedRoute permission="sales.view">
                <CreateSalePage />
              </ProtectedRoute>
            }
          />

          {/* ── Step 5.13 — Customers (real page, was ComingSoon) ──────── */}
          <Route
            path="customers"
            element={
              <ProtectedRoute permission="customers.manage">
                <CustomersPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="products"
            element={
              <ProtectedRoute permission="products.view">
                <ProductsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="stock"
            element={
              <ProtectedRoute permission="stock.view">
                <StockPage />
              </ProtectedRoute>
            }
          />
          {/* Sales returns — all roles (staff can only see their own, enforced backend) */}
          <Route path="sales-returns" element={<ComingSoon name="Sales Returns" />} />

          {/* ── Manager + Admin ────────────────────────────────────────── */}
          <Route
            path="purchases"
            element={
              <ProtectedRoute permission="purchases.view">
                <PurchasesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="purchases/new"
            element={
              <ProtectedRoute permission="purchases.view">
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
            path="categories"
            element={
              <ProtectedRoute permission="products.view">
                <CategoriesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="expenses"
            element={
              <ProtectedRoute permission="expenses.manage">
                <ComingSoon name="Expenses" />
              </ProtectedRoute>
            }
          />
          <Route
            path="purchase-returns"
            element={
              <ProtectedRoute permission="purchase_returns.manage">
                <ComingSoon name="Purchase Returns" />
              </ProtectedRoute>
            }
          />
          <Route
            path="reports"
            element={
              <ProtectedRoute permission="reports.view">
                <ComingSoon name="Reports" />
              </ProtectedRoute>
            }
          />

          {/* ── Admin only ─────────────────────────────────────────────── */}
          <Route
            path="settings"
            element={
              <ProtectedRoute permission="settings.manage">
                <ComingSoon name="Settings" />
              </ProtectedRoute>
            }
          />
          <Route
            path="staff"
            element={
              <ProtectedRoute permission="staff.manage">
                <ComingSoon name="Staff" />
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