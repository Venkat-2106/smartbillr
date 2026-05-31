// src/features/products/api/productsApi.js
// OPTIMIZED: fetchProducts now accepts `search` param — backend handles filtering.
// No more limit=500 pattern.

import api from '../../../api/axios'

export async function fetchProducts({ page = 1, limit = 20, search = '' } = {}) {
  const params = { page, limit }
  if (search && search.trim()) params.search = search.trim()
  const res = await api.get('/products/', { params })
  return res.data
}

export async function fetchProduct(prodId) {
  const res = await api.get(`/products/${prodId}`)
  return res.data
}

export async function createProduct(payload) {
  const res = await api.post('/products/', payload)
  return res.data
}

export async function updateProduct(prodId, payload) {
  const res = await api.put(`/products/${prodId}`, payload)
  return res.data
}

export async function deleteProduct(prodId) {
  const res = await api.delete(`/products/${prodId}`)
  return res.data
}
