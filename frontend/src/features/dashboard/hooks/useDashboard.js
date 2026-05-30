// src/features/dashboard/hooks/useDashboard.js

import { useQuery } from '@tanstack/react-query'
import { fetchDashboardSummary, fetchSalesTrend } from '../api/dashboardApi'

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: fetchDashboardSummary,
    staleTime: 1000 * 60,
  })
}

export function useSalesTrend(period) {
  return useQuery({
    queryKey: ['sales-trend', period],
    queryFn: () => fetchSalesTrend(period),
    staleTime: 1000 * 60,
  })
}