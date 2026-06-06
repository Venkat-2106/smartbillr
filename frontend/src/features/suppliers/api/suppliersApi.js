// src/features/suppliers/api/suppliersApi.js
//
// EXPORT FIX — 2026-06-06
// ─────────────────────────────────────────────────────────────────────────────
// PROBLEM:
//   fetchSuppliers() used limit=100. Same issue as Customers — businesses with
//   > 100 suppliers had records silently truncated in both the table and export.
//
// FIX:
//   Raised limit to 10000. Backend le cap raised to 10000 in pagination.py.
// ─────────────────────────────────────────────────────────────────────────────

import api from '../../../api/axios'

// ── GET ALL SUPPLIERS ─────────────────────────────────────────────────────────
// limit=10000 — full dataset for client-side filter/sort/paginate + CSV export.
export const fetchSuppliers = async () => {
  const res = await api.get('/suppliers', { params: { limit: 10000 } })
  const data = res.data
  if (Array.isArray(data))         return data
  if (Array.isArray(data?.items))  return data.items
  return []
}

export const fetchSupplier = async (id) => {
  const res = await api.get(`/suppliers/${id}`)
  return res.data
}

export const createSupplier = async (body) => {
  const res = await api.post('/suppliers', body)
  return res.data
}

export const updateSupplier = async (id, body) => {
  const res = await api.put(`/suppliers/${id}`, body)
  return res.data
}

export const deleteSupplier = async (id) => {
  const res = await api.delete(`/suppliers/${id}`)
  return res.data
}
