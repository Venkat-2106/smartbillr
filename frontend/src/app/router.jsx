// src/app/router.jsx
//
// CHANGES FROM EXISTING:
//   1. Added /unauthorized route (public — anyone can land here)
//   2. Sensitive routes now wrapped in ProtectedRoute with permission prop
//      instead of all routes sharing one global ProtectedRoute
//   3. ComingSoon component and all other routes unchanged
//   4. Added /staff route (was missing)

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import DashboardLayout from './layouts/DashboardLayout'
import LoginPage from '../features/auth/pages/LoginPage'
import ResetPasswordPage from '../features/auth/pages/ResetPasswordPage'
import UnauthorizedPage from '../features/auth/pages/UnauthorizedPage'
import ProtectedRoute from '../features/auth/components/ProtectedRoute'
import DashboardPage from '../features/dashboard/pages/DashboardPage'

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
          fontSize: 28, fontWeight: 800, color: '#0F172A',
          letterSpacing: '-0.5px', margin: 0, marginBottom: 6,
        }}>
          {name}
        </h1>
        <p style={{ fontSize: 14, color: '#94A3B8', margin: 0 }}>
          Manage your {name.toLowerCase()} from here
        </p>
      </div>

      <div style={{
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: 18,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.05)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid #F1F5F9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <div style={{
            height: 36, width: 240,
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: 9,
          }} />
          <div style={{
            height: 36, width: 120,
            background: 'linear-gradient(135deg, #4F46E5, #6366F1)',
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
            background: '#F1F5F9',
            border: '1px solid #E2E8F0',
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
              color: '#0F172A', margin: 0, marginBottom: 6,
            }}>
              {name} — Coming Soon
            </h3>
            <p style={{ fontSize: 13.5, color: '#94A3B8', margin: 0, lineHeight: 1.6 }}>
              This page is under construction.<br />
              Backend APIs are ready — UI coming in next step.
            </p>
          </div>

          <div style={{
            marginTop: 8,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: '#EEF2FF',
            border: '1px solid rgba(79,70,229,0.2)',
            borderRadius: 99,
            padding: '5px 14px',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4F46E5' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#4F46E5' }}>
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
          <Route path="sales"     element={<ComingSoon name="Sales" />} />
          <Route path="sales/new" element={<ComingSoon name="Create Sale" />} />
          <Route path="payments"  element={<ComingSoon name="Payments" />} />
          <Route path="customers" element={<ComingSoon name="Customers" />} />
          <Route path="products"  element={<ComingSoon name="Products" />} />
          <Route path="stock"     element={<ComingSoon name="Stock" />} />

          {/* Sales returns — all roles (staff can only see their own, enforced backend) */}
          <Route path="sales-returns" element={<ComingSoon name="Sales Returns" />} />

          {/* ── Manager + Admin ────────────────────────────────────────── */}
          <Route
            path="purchases"
            element={
              <ProtectedRoute permission="purchases.view">
                <ComingSoon name="Purchases" />
              </ProtectedRoute>
            }
          />
          <Route
            path="suppliers"
            element={
              <ProtectedRoute permission="suppliers.manage">
                <ComingSoon name="Suppliers" />
              </ProtectedRoute>
            }
          />
          <Route
            path="categories"
            element={
              <ProtectedRoute permission="products.edit">
                <ComingSoon name="Categories" />
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
    </BrowserRouter>
  )
}