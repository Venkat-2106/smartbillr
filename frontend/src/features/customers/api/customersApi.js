// features/customers/api/customersApi.js
//
// All API calls for the Customers feature.
//
// RULES (from architecture):
//   - Every call goes through the axios instance (has auth interceptor)
//   - Use res.data NOT res.data.data (backend has no double wrapper)
//   - Backend paginated response shape: { items: [...], pagination: {...} }
//   - Backend single-item response: the object directly
//   - Never import authStore here — auth is handled by the axios interceptor

import api from '../../../api/axios'

// ── GET ALL CUSTOMERS ──────────────────────────────────────────────────────
// FIX (Bug 3): Added limit=100 param.
// Without this, the backend defaults to limit=20 — only the first 20 customers
// are returned. Client-side filter/sort/pagination then silently operates on
// only those 20 records, missing the rest.
// Backend supports up to limit=100 (paginate() le=100 cap).

export async function fetchCustomers() {
  const res = await api.get('/customers', { params: { limit: 100 } })

  // Handle both possible shapes from backend
  if (Array.isArray(res.data))         return res.data          // flat array
  if (Array.isArray(res.data?.items))  return res.data.items    // paginated shape
  return []
}


// ── GET SINGLE CUSTOMER (detail + summary + sales history) ─────────────────
// FIX (Bug 2): Added this function — required by useCustomer() hook.
// CustomerDetailDrawer calls useCustomer(custId) which calls this.
// Backend returns: { cust_id, cust_name, ..., summary: {...}, sales_history: [...] }

export async function fetchCustomer(custId) {
  const res = await api.get(`/customers/${custId}`)
  return res.data
}


// ── CREATE CUSTOMER ────────────────────────────────────────────────────────
// POST /customers
//
// Fields sent to backend:
//   cust_name          (required)
//   cust_phone         (optional)
//   cust_email         (optional)
//   cust_address       (optional)
//   cust_country_code  (optional, e.g. 'IN', 'US')
//   cust_state         (optional, e.g. 'Tamil Nadu')
//   cust_tax_number    (optional, e.g. GSTIN / VAT number)

export async function createCustomer(payload) {
  const res = await api.post('/customers', payload)
  return res.data
}


// ── UPDATE CUSTOMER ────────────────────────────────────────────────────────
// PUT /customers/{cust_id}
//
// Same fields as create — sends only the updated data.
// Backend uses the cust_id from the URL, NOT from the body.

export async function updateCustomer(id, payload) {
  const res = await api.put(`/customers/${id}`, payload)
  return res.data
}


// ── DELETE CUSTOMER (SOFT DELETE) ─────────────────────────────────────────
// DELETE /customers/{cust_id}
//
// Backend does NOT remove the row — it sets is_deleted = true.
// This preserves the customer record for sales history.

export async function deleteCustomer(id) {
  const res = await api.delete(`/customers/${id}`)
  return res.data
}