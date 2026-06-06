// src/features/customers/api/customersApi.js
//
// EXPORT FIX — 2026-06-06
// ─────────────────────────────────────────────────────────────────────────────
// PROBLEM:
//   fetchCustomers() used limit=100. Businesses with > 100 customers only
//   had the first 100 loaded into the hook, so both the table search AND the
//   CSV export silently missed all records beyond the 100th.
//
// FIX:
//   Raised limit to 10000. The backend paginate() le cap was raised to 10000
//   in this same fix (app/utils/pagination.py).
//
//   Customers uses the "full dataset loaded once" pattern (not lazy export)
//   because the table itself needs all records for client-side filter/sort.
//   10 000 customer rows returned as JSON is typically < 2 MB — acceptable
//   for a SaaS app targeting small retail businesses.
//
//   If customer counts grow very large (> 5 000), migrate to server-side
//   search + lazy export following the Sales page pattern.
// ─────────────────────────────────────────────────────────────────────────────

import api from '../../../api/axios'

// ── GET ALL CUSTOMERS ─────────────────────────────────────────────────────────
// limit=10000 — fetches the complete dataset so client-side filter/sort/paginate
// and CSV export both operate on ALL records, not just the first 100.
export async function fetchCustomers() {
  const res = await api.get('/customers', { params: { limit: 10000 } })

  if (Array.isArray(res.data))         return res.data
  if (Array.isArray(res.data?.items))  return res.data.items
  return []
}

// ── GET SINGLE CUSTOMER ───────────────────────────────────────────────────────
export async function fetchCustomer(custId) {
  const res = await api.get(`/customers/${custId}`)
  return res.data
}

// ── CREATE CUSTOMER ───────────────────────────────────────────────────────────
export async function createCustomer(payload) {
  const res = await api.post('/customers', payload)
  return res.data
}

// ── UPDATE CUSTOMER ───────────────────────────────────────────────────────────
export async function updateCustomer(id, payload) {
  const res = await api.put(`/customers/${id}`, payload)
  return res.data
}

// ── DELETE CUSTOMER (soft) ────────────────────────────────────────────────────
export async function deleteCustomer(id) {
  const res = await api.delete(`/customers/${id}`)
  return res.data
}
