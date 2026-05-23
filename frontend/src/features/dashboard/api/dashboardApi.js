// src/features/dashboard/api/dashboardApi.js
//
// FIX: Changed Promise.all → Promise.allSettled
//
// WHY:
//   Promise.all rejects immediately if ANY request fails.
//   Staff users get 403 on /expenses/ and (old) /stock/alerts.
//   One 403 caused the entire dashboard to show "⚠️ Could not load data".
//
//   Promise.allSettled waits for all requests to finish regardless.
//   Each result has { status: 'fulfilled' | 'rejected', value / reason }.
//   We safely extract data only from fulfilled requests.
//   Rejected requests (permission denied) simply contribute zero/empty values.
//
// RESULT:
//   Staff dashboard now loads correctly.
//   Metrics that staff can't see just show 0 instead of crashing the page.
//
// ADDED: fetchSalesTrend(period) — builds chart data from /sales/ response.
//   All roles can call /sales/ so this works for admin, manager, and staff.

import api from '../../../api/axios'

export async function fetchDashboardSummary() {
  // Fire all 5 requests in parallel — allSettled means one failure = no crash
  const [salesRes, customersRes, productsRes, alertsRes, expensesRes] =
    await Promise.allSettled([
      api.get('/sales/'),
      api.get('/customers/'),
      api.get('/products/'),
      api.get('/stock/alerts'),
      api.get('/expenses/'),
    ])

  // Helper: safely extract .data from a settled result
  // If the request failed (403 or network error), returns null
  const getData = (settled) =>
    settled.status === 'fulfilled' ? settled.value.data : null

  const salesData     = getData(salesRes)
  const customersData = getData(customersRes)
  const productsData  = getData(productsRes)
  const alertsData    = getData(alertsRes)
  const expensesData  = getData(expensesRes)

  const sales    = salesData?.items    || []
  const expenses = expensesData?.items || []
  const alerts   = alertsData?.items   || []

  return {
    totalRevenue:    sales.reduce((sum, s) => sum + parseFloat(s.sales_final_amount || 0), 0),
    totalInvoices:   salesData?.pagination?.total    || 0,
    totalCustomers:  customersData?.pagination?.total || 0,
    totalProducts:   productsData?.pagination?.total  || 0,
    pendingPayments: sales.filter(s => s.sales_payment_status === 'partial').length,
    lowStockAlerts:  alerts.filter(a => a.alert_status === 'unread').length,
    totalExpenses:   expenses.reduce((sum, e) => sum + parseFloat(e.expense_amount || 0), 0),
    recentSales:     sales.slice(0, 5),
  }
}

// ─── Sales Trend ──────────────────────────────────────────────────────────────
// Fetches /sales/ and counts invoices raised per period (weekly / monthly / yearly).
// Accessible by all roles because /sales/ is a shared endpoint.
//
// WHY invoice count (not revenue):
//   Revenue requires financial permission (admin only).
//   Invoice count is neutral — it tells all roles "how busy was the store".
//   The /sales/ list does not expose sale_item_quantity per item without
//   calling /sales/{id} for each sale (too many requests).
//   Invoice count is the cleanest qty-style metric available from this endpoint.
//
// Returns: Array of { label: string, value: number } sorted oldest → newest.
//   weekly  → last 7 days,  one point per day   (Mon, Tue … Sun)
//   monthly → last 6 months, one point per month (Jan, Feb …)
//   yearly  → last 5 years,  one point per year  (2021, 2022 …)

export async function fetchSalesTrend(period = 'weekly') {
  const res = await api.get('/sales/')
  const sales = res.data?.items || []

  const now = new Date()

  if (period === 'weekly') {
    // Build slots for the last 7 days (today included)
    const slots = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      slots.push({
        label: d.toLocaleDateString('en-IN', { weekday: 'short' }), // Mon, Tue …
        key: d.toISOString().slice(0, 10), // YYYY-MM-DD
        value: 0,
      })
    }
    // Count invoices per day slot
    sales.forEach(s => {
      const day = s.sales_created_at?.slice(0, 10)
      const slot = slots.find(sl => sl.key === day)
      if (slot) slot.value += 1
    })
    return slots.map(({ label, value }) => ({ label, value }))
  }

  if (period === 'monthly') {
    // Last 6 months including current
    const slots = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      slots.push({
        label: d.toLocaleDateString('en-IN', { month: 'short' }), // Jan, Feb …
        year: d.getFullYear(),
        month: d.getMonth(), // 0-indexed
        value: 0,
      })
    }
    // Count invoices per month slot
    sales.forEach(s => {
      const d = new Date(s.sales_created_at)
      if (isNaN(d)) return
      const slot = slots.find(sl => sl.year === d.getFullYear() && sl.month === d.getMonth())
      if (slot) slot.value += 1
    })
    return slots.map(({ label, value }) => ({ label, value }))
  }

  if (period === 'yearly') {
    // Last 5 years including current
    const slots = []
    for (let i = 4; i >= 0; i--) {
      const yr = now.getFullYear() - i
      slots.push({ label: String(yr), year: yr, value: 0 })
    }
    // Count invoices per year slot
    sales.forEach(s => {
      const yr = new Date(s.sales_created_at).getFullYear()
      const slot = slots.find(sl => sl.year === yr)
      if (slot) slot.value += 1
    })
    return slots.map(({ label, value }) => ({ label, value }))
  }

  return []
}