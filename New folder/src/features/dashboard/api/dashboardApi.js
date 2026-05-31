// src/features/dashboard/api/dashboardApi.js
//
// FIXED: Now calls the dedicated /dashboard/summary and /dashboard/trend
// endpoints instead of the old multi-fetch + JS aggregation approach.
//
// Backend returns snake_case keys directly — no mapping needed.
// DashboardPage.jsx already reads snake_case (data.total_revenue etc.)

import api from '../../../api/axios'

export async function fetchDashboardSummary() {
  const res = await api.get('/dashboard/summary')
  return res.data
}

export async function fetchSalesTrend(period = 'weekly') {
  const res = await api.get('/dashboard/trend', { params: { period } })
  return res.data
}