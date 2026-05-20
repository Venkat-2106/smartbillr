import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from '../features/auth/pages/LoginPage'

function ComingSoon({ name }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', fontFamily: 'Inter, sans-serif',
      background: 'var(--color-background)',
    }}>
      <div style={{
        background: 'var(--color-card)', padding: '2rem 3rem',
        borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-md)', textAlign: 'center',
      }}>
        <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🚧</p>
        <h2 style={{ color: 'var(--color-text-primary)', fontWeight: '700', fontSize: '1.1rem' }}>
          {name}
        </h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
          Coming soon — under construction
        </p>
      </div>
    </div>
  )
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Auth */}
        <Route path="/login" element={<LoginPage />} />

        {/* App routes — placeholders for now */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<ComingSoon name="Dashboard" />} />
        <Route path="/categories" element={<ComingSoon name="Categories" />} />
        <Route path="/products" element={<ComingSoon name="Products" />} />
        <Route path="/customers" element={<ComingSoon name="Customers" />} />
        <Route path="/suppliers" element={<ComingSoon name="Suppliers" />} />
        <Route path="/sales" element={<ComingSoon name="Sales" />} />
        <Route path="/sales/new" element={<ComingSoon name="Create Sale" />} />
        <Route path="/purchases" element={<ComingSoon name="Purchases" />} />
        <Route path="/payments" element={<ComingSoon name="Payments" />} />
        <Route path="/expenses" element={<ComingSoon name="Expenses" />} />
        <Route path="/stock" element={<ComingSoon name="Stock" />} />
        <Route path="/reports" element={<ComingSoon name="Reports" />} />
        <Route path="/settings" element={<ComingSoon name="Settings" />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}