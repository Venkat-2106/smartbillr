// src/features/payments/api/paymentsApi.js
//
// HTTP layer only — no authStore, no React state.
// All calls return res.data (success_response wraps data directly).
//
// Backend GET /payments returns is_active=true rows only (one per sale),
// enriched with invoice_no, customer_name, sales_final_amount,
// remaining_balance via JOINs with sales + customers tables.

import api from '../../../api/axios'

// ── GET paginated list of active payment snapshots ────────────────────────────
export async function fetchPayments({
  page      = 1,
  limit     = 20,
  search    = '',
  status    = '',
  sort_by   = 'payment_paid_at',
  sort_dir  = 'desc',
  date_from = '',
  date_to   = '',
} = {}) {
  const params = { page, limit }
  if (search.trim())  params.search    = search.trim()
  if (status)         params.status    = status
  if (sort_by)        params.sort_by   = sort_by
  if (sort_dir)       params.sort_dir  = sort_dir
  if (date_from)      params.date_from = date_from
  if (date_to)        params.date_to   = date_to

  const res = await api.get('/payments', { params })
  return res.data  // { items: [...], pagination: { total, page, ... } }
}

// ── LAZY EXPORT — all matching rows only when Export button is clicked ────────
export async function fetchAllPaymentsForExport({
  search    = '',
  status    = '',
  sort_by   = 'payment_paid_at',
  sort_dir  = 'desc',
  date_from = '',
  date_to   = '',
} = {}) {
  const params = { page: 1, limit: 10000 }
  if (search.trim())  params.search    = search.trim()
  if (status)         params.status    = status
  if (sort_by)        params.sort_by   = sort_by
  if (sort_dir)       params.sort_dir  = sort_dir
  if (date_from)      params.date_from = date_from
  if (date_to)        params.date_to   = date_to

  const res = await api.get('/payments', { params })
  return res.data?.items ?? []
}

// ── GET full payment history + summary for one sale ───────────────────────────
// Returns: { invoice_no, customer_name, sale_final_amount, total_paid,
//            remaining_balance, current_status, payment_history: [...] }
export async function fetchPaymentsBySale(saleId) {
  const res = await api.get(`/payments/sale/${saleId}`)
  return res.data
}

// ── POST — record a new payment installment ───────────────────────────────────
// Payload: { sale_id, payment_amount, payment_method }
export async function recordPayment(payload) {
  const res = await api.post('/payments', payload)
  return res.data
}
// ---- Payment summary (KPI cards) -----------------------------------------------------
export async function fetchPaymentSummary() {
  const res = await api.get('/payments/summary')
  return res.data
}
