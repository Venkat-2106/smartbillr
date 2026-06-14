// src/features/dashboard/hooks/useDashboard.js
//
// NOTE — why there is no `enabled: !!user` guard here
// -----------------------------------------------------
// Seven other hooks in this codebase (useCustomers, useSuppliers, useCategories,
// useSales, useProducts, usePurchases, useStock) import useAuthStore and add
// `enabled: !!user` to their useQuery calls. That guard is intentionally
// omitted here, and the omission is correct — not an oversight.
//
// ProtectedRoute (src/features/auth/components/ProtectedRoute.jsx) wraps
// DashboardLayout and every nested page. It returns <Navigate to="/login" />
// if `!token || !profile`, so no protected page component — including
// DashboardPage — can mount until both fields are truthy.
//
// The Zustand `persist` middleware with localStorage (a synchronous adapter)
// hydrates the `sb-auth` store before React's first render, so `token`,
// `user`, and `profile` are all populated at the same instant. If
// ProtectedRoute has allowed DashboardPage to render, `user` is already
// truthy by definition — `enabled: !!user` would never be false here.
//
// The guard in the other 7 hooks is harmless but provably redundant for the
// same reason. Removing it from those hooks is a separate, lower-priority
// cleanup and is out of scope here.

import { useQuery } from '@tanstack/react-query'
import { fetchDashboardSummary, fetchSalesTrend } from '../api/dashboardApi'

// WHY 5 MINUTES:
//   Dashboard totals (revenue, invoice count, customer count) are aggregated
//   from the entire table by the backend in a single SQL query. They do not
//   change second-by-second. The global default in providers.jsx is already
//   5 * 60 * 1000 for the same reason.
//
//   The old value (1000 * 60 = 1 minute) caused the dashboard to re-fetch
//   from the server every time the user navigated away and came back within
//   a minute, even though nothing had changed.
//
//   5 minutes matches the global default and halves unnecessary API calls
//   to /dashboard/summary and /dashboard/trend.

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: fetchDashboardSummary,
    staleTime: 5 * 60 * 1000,   // FIX B: was 1000 * 60 (1 min) → now 5 min (matches global default)
  })
}

export function useSalesTrend(period) {
  return useQuery({
    queryKey: ['sales-trend', period],
    queryFn: () => fetchSalesTrend(period),
    staleTime: 5 * 60 * 1000,   // FIX B: was 1000 * 60 (1 min) → now 5 min (matches global default)
  })
}