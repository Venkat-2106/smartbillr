// src/features/dashboard/hooks/useDashboard.js
//
// ADDED: useSalesTrend(period) hook alongside the existing useDashboard hook.
// Architecture unchanged — React Query for all server data.

import { useQuery } from '@tanstack/react-query'
import { fetchDashboardSummary, fetchSalesTrend } from '../api/dashboardApi'

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: fetchDashboardSummary,
    staleTime: 1000 * 60, // cache for 60 seconds
  })
}

// ─── Sales Trend Hook ─────────────────────────────────────────────────────────
// period: 'weekly' | 'monthly' | 'yearly'
// queryKey includes period so React Query re-fetches when filter changes.

export function useSalesTrend(period) {
  return useQuery({
    queryKey: ['sales-trend', period],
    queryFn: () => fetchSalesTrend(period),
    staleTime: 1000 * 60,
  })
}