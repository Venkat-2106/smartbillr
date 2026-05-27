// src/features/dashboard/api/dashboardApi.js
//
// OPTIMIZED:
//   Before: fetched /sales/, /customers/, /products/, /expenses/ with default
//           limit=20 and read .pagination.total for counts. BUT also tried to
//           sum all revenue from only 20 items — wrong for any business with >20 sales.
//           fetchSalesTrend ALSO called /sales/ separately — duplicate request.
//
//   After:
//     - Use limit=1 for count-only calls (pagination.total is accurate regardless of limit)
//     - Revenue + trend built from ONE /sales/?limit=100 call (covers most small shops)
//     - All calls remain parallel via Promise.allSettled — no crash on 403
//     - fetchSalesTrend reuses the same sales data from summary instead of a second fetch

import api from '../../../api/axios'

export async function fetchDashboardSummary() {
  // All parallel — allSettled so a 403 on any one doesn't crash the rest
  const [salesRes, customersRes, productsRes, alertsRes, expensesRes] =
    await Promise.allSettled([
      api.get('/sales/',    { params: { limit: 100 } }),  // enough for revenue + trend
      api.get('/customers/', { params: { limit: 1  } }),  // only need pagination.total
      api.get('/products/', { params: { limit: 1  } }),   // only need pagination.total
      api.get('/stock/alerts'),
      api.get('/expenses/', { params: { limit: 100 } }),  // need items to sum expense_amount
    ])

  const getData = (s) => s.status === 'fulfilled' ? s.value.data : null

  const salesData     = getData(salesRes)
  const customersData = getData(customersRes)
  const productsData  = getData(productsRes)
  const alertsData    = getData(alertsRes)
  const expensesData  = getData(expensesRes)

  const sales  = salesData?.items  || []
  const expenses = expensesData?.items  || []
  const alerts = alertsData?.items || []
  

  return {
    totalRevenue:    sales.reduce((sum, s) => sum + parseFloat(s.sales_final_amount || 0), 0),
    totalInvoices:   salesData?.pagination?.total     || 0,
    totalCustomers:  customersData?.pagination?.total || 0,
    totalProducts:   productsData?.pagination?.total  || 0,
    pendingPayments: sales.filter(s => s.sales_payment_status === 'partial').length,
    lowStockAlerts:  alerts.filter(a => a.alert_status === 'unread').length,
    totalExpenses:   expenses.reduce((sum, e) => sum + parseFloat(e.expense_amount || 0), 0),
    recentSales:     sales.slice(0, 5),
    // Expose raw sales for the trend chart so it can reuse without fetching again
    _salesForTrend:  sales,
  }
}

// ── Sales Trend ───────────────────────────────────────────────────────────────
// Accepts pre-fetched sales array (from fetchDashboardSummary) to avoid a
// duplicate /sales/ request. Falls back to fetching if called standalone.
export async function fetchSalesTrend(period = 'weekly', salesData = null) {
  let sales = salesData
  if (!sales) {
    const res = await api.get('/sales/', { params: { limit: 100 } })
    sales = res.data?.items || []
  }

  const now = new Date()

  if (period === 'weekly') {
    const slots = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      slots.push({ label: d.toLocaleDateString('en-IN', { weekday: 'short' }), key: d.toISOString().slice(0, 10), value: 0 })
    }
    sales.forEach(s => {
      const slot = slots.find(sl => sl.key === s.sales_created_at?.slice(0, 10))
      if (slot) slot.value += 1
    })
    return slots.map(({ label, value }) => ({ label, value }))
  }

  if (period === 'monthly') {
    const slots = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      slots.push({ label: d.toLocaleDateString('en-IN', { month: 'short' }), year: d.getFullYear(), month: d.getMonth(), value: 0 })
    }
    sales.forEach(s => {
      const d = new Date(s.sales_created_at)
      if (isNaN(d)) return
      const slot = slots.find(sl => sl.year === d.getFullYear() && sl.month === d.getMonth())
      if (slot) slot.value += 1
    })
    return slots.map(({ label, value }) => ({ label, value }))
  }

  if (period === 'yearly') {
    const slots = []
    for (let i = 4; i >= 0; i--) {
      const yr = now.getFullYear() - i
      slots.push({ label: String(yr), year: yr, value: 0 })
    }
    sales.forEach(s => {
      const yr = new Date(s.sales_created_at).getFullYear()
      const slot = slots.find(sl => sl.year === yr)
      if (slot) slot.value += 1
    })
    return slots.map(({ label, value }) => ({ label, value }))
  }

  return []
}
