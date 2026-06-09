// src/features/dashboard/hooks/useDashboard.js

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