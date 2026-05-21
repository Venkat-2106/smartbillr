import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import DashboardLayout from './layouts/DashboardLayout'
import LoginPage from '../features/auth/pages/LoginPage'
import ProtectedRoute from '../features/auth/components/ProtectedRoute'

// ─── Premium "Coming Soon" placeholder ───────────────────
// Used for pages not yet built. Looks like a real page — not a dev stub.
function ComingSoon({ name }) {
  return (
    <div style={{ animation: 'fadeUp 0.22s cubic-bezier(0.22,1,0.36,1) both' }}>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Page header */}
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

      {/* Main card */}
      <div style={{
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: 18,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.05)',
        overflow: 'hidden',
      }}>

        {/* Fake toolbar */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid #F1F5F9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          {/* Search skeleton */}
          <div style={{
            height: 36, width: 240,
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: 9,
          }} />
          {/* Button skeleton */}
          <div style={{
            height: 36, width: 120,
            background: 'linear-gradient(135deg, #4F46E5, #6366F1)',
            borderRadius: 9,
            opacity: 0.15,
          }} />
        </div>

        {/* Empty state */}
        <div style={{
          padding: '80px 32px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}>
          {/* Icon circle */}
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

          {/* Step badge */}
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

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>

        {/* Public route */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected routes — all wrapped in DashboardLayout */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"        element={<ComingSoon name="Dashboard" />} />
          <Route path="sales"            element={<ComingSoon name="Sales" />} />
          <Route path="sales/new"        element={<ComingSoon name="Create Sale" />} />
          <Route path="purchases"        element={<ComingSoon name="Purchases" />} />
          <Route path="payments"         element={<ComingSoon name="Payments" />} />
          <Route path="customers"        element={<ComingSoon name="Customers" />} />
          <Route path="suppliers"        element={<ComingSoon name="Suppliers" />} />
          <Route path="products"         element={<ComingSoon name="Products" />} />
          <Route path="categories"       element={<ComingSoon name="Categories" />} />
          <Route path="stock"            element={<ComingSoon name="Stock" />} />
          <Route path="expenses"         element={<ComingSoon name="Expenses" />} />
          <Route path="sales-returns"    element={<ComingSoon name="Sales Returns" />} />
          <Route path="purchase-returns" element={<ComingSoon name="Purchase Returns" />} />
          <Route path="reports"          element={<ComingSoon name="Reports" />} />
          <Route path="settings"         element={<ComingSoon name="Settings" />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />

      </Routes>
    </BrowserRouter>
  )
}
